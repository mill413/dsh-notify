/**
 * dsh-notify, node half.
 *
 * This half owns no service: it exists so the plugin's Loader entry carries a
 * Cordis `Config`, which the settings service projects into this entry's form.
 * The browser half reads those fields through `ctx.configForms` and writes them
 * back with an atomic, revision-fenced mutation, so the notification
 * preferences persist in the active profile's Cordis patch like any other
 * plugin setting.
 *
 * `auto: false` tells the settings service not to generate a page for this
 * entry: the browser half renders its own card into the plugin row.
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-settings'

/** The one Cordis entry (and therefore settings form) owned by this plugin. */
export const NS = 'dsh-notify'

/** Browser-half preference fields, as the settings form reads them. */
export interface Config {
  /** Master switch for browser system notifications. */
  enabled: Volatile<boolean>
  /** Notify when a main Agent stops running (its turn finished). */
  notifyOnComplete: Volatile<boolean>
  /** Notify when an Agent is waiting for approval or an answer. */
  notifyOnInteraction: Volatile<boolean>
  /** Suppress notifications while the page is visible and focused. */
  onlyWhenBackground: Volatile<boolean>
}

/**
 * Schema of the browser-half preferences. Each field is a `.volatile()` default
 * so a deployment can seed it from cordis.yml while a user overrides it from
 * the settings form; `.volatile()` is also what makes the field live-changeable
 * and visible to that form.
 */
export const Config = z.object({
  enabled: z.boolean().default(true).volatile(),
  notifyOnComplete: z.boolean().default(true).volatile(),
  notifyOnInteraction: z.boolean().default(true).volatile(),
  onlyWhenBackground: z.boolean().default(true).volatile(),
})

/**
 * Register the settings presentation policy for this plugin entry.
 *
 * The browser half renders its own card, so the settings service must not also
 * generate a page for the entry: `auto: false` is registered against this
 * plugin's own fiber inside an optional `settings` injection child, so a
 * late-loading or replaced Settings service picks the policy up and the plugin
 * still runs in a deployment without Settings.
 * @param ctx - host plugin context.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (sctx) => {
    sctx.effect(() => sctx.settings.configure({ auto: false }, ctx.fiber))
  })
}
