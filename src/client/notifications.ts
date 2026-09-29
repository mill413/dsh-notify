/**
 * Browser system-notification plumbing: capability detection, permission
 * request, and one guarded `show()` call.
 *
 * Everything here tolerates a missing or unusable Notification API and reports
 * why instead of throwing, because the two ways this environment can lack it
 * are ordinary rather than exceptional:
 *
 * - a non-secure origin (the launcher's plain-HTTP LAN address), where the API
 *   is defined but refuses to be used; and
 * - a mobile browser that only accepts ServiceWorker notifications.
 */

/** Resolved capability + permission state of the current document. */
export type NotifyPermission = 'granted' | 'denied' | 'default' | 'unsupported' | 'insecure'

/** What the settings card and the watcher need to know before showing anything. */
export interface NotifyEnvironment {
  /** Whether a permission request can succeed here. */
  readonly supported: boolean
  /** Whether the document is a secure context. */
  readonly secure: boolean
  /** Current permission, or the reason the API cannot be used. */
  readonly permission: NotifyPermission
}

/** Fields accepted by {@link showSystemNotification}. */
export interface SystemNotificationInput {
  /** Notification title (the Session label). */
  readonly title: string
  /** Notification body (localized line explaining why it fired). */
  readonly body: string
  /** Replacement key: a later notification with the same tag replaces this one. */
  readonly tag?: string | undefined
  /** Click handler; the window is focused before it runs. */
  readonly onClick?: (() => void) | undefined
}

/** @returns the document's Notification constructor, or undefined when absent. */
function notificationConstructor(): typeof Notification | undefined {
  if (typeof window === 'undefined') return undefined
  if (!('Notification' in window)) return undefined
  const ctor = window.Notification
  return typeof ctor === 'function' ? ctor : undefined
}

/** @returns whether this document is a secure context (localhost counts). */
function isSecure(): boolean {
  if (typeof window === 'undefined') return false
  return window.isSecureContext === true
}

/** @returns the current capability and permission state. */
export function notifyEnvironment(): NotifyEnvironment {
  const ctor = notificationConstructor()
  if (ctor === undefined) return { supported: false, secure: isSecure(), permission: 'unsupported' }
  if (!isSecure()) return { supported: false, secure: false, permission: 'insecure' }
  return { supported: true, secure: true, permission: normalizePermission(ctor.permission) }
}

/** Narrow an arbitrary string to a known permission. */
function normalizePermission(value: string | undefined): NotifyPermission {
  return value === 'granted' || value === 'denied' ? value : 'default'
}

/**
 * Ask the browser for notification permission.
 *
 * Must be called from a user gesture (a click handler); browsers ignore or
 * reject a request made outside one.
 * @returns the resulting permission, or the environment's reason when unusable.
 */
export async function requestNotifyPermission(): Promise<NotifyPermission> {
  const environment = notifyEnvironment()
  if (!environment.supported) return environment.permission
  if (environment.permission === 'granted' || environment.permission === 'denied') return environment.permission
  try {
    return normalizePermission(await notificationConstructor()?.requestPermission())
  } catch {
    // A refusal (for example, no user gesture) leaves the previous state.
    return notifyEnvironment().permission
  }
}

/**
 * @returns whether the page is hidden or its window is not focused — the
 * "the user has looked away" condition behind the quiet default.
 */
export function isPageBackground(): boolean {
  if (typeof document === 'undefined') return true
  if (document.visibilityState === 'hidden') return true
  if (typeof document.hasFocus === 'function' && !document.hasFocus()) return true
  return false
}

/**
 * Show one system notification, guarding every failure mode.
 * @param input - title, body, optional tag and click handler.
 * @returns whether a notification was actually shown.
 */
export function showSystemNotification(input: SystemNotificationInput): boolean {
  const ctor = notificationConstructor()
  if (ctor === undefined || !isSecure() || ctor.permission !== 'granted') return false
  try {
    const notification = new ctor(input.title, {
      body: input.body,
      ...(input.tag === undefined ? {} : { tag: input.tag }),
    })
    const focus = (): void => {
      try {
        window.focus()
      } catch {
        // A blocked focus() is not a failure of the notification itself.
      }
      input.onClick?.()
      notification.close()
    }
    notification.onclick = focus
    return true
  } catch {
    // Chrome on Android rejects constructor-created notifications outright.
    return false
  }
}
