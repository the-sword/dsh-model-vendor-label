/**
 * Host half of dsh-model-vendor-label.
 *
 * The whole feature lives in the browser: the composer's inline model label
 * (`conversation.input.model.label`) is decorated so equal display names from
 * different providers stay distinguishable. The Host contributes nothing —
 * this entry exists because a profile row binds a package's browser half by
 * its bare package name, so the row needs a real module to load.
 */

/** Loader entry: no Host-side service, hook, or event. */
export function apply() {}
