"use client"

import { useState } from "react"
import { useAuth } from "./AuthProvider"

type AuthModalProps = {
  open: boolean
  onClose: () => void
}

export function AuthModal({ open, onClose }: AuthModalProps) {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<"login" | "register">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      if (mode === "login") {
        await login(email, password)
      } else {
        await register(email, password, firstName, lastName)
      }
      onClose()
    } catch (err: any) {
      setError(err.message || "Fehler")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-500 hover:text-white text-lg"
        >
          &times;
        </button>

        <h2 className="text-xl font-bold mb-1">
          {mode === "login" ? "Anmelden" : "Registrieren"}
        </h2>
        <p className="text-sm text-zinc-400 mb-6">
          {mode === "login"
            ? "Melden Sie sich an, um zu bieten."
            : "Erstellen Sie ein Konto, um zu bieten."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-500">Vorname</label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:border-zinc-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500">Nachname</label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:border-zinc-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-zinc-500">E-Mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:border-zinc-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-500">Passwort</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:border-zinc-500 focus:outline-none"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-white text-black font-medium text-sm hover:bg-zinc-200 disabled:opacity-50 transition-colors"
          >
            {loading
              ? "Bitte warten…"
              : mode === "login"
                ? "Anmelden"
                : "Konto erstellen"}
          </button>
        </form>

        <p className="text-center text-xs text-zinc-500 mt-4">
          {mode === "login" ? (
            <>
              Noch kein Konto?{" "}
              <button
                onClick={() => { setMode("register"); setError("") }}
                className="text-white hover:underline"
              >
                Registrieren
              </button>
            </>
          ) : (
            <>
              Bereits registriert?{" "}
              <button
                onClick={() => { setMode("login"); setError("") }}
                className="text-white hover:underline"
              >
                Anmelden
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
