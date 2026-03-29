/**
 * Rudderstack browser SDK helper.
 * Env vars: NEXT_PUBLIC_RUDDERSTACK_WRITE_KEY, NEXT_PUBLIC_RUDDERSTACK_DATA_PLANE_URL
 */

declare global {
  interface Window {
    rudderanalytics?: any
  }
}

export function rudderTrack(event: string, properties: Record<string, any> = {}) {
  if (typeof window === "undefined" || !window.rudderanalytics) return
  try {
    window.rudderanalytics.track(event, properties)
  } catch (e) {}
}

export function rudderPage(name?: string, properties: Record<string, any> = {}) {
  if (typeof window === "undefined" || !window.rudderanalytics) return
  try {
    window.rudderanalytics.page(name, properties)
  } catch (e) {}
}

export function rudderIdentify(userId: string, traits: Record<string, any> = {}) {
  if (typeof window === "undefined" || !window.rudderanalytics) return
  try {
    window.rudderanalytics.identify(userId, traits)
  } catch (e) {}
}
