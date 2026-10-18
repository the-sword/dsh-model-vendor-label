/**
 * dsh-model-vendor-label — browser half.
 *
 * What: put the MODEL ID where the model display name is shown on the Web UI:
 *
 *   1. the composer's model picker — trigger caption, root-menu current value,
 *      and every menu row — by taking over the single
 *      conversation.input.model.label slot;
 *   2. every other place that prints a model name, by overriding the effective
 *      model name in the client model catalog, so a consumer that reads
 *      entry.name also gets the id. The composer seat is also taken over, so
 *      the shipped picker renders painted entries (trigger title, aria labels,
 *      loading caption) instead of the names it captured.
 *
 * The catalog entry is PAINTED, not rewritten: the object itself keeps its
 * provider-chosen name under a private property, and only the presentation
 * field the shell renders (name) is overridden. Selection, history, and
 * routing read id/provider and are untouched; unloading restores every entry.
 *
 * Priority: the shipped "1017" label plugin occupies the same single slot. A
 * dynamically registered package is normally given a lower priority by the
 * runtime (which is the winner); an explicit value is passed below only for a
 * runtime that honors it instead, and any failure is downgraded to a warning
 * so the shipped label simply keeps rendering.
 *
 * Hand-written ModuleLoader bundle, matching the other local plugins in this
 * profile: no build step, React borrowed from the shell.
 */
window.__ModuleLoader__.load({
  id: 'dsh-model-vendor-label',
  factory: require => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const h = React.createElement

    /** Own property holding the provider-chosen name while an entry is painted. */
    const ORIGINAL_NAME = '__modelVendorLabelName'
    /** The single label slot the model picker renders through. */
    const LABEL_SLOT = 'conversation.input.model.label'
    /** The composer slot whose owner share hands the picker its catalog store. */
    const MODEL_SEAT = 'conversation.input.model'
    /** The shipped module that renders the picker itself. */
    const SHIPPED_PICKER_MODULE = '@deepseek-ai/dsh-client-ui-model-selection'
    /** Marker on the catalog accessor wrapper. */
    const PATCH = Symbol.for('dsh-model-vendor-label.directoryFor')
    /** Settings namespace: this plugin's Host loader row id. */
    const SETTINGS_NS = 'model-vendor-label'
    /** The persisted field that turns the rendering on and off. */
    const ENABLED_FIELD = 'enabled'
    /** Settings row seat inside the General section. */
    const SETTINGS_ROW = 'settings.general.item'
    /** Marker on the inject wrapper so it is installed once per context. */
    const INJECT_TRACKED = Symbol.for('dsh-model-vendor-label.inject')

    /**
     * Normalize one model id for display.
     * @param value - raw catalog id.
     * @returns the trimmed id, or '' when there is none.
     */
    function displayId(value) {
      return typeof value === 'string' ? value.trim() : ''
    }

    /**
     * Normalize one model display name.
     * @param value - raw catalog name.
     * @returns the trimmed name, or '' when there is none.
     */
    function displayName(value) {
      return typeof value === 'string' ? value.trim() : ''
    }

    /**
     * The text the UI shows for one catalog entry: the model id, or the
     * provider-chosen name when the entry has no id at all.
     * @param model - catalog entry of the shape { id, name }.
     * @returns the text to render.
     */
    function labelText(model) {
      const id = displayId(model?.id)
      if (id !== '') return id
      return displayName(model?.name)
    }

    /**
     * The label occupant. Receives the owner share { provider, model,
     * placement, selected } and renders the model id; the display name stays in
     * the title so it is one hover away.
     * @param props - owner share as passed by the model seat.
     * @returns the label element.
     */
    function ModelIdLabel({ model }) {
      const id = displayId(model?.id)
      const name = displayName(model?.name)
      return h(
        'span',
        {
          title: name === '' ? undefined : name,
          ...(id === '' ? {} : { 'data-model-id': id }),
        },
        labelText(model),
      )
    }

    /**
     * Paint one catalog entry so its rendered name is the model id.
     * @param entry - catalog entry.
     * @returns whether this call changed the entry.
     */
    function paintEntry(entry) {
      if (entry === null || typeof entry !== 'object') return false
      if (Object.hasOwn(entry, ORIGINAL_NAME)) return false
      const id = displayId(entry.id)
      if (id === '') return false
      Object.defineProperty(entry, ORIGINAL_NAME, {
        value: entry.name,
        writable: true,
        configurable: true,
        enumerable: false,
      })
      try {
        entry.name = id
      } catch {
        delete entry[ORIGINAL_NAME]
        return false
      }
      return true
    }

    /**
     * Undo paintEntry: put the provider-chosen name back and drop the
     * bookkeeping property, so an unloaded plugin leaves no trace.
     * @param entry - catalog entry previously painted by this module.
     * @returns whether this call changed the entry.
     */
    function restoreEntry(entry) {
      if (entry === null || typeof entry !== 'object') return false
      if (!Object.hasOwn(entry, ORIGINAL_NAME)) return false
      try {
        entry.name = entry[ORIGINAL_NAME]
        delete entry[ORIGINAL_NAME]
      } catch {
        return false
      }
      return true
    }

    /**
     * Paint every model entry of one group list.
     * @param groups - [{ provider, models }] groups, or anything shaped like that.
     * @returns painted entry count.
     */
    function paintGroups(groups) {
      let painted = 0
      if (!Array.isArray(groups)) return painted
      for (const group of groups) {
        const models = group?.models
        if (!Array.isArray(models)) continue
        for (const entry of models) if (paintEntry(entry)) painted += 1
      }
      return painted
    }

    /**
     * Every catalog entry this module may have painted: from the recorded
     * directory handles and from the live service handle.
     * @param ctx - client plugin context.
     * @returns the entries, deduplicated.
     */
    function paintedEntries(ctx) {
      const seen = new Set()
      const entries = []
      const collect = store => {
        if (store === null || typeof store !== 'object') return
        const groups = store.groups
        if (!Array.isArray(groups)) return
        for (const group of groups) {
          const models = group?.models
          if (!Array.isArray(models)) continue
          for (const entry of models) {
            if (seen.has(entry)) continue
            seen.add(entry)
            entries.push(entry)
          }
        }
      }
      for (const handle of handles) collect(handle?.store)
      let service
      try {
        service = ctx.modelDirectories
      } catch {
        service = undefined
      }
      if (service !== null && typeof service === 'object' && typeof service.directoryFor === 'function') {
        try {
          collect(catalogOf(service.directoryFor.call(service)) ?? service.directoryFor.call(service)?.store)
        } catch {
          // An unreachable catalog contributes nothing.
        }
      }
      return entries
    }

    /**
     * Whether an observed value looks like a model catalog store.
     * @param value - observed value.
     * @returns whether it carries .groups or .entries.
     */
    function looksLikeCatalog(value) {
      if (value === null || typeof value !== 'object') return false
      return Array.isArray(value.groups) || Array.isArray(value.entries)
    }

    /**
     * Find the catalog object behind a directory service handle.
     * @param directory - the value returned by ctx.modelDirectories.directoryFor(id).
     * @returns the catalog, or undefined.
     */
    function catalogOf(directory) {
      if (directory === null || typeof directory !== 'object') return undefined
      if (looksLikeCatalog(directory)) return directory
      if (looksLikeCatalog(directory.store)) return directory.store
      return undefined
    }

    /** Directory handles this module has seen, bounded. */
    const handles = []

    /**
     * Remember one directory handle for later repaint passes.
     * @param directory - directory service handle.
     */
    function remember(directory) {
      if (directory === null || typeof directory !== 'object') return
      if (handles.includes(directory) || handles.length >= 16) return
      handles.push(directory)
    }

    /**
     * Paint every catalog reachable from the known handles and the live service.
     * Cheap and idempotent: already-painted entries are skipped.
     * @param ctx - client plugin context.
     */
    function paintCatalogs(ctx) {
      const visit = value => {
        if (looksLikeCatalog(value)) paintGroups(value.groups)
      }
      for (const handle of handles) visit(handle?.store)
      let service
      try {
        service = ctx.modelDirectories
      } catch {
        service = undefined
      }
      if (service === null || typeof service !== 'object') return
      visit(service)
      const directoryFor = service.directoryFor
      if (typeof directoryFor !== 'function') return
      try {
        visit(directoryFor.call(service)?.store)
      } catch {
        // A catalog that is not ready yet is simply skipped.
      }
    }

    /**
     * Wrap the catalog service so every directoryFor() handle is painted as
     * soon as it exists.
     * @param ctx - client plugin context.
     * @returns whether the patch landed.
     */
    function patchModelDirectories(ctx) {
      let service
      try {
        service = ctx.modelDirectories
      } catch {
        return false
      }
      if (service === null || typeof service !== 'object') return false
      const original = service.directoryFor
      if (typeof original !== 'function') return false
      if (original[PATCH] === true) return true
      const patched = function directoryFor(...args) {
        const directory = original.apply(this, args)
        try {
          remember(directory)
          paintGroups(directory?.store?.groups)
        } catch {
          // Painting is best-effort; the accessor must behave as shipped.
        }
        return directory
      }
      patched[PATCH] = true
      try {
        service.directoryFor = patched
      } catch {
        return false
      }
      return true
    }

    /**
     * Read the shipped picker component from the live module table without
     * forcing a load.
     * @param ctx - client plugin context.
     * @returns the component, or undefined when the table is not reachable.
     */
    function shippedPicker(ctx) {
      try {
        const record = ctx.modules?.loadCache?.get?.(SHIPPED_PICKER_MODULE)
        const exported = record?.exports
        if (exported === null || typeof exported !== 'object') return undefined
        for (const name of ['ModelSelect', 'ComposerModelSelect', 'default']) {
          const candidate = exported[name]
          if (typeof candidate === 'function') return candidate
        }
        return undefined
      } catch {
        return undefined
      }
    }

    /** Explicit shadowing priorities: below every shipped occupant's 0. */
    const LABEL_PRIORITY = -16
    const SEAT_PRIORITY = -16

    /**
     * Occupy the model label slot with the id renderer.
     * @param ctx - client plugin context.
     */
    function mountLabel(ctx) {
      // Called directly (not through ctx.effect) so the switch can unmount it
      // again: returning the disposer lets the caller decide when the shipped
      // label takes its slot back. Local then return: a bare
      // `return ctx.slots.inject(...)` in this hand-written bundle has been
      // observed to evaluate to undefined.
      try {
        const occupied = ctx.slots.inject(LABEL_SLOT, () =>
          ctx.slots.register({ name: LABEL_SLOT, priority: LABEL_PRIORITY }, props =>
            h(ModelIdLabel, props),
          ),
        )
        return occupied
      } catch (error) {
        ctx.logger?.warn?.('model-vendor-label: label slot left to its shipped occupant', error)
        return undefined
      }
    }

    /**
     * Take over the composer seat and hand the shipped picker back, after
     * painting the catalog it will read. The picker is rendered with the very
     * props it would have received, so behavior is unchanged.
     * @param ctx - client plugin context.
     */
    function mountSeat(ctx) {
      const Picker = shippedPicker(ctx)
      if (Picker === undefined) return undefined
      // The store this plugin is handed is the catalog it paints; the picker
      // keeps receiving its own (unmodified) share. Painting happens here, on
      // the seat's inject, so it lands before the picker captures a name.
      let seatedStore
      try {
        const occupied = ctx.slots.inject(MODEL_SEAT, () => {
          let directory
          try {
            directory = ctx.modelDirectories?.directoryFor?.()
          } catch {
            directory = undefined
          }
          remember(directory)
          seatedStore = directory?.store
          paintGroups(seatedStore?.groups)
          const registered = ctx.slots.register(
            { name: MODEL_SEAT, priority: SEAT_PRIORITY },
            function ModelIdSeat(props) {
              paintGroups(props.store?.groups ?? seatedStore?.groups)
              return h(Picker, props)
            },
          )
          return registered
        })
        return occupied
      } catch (error) {
        // No composer seat to take over (older shell) — the label slot stands.
        ctx.logger?.warn?.('model-vendor-label: composer picker left to its shipped owner', error)
        return undefined
      }
    }

    /**
     * Read the persisted preference out of a config form snapshot.
     * @param form - config form for this plugin's namespace, or undefined.
     * @returns the enabled flag, defaulting to on.
     */
    function readEnabled(form) {
      const value = form?.getSnapshot?.()?.value
      const enabled = value?.[ENABLED_FIELD]
      return typeof enabled === 'boolean' ? enabled : true
    }

    /** Copy for the settings row, keyed by the active document language. */
    const ROW_COPY = {
      zh: {
        title: '模型选择器显示模型 id',
        description: '开启时，模型选择器显示模型 id（悬停可看展示名）；关闭后恢复 DSH 默认的展示名显示。',
        error: '保存失败，请重试',
      },
      en: {
        title: 'Show model ids in the model picker',
        description: 'When on, the picker shows model ids (hover for the display name). When off, DSH shows display names as usual.',
        error: 'Could not save. Please try again.',
      },
    }

    /**
     * Pick the copy for the active language.
     * @param language - document language, e.g. 'zh-CN'.
     * @returns the two strings the row renders.
     */
    function rowCopy(language) {
      return typeof language === 'string' && language.toLowerCase().startsWith('zh') ? ROW_COPY.zh : ROW_COPY.en
    }

    /** Inline styles: the row keeps the shipped rhythm without a CSS build step. */
    const ROW_STYLE = {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '24px',
      borderBottom: '0.5px solid var(--dsw-alias-border-l2, #e5e6eb)',
      padding: '16px 0',
    }
    const TITLE_STYLE = { fontSize: '14px', lineHeight: '20px', color: 'var(--dsw-alias-label-primary, inherit)' }
    const DESC_STYLE = { marginTop: '4px', fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-secondary, #6b6f76)' }
    const ERROR_STYLE = { marginTop: '4px', fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-state-error-primary, #d4380d)' }

    /**
     * The settings row: one switch that writes the Host preference.
     * @param props - injected face (switch binding, write verb, primitives).
     * @returns the row element.
     */
    function SettingsRow({ enabled: current, setEnabled, Switch }) {
      const enabled = current === true
      const [busy, setBusy] = React.useState(false)
      const [failed, setFailed] = React.useState(false)
      const copy = rowCopy(typeof document === 'undefined' ? 'en' : document.documentElement.lang)
      if (Switch === undefined) return null
      return h(
        'div',
        { style: ROW_STYLE, 'data-model-vendor-label-row': '' },
        h(
          'div',
          null,
          h('div', { style: TITLE_STYLE }, copy.title),
          h('div', { style: DESC_STYLE }, copy.description),
          failed ? h('div', { role: 'alert', style: ERROR_STYLE }, copy.error) : null,
        ),
        h(Switch, {
          checked: enabled,
          disabled: busy,
          label: copy.title,
          onChange: next => {
            setFailed(false)
            setBusy(true)
            Promise.resolve(setEnabled(next))
              .catch(() => setFailed(true))
              .finally(() => setBusy(false))
          },
        }),
      )
    }

    /**
     * Register the settings row while the Host serves this plugin's namespace.
     * @param ctx - client plugin context.
     * @param form - config form for this namespace.
     */
    function registerSettingsRow(ctx, form) {
      if (form === undefined) return
      const primitives = safeRequire('@deepseek-ai/dsh-client-ui-primitives')
      try {
        ctx.effect(
          () => {
            const dispose = ctx.configForms.whileServed([SETTINGS_NS], () =>
              ctx.slots.inject(SETTINGS_ROW, () =>
                ctx.slots.register(
                  { name: SETTINGS_ROW, id: SETTINGS_NS, order: 95 },
                  function ModelVendorLabelRow() {
                    // Read on every render so the switch follows the persisted
                    // value; the shell re-renders the row on document updates.
                    return h(SettingsRow, {
                      enabled: readEnabled(form),
                      setEnabled: next => form.set(ENABLED_FIELD, next),
                      Switch: primitives?.Switch,
                    })
                  },
                ),
              ),
            )
            return dispose
          },
          'model-vendor-label: settings row',
        )
      } catch (error) {
        ctx.logger?.warn?.('model-vendor-label: settings row unavailable', error)
      }
    }

    /**
     * Read one seed module without failing the load when it is absent.
     * @param name - module-table word.
     * @returns the module exports, or undefined.
     */
    function safeRequire(name) {
      try {
        return require(name)
      } catch {
        return undefined
      }
    }

    /** Services this package's browser half needs. */
    const inject = ['slots', 'modelDirectories', 'configForms']

    /**
     * Plugin body.
     * @param ctx - client plugin context.
     */
    function apply(ctx) {
      // Dynamic packages have timers withheld; the module-table bundle (such
      // as a shipped package) runs in the page and keeps them. The label slot
      // covers the picker with or without the safety net.
      const hasInterval = typeof globalThis.setInterval === 'function'
      const form = lookupForm(ctx)
      // Record every inject this package installs so a mount can run them now.
      const slots = ctx.slots
      if (slots !== undefined && typeof slots.inject === 'function' && slots.inject[INJECT_TRACKED] !== true) {
        const originalInject = slots.inject.bind(slots)
        const tracked = (name, thunk) => {
          pendingInjects.push(thunk)
          return originalInject(name, thunk)
        }
        tracked[INJECT_TRACKED] = true
        ctx.slots.inject = tracked
      }

      // Everything the switch turns on: the label occupant, the composer seat
      // and the catalog paint. `active` makes "on" idempotent and "off" a
      // complete undo (the shipped label takes its slot back).
      let active = false
      let teardown = []
      /** Injects recorded since the last flush, run as soon as a slot is mounted. */
      const pendingInjects = []

      const mount = () => {
        if (active) return
        active = true
        const stopLabel = mountLabel(ctx)
        const stopSeat = mountSeat(ctx)
        teardown = [stopLabel, stopSeat].filter(stop => typeof stop === 'function')
        // Record the live directory first: unloading must be able to restore
        // exactly the entries this mount painted.
        remember(lookupDirectory(ctx))
        paintCatalogs(ctx)
        // The seat injects pull in the label occupant; with the switch on they
        // must run now, not only on the next composer render.
        occupySlots(pendingInjects.splice(0))
      }
      const unmount = () => {
        if (!active) return
        active = false
        for (const stop of teardown) {
          try {
            stop()
          } catch (error) {
            ctx.logger?.warn?.('model-vendor-label: could not withdraw a registration', error)
          }
        }
        teardown = []
        restorePainted()
      }

      /** Put every painted name back, leaving untouched entries alone. */
      function restorePainted() {
        for (const entry of paintedEntries(ctx)) restoreEntry(entry)
      }

      // Off at load: nothing is mounted and the shipped label stays the owner.
      // On: mount now; the subscription below keeps following the switch.
      if (form === undefined || readEnabled(form)) mount()
      patchModelDirectories(ctx)

      // The repaint net keeps catalog entries painted while the switch is on,
      // and is the only thing running when the page has no timers at all.
      if (hasInterval) {
        const tick = () => {
          if (active) paintCatalogs(ctx)
        }
        const timer = setInterval(tick, 1000)
        ctx.effect(
          () => () => clearInterval(timer),
          'model-vendor-label: catalog repaint loop',
        )
      }

      // The switch: subscribe to the persisted preference and reconcile.
      if (form !== undefined) {
        const sync = () => {
          const wanted = readEnabled(form)
          if (wanted) mount()
          else unmount()
        }
        ctx.effect(
          () => {
            const off = form.subscribe(sync)
            sync()
            return () => {
              if (typeof off === 'function') off()
              unmount()
            }
          },
          'model-vendor-label: preference',
        )
      }

      // Whatever the switch state, unloading the package must leave nothing
      // behind. This runs after the preference effect's disposer (effects
      // unwind in reverse), so it is the single place that restores the names.
      ctx.effect(
        function () {
          const dispose = () => {
            unmount()
            restorePainted()
          }
          return dispose
        },
        'model-vendor-label: unload cleanup',
      )

      registerSettingsRow(ctx, form)
    }

    /**
     * The directory service handle the shell currently hands out.
     * @param ctx - client plugin context.
     * @returns the handle, or undefined when the catalog is not reachable.
     */
    function lookupDirectory(ctx) {
      try {
        return ctx.modelDirectories?.directoryFor?.()
      } catch {
        return undefined
      }
    }

    /**
     * Run the slot injects this package just registered. In the shell the
     * owning seat calls them when it renders; doing it here makes a switch
     * flip take effect immediately instead of on the next composer paint.
     * @param ctx - client plugin context.
     */
    function occupySlots(thunks) {
      for (const thunk of thunks) {
        try {
          if (typeof thunk === 'function') thunk({})
        } catch {
          // The seat runs the inject itself on its next render.
        }
      }
    }

    /**
     * Look up this plugin's own settings form, tolerating an older shell.
     * @param ctx - client plugin context.
     * @returns the config form, or undefined when the service is absent.
     */
    function lookupForm(ctx) {
      try {
        return ctx.configForms?.get?.(SETTINGS_NS)
      } catch {
        return undefined
      }
    }

    exports.apply = apply
    exports.inject = inject
    exports.name = 'model-vendor-label'
    exports.__test = {
      ORIGINAL_NAME,
      LABEL_SLOT,
      MODEL_SEAT,
      SETTINGS_NS,
      ENABLED_FIELD,
      SETTINGS_ROW,
      readEnabled,
      SettingsRow,
      labelText,
      ModelIdLabel,
      paintEntry,
      restoreEntry,
      paintGroups,
    }
    return module.exports
  },
})
