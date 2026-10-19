/**
 * Browser half of the test delivery: ask the node half to send one notification
 * to the endpoint the settings card currently holds.
 *
 * The card owns the draft, so it passes the whole endpoint along; the node half
 * falls back to the saved Config for any field the card omits, which is what
 * lets a partially edited form still be tested.
 */

import type { EndpointHeader, EndpointMethod } from './prefs.ts'

/**
 * The node half's route in its browser-relative form: the served document
 * carries `<base href="./">`, so one bundle answers at the origin root and
 * under any prefix-stripping mount, and an in-page navigation never moves it.
 */
export const TEST_PUSH_ROUTE = 'api/dsh-notify/test'

/** Delivery outcome reported by the node half. */
export interface PushTestOutcome {
  /** Whether the endpoint answered with a 2xx status. */
  readonly ok: boolean
  /** HTTP status; 0 when the request never reached the endpoint. */
  readonly status: number
  /** Failure reason, present only when `ok` is false. */
  readonly error?: string
}

/** What the card hands the node half for one test. */
export interface PushTestDraft {
  /** Endpoint URL as the card holds it. */
  readonly url: string
  /** Selected request method. */
  readonly method: EndpointMethod
  /** Header rows as the card holds them. */
  readonly headers: readonly EndpointHeader[]
  /** Body template as the card holds it. */
  readonly body: string
  /** Icon URL as the card holds it; empty means "no icon". */
  readonly icon: string
}

/** Read the node half's answer, tolerating a non-JSON body. */
function readOutcome(status: number, value: unknown): PushTestOutcome {
  const body = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  const ok = status >= 200 && status < 300 && body.ok === true
  const reported = typeof body.error === 'string' && body.error !== '' ? body.error : undefined
  if (ok) return { ok, status }
  return { ok, status, error: reported ?? `请求失败（HTTP ${status}）` }
}

/**
 * Deliver one test push through the node half.
 *
 * Never throws: the card reports every failure, including an unreachable Host,
 * as an outcome.
 * @param draft - endpoint the card currently holds.
 * @returns the delivery outcome.
 */
export async function requestTestPush(draft: PushTestDraft): Promise<PushTestOutcome> {
  let response: Response
  try {
    response = await fetch(TEST_PUSH_ROUTE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft),
    })
  } catch (error: unknown) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : '无法连接宿主',
    }
  }
  const value = await response.json().catch((): undefined => undefined)
  return readOutcome(response.status, value)
}
