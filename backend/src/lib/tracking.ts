const TRACKING_URLS: Record<string, string> = {
  DHL: "https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=",
  DPD: "https://tracking.dpd.de/parcelstatus?query=",
  Hermes: "https://www.myhermes.de/empfangen/sendungsverfolgung/?tracking=",
  GLS: "https://gls-group.eu/DE/de/paketverfolgung?match=",
  UPS: "https://www.ups.com/track?tracknum=",
  "Deutsche Post": "https://www.deutschepost.de/de/s/sendungsverfolgung.html?piececode=",
}

export function getTrackingUrl(carrier: string | null, trackingNumber: string | null): string | null {
  if (!carrier || !trackingNumber) return null
  const baseUrl = TRACKING_URLS[carrier]
  if (!baseUrl) return null
  return baseUrl + encodeURIComponent(trackingNumber)
}
