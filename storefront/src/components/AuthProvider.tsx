"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
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

type Customer = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
}

type AuthContextType = {
  isAuthenticated: boolean
  customer: Customer | null
  loading: boolean
  hasWonAuction: boolean
  cartCount: number
  login: (email: string, password: string) => Promise<void>
  register: (
    email: string,
    password: string,
    firstName: string,
    lastName: string
  ) => Promise<void>
  logout: () => void
  refreshStatus: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  customer: null,
  loading: true,
  hasWonAuction: false,
  cartCount: 0,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  refreshStatus: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasWonAuction, setHasWonAuction] = useState(false)
  const [cartCount, setCartCount] = useState(0)

  const fetchStatus = useCallback(async (token: string) => {
    try {
      const res = await fetch(`${MEDUSA_URL}/store/account/status`, {
        headers: {
          "x-publishable-api-key": PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
        },
      })
      if (res.ok) {
        const data = await res.json()
        setHasWonAuction(data.has_won_auction || false)
        setCartCount(data.cart_count || 0)
      }
    } catch {
      // silently fail
    }
  }, [])

  const refreshStatus = useCallback(async () => {
    const token = getToken()
    if (token) await fetchStatus(token)
  }, [fetchStatus])

  // Load customer from token on mount
  useEffect(() => {
    const token = getToken()
    if (token) {
      Promise.all([
        getCustomer(token).then((c) => {
          if (c) setCustomer(c)
          else clearToken()
        }),
        fetchStatus(token),
      ])
        .catch(() => clearToken())
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [fetchStatus])

  const login = useCallback(async (email: string, password: string) => {
    const token = await authLogin(email, password)
    setToken(token)
    const c = await getCustomer(token)
    setCustomer(c)
    await fetchStatus(token)
  }, [fetchStatus])

  const register = useCallback(
    async (
      email: string,
      password: string,
      firstName: string,
      lastName: string
    ) => {
      const token = await authRegister(email, password, firstName, lastName)
      setToken(token)
      const c = await getCustomer(token)
      setCustomer(c)
      await fetchStatus(token)
    },
    [fetchStatus]
  )

  const logout = useCallback(() => {
    clearToken()
    setCustomer(null)
    setHasWonAuction(false)
    setCartCount(0)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!customer,
        customer,
        loading,
        hasWonAuction,
        cartCount,
        login,
        register,
        logout,
        refreshStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
