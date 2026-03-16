/**
 * PayPal JS SDK loader
 * Dynamically loads the PayPal JS SDK script and provides the PayPal Buttons API.
 */

const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID

let loadPromise: Promise<any> | null = null

export function loadPayPalSDK(): Promise<any> {
  if (loadPromise) return loadPromise

  if (!PAYPAL_CLIENT_ID) {
    console.warn("[paypal] NEXT_PUBLIC_PAYPAL_CLIENT_ID not set")
    return Promise.reject(new Error("PayPal client ID not configured"))
  }

  // Check if already loaded
  if (typeof window !== "undefined" && (window as any).paypal) {
    return Promise.resolve((window as any).paypal)
  }

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=EUR&intent=capture&locale=en_US`
    script.async = true
    script.onload = () => {
      if ((window as any).paypal) {
        resolve((window as any).paypal)
      } else {
        reject(new Error("PayPal SDK loaded but window.paypal is not available"))
      }
    }
    script.onerror = () => {
      loadPromise = null
      reject(new Error("Failed to load PayPal SDK"))
    }
    document.head.appendChild(script)
  })

  return loadPromise
}

export const paypalClientId = PAYPAL_CLIENT_ID
