"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react"
import {
  login as authLogin,
  register as authRegister,
  getCustomer,
  getToken,
  setToken,
  clearToken,
} from "@/lib/auth"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"
import { rudderIdentify } from "@/lib/rudderstack"

type Customer = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
}

type IntendedAction = {
  type: string
  payload?: Record<string, unknown>
}

type AuthContextType = {
  isAuthenticated: boolean
  customer: Customer | null
  loading: boolean
  cartCount: number
  savedCount: number
  ordersCount: number
  winsCount: number
  sessionExpiredMessage: string | null
  intendedAction: IntendedAction | null
  dismissSessionExpired: () => void
  setIntendedAction: (action: IntendedAction) => void
  clearIntendedAction: () => void
  login: (email: string, password: string, persistent?: boolean) => Promise<void>
  register: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    newsletterOptin?: boolean
  ) => Promise<void>
  logout: () => void
  refreshStatus: () => Promise<void>
  refreshCustomer: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  customer: null,
  loading: true,
  cartCount: 0,
  savedCount: 0,
  ordersCount: 0,
  winsCount: 0,
  sessionExpiredMessage: null,
  intendedAction: null,
  dismissSessionExpired: () => {},
  setIntendedAction: () => {},
  clearIntendedAction: () => {},
  login: async () => {},
  register: async () => {},
  logout: () => {},
  refreshStatus: async () => {},
  refreshCustomer: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

const TOKEN_CHECK_INTERVAL = 5 * 60 * 1000 // 5 minutes

export function AuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [cartCount, setCartCount] = useState(0)
  const [savedCount, setSavedCount] = useState(0)
  const [ordersCount, setOrdersCount] = useState(0)
  const [winsCount, setWinsCount] = useState(0)
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null)
  const [intendedAction, setIntendedActionState] = useState<IntendedAction | null>(null)
  const logoutTriggeredRef = useRef(false)

  const setIntendedAction = useCallback((action: IntendedAction) => {
    setIntendedActionState(action)
  }, [])

  const clearIntendedAction = useCallback(() => {
    setIntendedActionState(null)
  }, [])

  const handleSessionExpired = useCallback(() => {
    if (logoutTriggeredRef.current) return
    logoutTriggeredRef.current = true
    clearToken()
    setCustomer(null)
    setCartCount(0)
    setSavedCount(0)
    setSessionExpiredMessage("Session expired. Please log in again.")
    // Reset flag after a short delay so future expirations are caught
    setTimeout(() => { logoutTriggeredRef.current = false }, 1000)
  }, [])

  const dismissSessionExpired = useCallback(() => {
    setSessionExpiredMessage(null)
  }, [])

  const fetchStatus = useCallback(async (token: string) => {
    try {
      const res = await fetch(`${MEDUSA_URL}/store/account/status`, {
        headers: {
          "x-publishable-api-key": PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
        },
      })
      if (res.status === 401) {
        handleSessionExpired()
        return
      }
      if (res.ok) {
        const data = await res.json()
        setCartCount(data.cart_count || 0)
        setSavedCount(data.saved_count || 0)
        setOrdersCount(data.orders_count || 0)
        setWinsCount(data.wins_count || 0)
      }
    } catch {
      // silently fail on network errors
    }
  }, [handleSessionExpired])

  const refreshStatus = useCallback(async () => {
    const token = getToken()
    if (token) await fetchStatus(token)
  }, [fetchStatus])

  const refreshCustomer = useCallback(async () => {
    const token = getToken()
    if (token) {
      const c = await getCustomer(token)
      if (c) setCustomer(c)
    }
  }, [])

  // Load customer from token on mount
  useEffect(() => {
    const token = getToken()
    if (token) {
      Promise.all([
        getCustomer(token).then((c) => {
          if (c) {
            setCustomer(c)
            rudderIdentify(c.id, { email: c.email ?? undefined })
          } else {
            handleSessionExpired()
          }
        }),
        fetchStatus(token),
      ])
        .catch(() => handleSessionExpired())
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [fetchStatus, handleSessionExpired])

  // Periodic token validity check (every 5 minutes)
  useEffect(() => {
    const interval = setInterval(() => {
      const token = getToken()
      if (!token) return
      fetchStatus(token)
    }, TOKEN_CHECK_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchStatus])

  // Cross-tab session sync via storage event
  useEffect(() => {
    function handleStorageChange(e: StorageEvent) {
      if (e.key !== "medusa_token") return
      if (!e.newValue) {
        // Token removed in another tab — logout here
        setCustomer(null)
        setCartCount(0)
        setSavedCount(0)
      } else if (e.newValue !== e.oldValue) {
        // Token set/changed in another tab — refresh customer data
        getCustomer(e.newValue).then((c) => {
          if (c) setCustomer(c)
        })
        fetchStatus(e.newValue)
      }
    }
    window.addEventListener("storage", handleStorageChange)
    return () => window.removeEventListener("storage", handleStorageChange)
  }, [fetchStatus])

  const login = useCallback(async (email: string, password: string, persistent: boolean = true) => {
    const token = await authLogin(email, password)
    setToken(token, persistent)
    const c = await getCustomer(token)
    setCustomer(c)
    setSessionExpiredMessage(null)
    await fetchStatus(token)
    if (c) rudderIdentify(c.id, { email: c.email ?? undefined })
  }, [fetchStatus])

  const register = useCallback(
    async (
      email: string,
      password: string,
      firstName: string,
      lastName: string,
      newsletterOptin?: boolean
    ) => {
      const token = await authRegister(email, password, firstName, lastName)
      setToken(token)
      const c = await getCustomer(token)
      setCustomer(c)
      setSessionExpiredMessage(null)
      await fetchStatus(token)
      if (c) rudderIdentify(c.id, { email: c.email ?? undefined })

      // Send welcome email (fire-and-forget)
      fetch(`${MEDUSA_URL}/store/account/send-welcome`, {
        method: "POST",
        headers: {
          "x-publishable-api-key": PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
        },
      }).catch(() => {})

      // Sync newsletter opt-in preference to Brevo (fire-and-forget)
      if (newsletterOptin) {
        fetch(`${MEDUSA_URL}/store/account/newsletter`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-publishable-api-key": PUBLISHABLE_KEY,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ newsletter_optin: true }),
        }).catch(() => {})
      }
    },
    [fetchStatus]
  )

  const logout = useCallback(() => {
    clearToken()
    setCustomer(null)
    setCartCount(0)
    setSavedCount(0)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!customer,
        customer,
        loading,
        cartCount,
        savedCount,
        ordersCount,
        winsCount,
        sessionExpiredMessage,
        intendedAction,
        dismissSessionExpired,
        setIntendedAction,
        clearIntendedAction,
        login,
        register,
        logout,
        refreshStatus,
        refreshCustomer,
      }}
    >
      {children}
      {sessionExpiredMessage && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 backdrop-blur-sm px-4 py-3 shadow-lg">
            <p className="text-sm text-yellow-200">{sessionExpiredMessage}</p>
            <button
              onClick={dismissSessionExpired}
              className="text-yellow-400 hover:text-yellow-200 text-lg leading-none"
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  )
}
