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
  login: (email: string, password: string) => Promise<void>
  register: (
    email: string,
    password: string,
    firstName: string,
    lastName: string
  ) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  customer: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)

  // Load customer from token on mount
  useEffect(() => {
    const token = getToken()
    if (token) {
      getCustomer(token)
        .then((c) => {
          if (c) setCustomer(c)
          else clearToken()
        })
        .catch(() => clearToken())
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const token = await authLogin(email, password)
    setToken(token)
    const c = await getCustomer(token)
    setCustomer(c)
  }, [])

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
    },
    []
  )

  const logout = useCallback(() => {
    clearToken()
    setCustomer(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!customer,
        customer,
        loading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
