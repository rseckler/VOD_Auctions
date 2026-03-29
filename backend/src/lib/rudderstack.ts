/**
 * Rudderstack event tracking wrapper.
 * Required env vars:
 *   RUDDERSTACK_WRITE_KEY — from Rudderstack dashboard
 *   RUDDERSTACK_DATA_PLANE_URL — e.g. https://rudderstack.your-vps.com
 *
 * Install: npm install @rudderstack/rudder-sdk-node
 * VPS Docker deploy: see docs/architecture/RUDDERSTACK_SETUP.md
 */

let client: any = null

function getClient() {
  if (client) return client
  const writeKey = process.env.RUDDERSTACK_WRITE_KEY
  const dataPlaneUrl = process.env.RUDDERSTACK_DATA_PLANE_URL
  if (!writeKey || !dataPlaneUrl) {
    return null
  }
  try {
    const { RudderAnalytics } = require("@rudderstack/rudder-sdk-node")
    client = new RudderAnalytics(writeKey, { dataPlaneUrl })
    return client
  } catch (e) {
    console.warn("[rudderstack] SDK not installed — skipping tracking")
    return null
  }
}

export function rudderTrack(userId: string, event: string, properties: Record<string, any> = {}) {
  const c = getClient()
  if (!c) return
  try {
    c.track({ userId, event, properties })
  } catch (e) {
    console.warn("[rudderstack] track error:", e)
  }
}

export function rudderIdentify(userId: string, traits: Record<string, any> = {}) {
  const c = getClient()
  if (!c) return
  try {
    c.identify({ userId, traits })
  } catch (e) {
    console.warn("[rudderstack] identify error:", e)
  }
}
