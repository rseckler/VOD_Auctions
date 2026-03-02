"use client"

import { useState } from "react"
import { useAuth } from "./AuthProvider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "login" ? "Anmelden" : "Registrieren"}
          </DialogTitle>
          <DialogDescription>
            {mode === "login"
              ? "Melden Sie sich an, um zu bieten."
              : "Erstellen Sie ein Konto, um zu bieten."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">Vorname</Label>
                <Input
                  id="firstName"
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Nachname</Label>
                <Input
                  id="lastName"
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">E-Mail</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Passwort</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading
              ? "Bitte warten…"
              : mode === "login"
                ? "Anmelden"
                : "Konto erstellen"}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground mt-2">
          {mode === "login" ? (
            <>
              Noch kein Konto?{" "}
              <button
                onClick={() => { setMode("register"); setError("") }}
                className="text-primary hover:underline"
              >
                Registrieren
              </button>
            </>
          ) : (
            <>
              Bereits registriert?{" "}
              <button
                onClick={() => { setMode("login"); setError("") }}
                className="text-primary hover:underline"
              >
                Anmelden
              </button>
            </>
          )}
        </p>
      </DialogContent>
    </Dialog>
  )
}
