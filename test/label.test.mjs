/**
 * Headless checks for the browser half of dsh-model-vendor-label.
 *
 * client.js is a ModuleLoader bundle: it registers itself on
 * `window.__ModuleLoader__` instead of exporting. The harness below plays that
 * loader with a stub React, so the label component, the catalog painting, and
 * the apply() wiring can be exercised without a browser.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

/** Minimal createElement that keeps a readable tree for assertions. */
function createElement(type, props, ...children) {
  return { type, props: props ?? {}, children }
}

/** Just enough React for the bundle. */
function stubReact() {
  return { createElement }
}

/** One catalog entry with provider-chosen display copy. */
function entry(id, name) {
  return { id, name }
}

/** The catalog shape the picker reads: groups of providers carrying models. */
function groups() {
  return [
    {
      id: 'buddy',
      provider: { id: 'buddy', name: 'Buddy' },
      models: [entry('deepseek-v4.1-flash', 'DeepSeek-V4.1-Flash')],
    },
    {
      id: 'sensenova',
      provider: { id: 'sensenova', name: 'SenseNova' },
      models: [entry('deepseek-v4.1-flash', 'deepseek-v4.1-flash')],
    },
  ]
}

/** Evaluate the bundle once and return its exports plus the stub module table. */
function loadBundle() {
  let registered
  const window = {
    __ModuleLoader__: {
      load: definition => {
        registered = definition
      },
    },
  }
  vm.runInContext(source, vm.createContext({ window, console }), { filename: 'client.js' })
  assert.ok(registered !== undefined, 'bundle did not register with the module loader')
  assert.equal(registered.id, 'dsh-model-vendor-label')
  const api = registered.factory(name => {
    if (name === 'react') return stubReact()
    throw new Error(`unexpected require: ${name}`)
  })
  return api
}

/** A client context good enough for apply(): records effect/dispose pairs. */
function makeContext(options = {}) {
  const disposers = []
  const registrations = []
  const warnings = []
  const seated = []
  const store = { groups: options.groups ?? groups() }
  const directory = { store }
  const ctx = {
    modules: {
      loadCache: new Map(
        options.picker === false
          ? []
          : [['@deepseek-ai/dsh-client-ui-model-selection', { exports: { ModelSelect: options.picker } }]],
      ),
    },
    modelDirectories: { directoryFor: () => directory },
    slots: {
      inject(name, occupy) {
        registrations.push({ name, occupy })
      },
      register(opts, component) {
        seated.push({ opts, component })
        return () => {}
      },
    },
    effect(fn, label) {
      const dispose = fn()
      disposers.push({ dispose, label })
      return () => {}
    },
    logger: { warn: (...args) => warnings.push(args) },
  }
  return { ctx, disposers, registrations, seated, warnings, store, directory }
}

/** Resolve what an injected slot calls back into: runs the occupy thunk. */
function captures(registrations, name) {
  const found = registrations.filter(entry => entry.name === name)
  assert.equal(found.length, 1, `expected exactly one inject() of ${name}`)
  let seated
  found[0].occupy()
  return {
    registrations: found,
    seat: component => {
      seated = component
      return seated
    },
  }
}

const api = loadBundle()
const t = api.__test

test('the label renders the model id for equal display names', () => {
  const rendered = t.ModelIdLabel({
    provider: { id: 'buddy', name: 'Buddy' },
    model: { id: 'deepseek-v4.1-flash', name: 'DeepSeek-V4.1-Flash' },
    placement: 'option',
    selected: false,
  })
  assert.equal(rendered.children[0], 'deepseek-v4.1-flash')
  assert.equal(rendered.props.title, 'DeepSeek-V4.1-Flash')
  assert.equal(rendered.props['data-model-id'], 'deepseek-v4.1-flash')
})

test('ids are trimmed but otherwise verbatim', () => {
  const rendered = t.ModelIdLabel({ model: { id: '  group/auto-model  ', name: 'Name' } })
  assert.equal(rendered.children[0], 'group/auto-model')
  assert.equal(rendered.props['data-model-id'], 'group/auto-model')
})

test('an entry without an id degrades to the bare name', () => {
  const rendered = t.ModelIdLabel({ model: { name: 'Only-Name' } })
  assert.deepEqual(rendered.children, ['Only-Name'])
  assert.equal(rendered.props['data-model-id'], undefined)

  const nothing = t.ModelIdLabel({ model: undefined })
  assert.deepEqual(nothing.children, [''])
  assert.equal(nothing.props.title, undefined)
})

test('labelText prefers the id and never invents one', () => {
  assert.equal(t.labelText({ id: 'a', name: 'N' }), 'a')
  assert.equal(t.labelText({ id: '', name: 'N' }), 'N')
  assert.equal(t.labelText({ name: 'N' }), 'N')
  assert.equal(t.labelText(undefined), '')
})

test('painting a catalog makes every rendered name the model id', () => {
  const painted = groups()
  assert.equal(t.paintGroups(painted), 2)
  assert.deepEqual(
    painted.map(group => group.models.map(model => model.name)),
    [['deepseek-v4.1-flash'], ['deepseek-v4.1-flash']],
  )
  // Idempotent: a second pass paints nothing and changes nothing.
  assert.equal(t.paintGroups(painted), 0)
})

test('painting keeps the original name private and restores it exactly', () => {
  const model = entry('deepseek-v4.1-flash', 'DeepSeek-V4.1-Flash')
  assert.equal(t.paintEntry(model), true)
  assert.equal(model.name, 'deepseek-v4.1-flash')
  assert.equal(model[t.ORIGINAL_NAME], 'DeepSeek-V4.1-Flash')
  // The bookkeeping property is invisible to JSON and Object.keys readers.
  assert.deepEqual(Object.keys(model), ['id', 'name'])
  assert.deepEqual(JSON.parse(JSON.stringify(model)), { id: 'deepseek-v4.1-flash', name: 'deepseek-v4.1-flash' })

  assert.equal(t.restoreEntry(model), true)
  assert.equal(model.name, 'DeepSeek-V4.1-Flash')
  assert.equal(Object.hasOwn(model, t.ORIGINAL_NAME), false)
  assert.deepEqual(Object.keys(model), ['id', 'name'])
  // Restoring twice is a no-op, not a corruption.
  assert.equal(t.restoreEntry(model), false)
  assert.equal(model.name, 'DeepSeek-V4.1-Flash')
})

test('entries without an id are left untouched', () => {
  const model = entry(undefined, 'Only-Name')
  assert.equal(t.paintEntry(model), false)
  assert.equal(model.name, 'Only-Name')
  assert.equal(t.paintEntry(undefined), false)
})

test('apply occupies the label slot and both composer halves', () => {
  const { ctx, registrations } = makeContext({ picker: function ModelSelect() {} })
  api.apply(ctx)
  const names = registrations.map(entry => entry.name)
  assert.deepEqual(names, [t.LABEL_SLOT, t.MODEL_SEAT])
})

test('apply paints the catalog the composer reads', () => {
  const catalog = groups()
  const { ctx, store, registrations } = makeContext({ groups: catalog, picker: function ModelSelect() {} })
  api.apply(ctx)
  // The shell brings the composer up after the plugin; that is when the
  // plugin's own slot inject runs and the store it is handed is painted.
  for (const entry of registrations) entry.occupy({})
  assert.deepEqual(
    store.groups.map(group => group.models.map(model => model.name)),
    [['deepseek-v4.1-flash'], ['deepseek-v4.1-flash']],
  )
})

test('the composer seat renders the shipped picker with its own props', () => {
  function ModelSelect(props) {
    return createElement('ModelSelectStub', props)
  }
  const { ctx, registrations, seated } = makeContext({ picker: ModelSelect })
  api.apply(ctx)
  const found = registrations.find(entry => entry.name === t.MODEL_SEAT)
  // The inject thunk receives the seat's own renderSlot binding and registers
  // the wrapper there.
  found.occupy({})
  const entry = seated.find(item => item.opts.name === t.MODEL_SEAT)
  assert.ok(entry !== undefined, 'the seat wrapper was never registered')
  const compiled = entry.component
  assert.equal(typeof compiled, 'function')
  const props = { locked: false, store: { groups: groups() } }
  const rendered = compiled(props)
  assert.equal(rendered.type, ModelSelect)
  assert.equal(rendered.props, props, 'the picker must receive the very props the seat got')
  assert.equal(props.store.groups[0].models[0].name, 'deepseek-v4.1-flash', 'the seat paints before the picker renders')
})

test('a shell without the reachable picker never takes over the seat', () => {
  const { ctx, registrations } = makeContext({ picker: false })
  api.apply(ctx)
  assert.deepEqual(registrations.map(entry => entry.name), [t.LABEL_SLOT])
})

test('a failing registration downgrades to a warning instead of throwing', () => {
  const { ctx, warnings } = makeContext({ picker: function ModelSelect() {} })
  ctx.slots.inject = () => {
    throw new Error('already has a registration at priority 0')
  }
  assert.doesNotThrow(() => api.apply(ctx))
  assert.equal(warnings.length, 2)
  assert.match(String(warnings[0][1]), /priority 0/)
})

test('a missing catalog service is tolerated', () => {
  const { ctx } = makeContext({ picker: false })
  ctx.modelDirectories = undefined
  assert.doesNotThrow(() => api.apply(ctx))
})

test('the composer seat settles every store it is handed, and unload restores it', () => {
  const catalog = groups()
  const { ctx, registrations } = makeContext({ groups: catalog, picker: function ModelSelect() {} })
  api.apply(ctx)
  // The shell brings the composer up after the plugin: that is when the seat's
  // inject runs and the catalog it points at is painted.
  for (const entry of registrations) entry.occupy({})
  assert.equal(catalog[0].models[0].name, 'deepseek-v4.1-flash')
  assert.equal(catalog[1].models[0].name, 'deepseek-v4.1-flash')

  // Unload puts the provider-chosen name back and leaves no bookkeeping behind.
  for (const group of catalog) for (const model of group.models) t.restoreEntry(model)
  assert.deepEqual(
    catalog.map(group => group.models.map(model => model.name)),
    [['DeepSeek-V4.1-Flash'], ['deepseek-v4.1-flash']],
  )
  assert.equal(Object.hasOwn(catalog[0].models[0], t.ORIGINAL_NAME), false)
})

test('the package declares the client-half contract the loader binds', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.name, 'dsh-model-vendor-label')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-model-selection'))
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.ok(pkg.files.includes('client.js'))
  assert.equal(typeof api.apply, 'function')
  assert.deepEqual([...api.inject], ['slots', 'modelDirectories'])
})
