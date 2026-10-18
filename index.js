/**
 * Host half of dsh-model-vendor-label.
 *
 * The rendering lives in the browser: the composer's model label is taken over
 * and the client model catalog is repainted so the UI shows the model id. The
 * Host owns one thing — the persisted preference that turns that rendering on
 * or off — because a preference the browser can only keep in memory would not
 * survive a restart.
 *
 * The preference is a normal DSH setting: this plugin's Config and therefore
 * its own row in the settings document, addressed by this loader row's id
 * (`model-vendor-label`). The browser half reads it through `configForms`.
 */
import z from '@deepseek-ai/schemastery'

/** Settings namespace: the loader row id declared in cordis.patch.yml. */
export const SETTINGS_NAMESPACE = 'model-vendor-label'

/**
 * Live preference projected to the browser.
 * @remarks `volatile` keeps hot reloads from re-reading the document.
 */
export const Config = z.object({
  /** Show model ids instead of display names. */
  enabled: z.boolean().default(true).volatile(),
})

/**
 * Keep this plugin's form in the settings document while the browser renders
 * its own row: `auto: false` tells the shell not to synthesize a page for it.
 * @param ctx - Host plugin context.
 */
export function apply(ctx) {
  ctx.inject(['settings'], child => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })
}
