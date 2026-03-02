"use client"

import { useState } from "react"
import { useAuth } from "./AuthProvider"
import { AuthModal } from "./AuthModal"

export function HeaderAuth() {
  const { isAuthenticated, customer, logout, loading } = useAuth()
  const [authModalOpen, setAuthModalOpen] = useState(false)

  if (loading) return null

  if (isAuthenticated && customer) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-400">
          {customer.first_name || customer.email}
        </span>
        <button
          onClick={logout}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Abmelden
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setAuthModalOpen(true)}
        className="px-3 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
      >
        Anmelden
      </button>
      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </>
  )
}
