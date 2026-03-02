"use client"

import { User } from "lucide-react"

export default function SettingsPage() {
  return (
    <div>
      <h1 className="font-serif text-2xl sm:text-3xl mb-8">Einstellungen</h1>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h3 className="font-medium">Max Mustermann</h3>
            <p className="text-sm text-muted-foreground">max@example.de</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Name</label>
            <input
              type="text"
              defaultValue="Max Mustermann"
              readOnly
              className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground opacity-70 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">E-Mail</label>
            <input
              type="email"
              defaultValue="max@example.de"
              readOnly
              className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground opacity-70 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Mitglied seit</label>
            <input
              type="text"
              defaultValue="März 2026"
              readOnly
              className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground opacity-70 cursor-not-allowed"
            />
          </div>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Profil-Bearbeitung ist im Clickdummy deaktiviert.
        </p>
      </div>
    </div>
  )
}
