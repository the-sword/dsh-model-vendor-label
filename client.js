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
    function occupyLabel(ctx) {
      // ctx.effect pins the wait to THIS package's fiber, so unloading the
      // package also withdraws the registration it made. If the registration
      // still cannot land (an upgrade changing the shadowing rules), warn and
      // leave the shipped label rendering rather than failing the load.
      try {
        // Local then return: a bare `return ctx.slots.inject(...)` in this
        // hand-written bundle has been observed to evaluate to undefined.
        ctx.effect(
          () => {
            const occupied = ctx.slots.inject(LABEL_SLOT, () =>
              ctx.slots.register({ name: LABEL_SLOT, priority: LABEL_PRIORITY }, props =>
                h(ModelIdLabel, props),
              ),
            )
            return occupied
          },
          'model-vendor-label: label occupant',
        )
      } catch (error) {
        ctx.logger?.warn?.('model-vendor-label: label slot left to its shipped occupant', error)
      }
    }

    /**
     * Take over the composer seat and hand the shipped picker back, after
     * painting the catalog it will read. The picker is rendered with the very
     * props it would have received, so behavior is unchanged.
     * @param ctx - client plugin context.
     */
    function takeOverSeat(ctx) {
      const Picker = shippedPicker(ctx)
      if (Picker === undefined) return
      // The store this plugin is handed is the catalog it paints; the picker
      // keeps receiving its own (unmodified) share. Painting happens here, on
      // the seat's inject, so it lands before the picker captures a name.
      let seatedStore
      try {
        ctx.effect(
          () => {
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
          },
          'model-vendor-label: composer seat',
        )
      } catch (error) {
        // No composer seat to take over (older shell) — the label slot stands.
        ctx.logger?.warn?.('model-vendor-label: composer picker left to its shipped owner', error)
      }
    }

    /** Services this package's browser half needs. */
    const inject = ['slots', 'modelDirectories']

    /**
     * Plugin body.
     * @param ctx - client plugin context.
     */
    function apply(ctx) {
      // Dynamic packages have timers withheld; the module-table bundle (such
      // as a shipped package) runs in the page and keeps them. The label slot
      // covers the picker with or without the safety net.
      const hasInterval = typeof globalThis.setInterval === 'function'
      occupyLabel(ctx)
      patchModelDirectories(ctx)
      takeOverSeat(ctx)
      if (!hasInterval) return paintCatalogs(ctx)
      const tick = () => paintCatalogs(ctx)
      tick()
      let disposed = false
      const timer = setInterval(tick, 1000)
      // A function expression, not an arrow with a nested arrow body: the
      // client module bundler re-hosts factory source in a way that loses the
      // parenthesized body of such an arrow, and the disposer silently became
      // its first statement's value.
      ctx.effect(
        function () {
          const dispose = () => {
            clearInterval(timer)
            // Cordon again: a second dispose must not restore already-restored
            // entries or un-paint a re-painted catalog.
            if (disposed) return
            disposed = true
            for (const handle of handles) {
              for (const entry of handle?.store?.groups ?? []) restoreEntry(entry)
            }
          }
          return dispose
        },
        'model-vendor-label: catalog repaint loop',
      )
    }

    exports.apply = apply
    exports.inject = inject
    exports.name = 'model-vendor-label'
    exports.__test = {
      ORIGINAL_NAME,
      LABEL_SLOT,
      MODEL_SEAT,
      labelText,
      ModelIdLabel,
      paintEntry,
      restoreEntry,
      paintGroups,
    }
    return module.exports
  },
})
