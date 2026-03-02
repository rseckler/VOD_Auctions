"use client"

import { useState } from "react"
import { useFlow } from "@/context/FlowContext"
import { X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

export function AuthModal({ onClose }: { onClose: () => void }) {
  const { login } = useFlow()
  const [tab, setTab] = useState<"login" | "register">("register")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    login()
    onClose()
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-serif text-2xl">
              {tab === "login" ? "Willkommen zurück" : "Konto erstellen"}
            </h2>
            <button onClick={onClose} className="rounded-full p-1.5 hover:bg-secondary transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex gap-1 rounded-lg bg-secondary p-1 mb-6">
            <button
              onClick={() => setTab("login")}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${tab === "login" ? "bg-card text-foreground" : "text-muted-foreground"}`}
            >
              Anmelden
            </button>
            <button
              onClick={() => setTab("register")}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${tab === "register" ? "bg-card text-foreground" : "text-muted-foreground"}`}
            >
              Registrieren
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === "register" && (
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Name</label>
                <input
                  type="text"
                  defaultValue="Max Mustermann"
                  className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">E-Mail</label>
              <input
                type="email"
                defaultValue="max@example.de"
                className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Passwort</label>
              <input
                type="password"
                defaultValue="demo1234"
                className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {tab === "login" ? "Anmelden" : "Konto erstellen"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Demo-Modus — keine echten Daten nötig
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
