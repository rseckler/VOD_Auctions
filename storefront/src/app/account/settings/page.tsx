"use client"

import { useAuth } from "@/components/AuthProvider"

export default function SettingsPage() {
  const { customer } = useAuth()

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Einstellungen</h2>

      <div className="space-y-6">
        <div className="p-6 rounded-lg border border-zinc-800 bg-zinc-900">
          <h3 className="text-sm font-medium text-zinc-400 mb-4">
            Profil-Informationen
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-zinc-500">Vorname</label>
              <p className="text-sm mt-1">
                {customer?.first_name || "—"}
              </p>
            </div>
            <div>
              <label className="text-xs text-zinc-500">Nachname</label>
              <p className="text-sm mt-1">
                {customer?.last_name || "—"}
              </p>
            </div>
            <div>
              <label className="text-xs text-zinc-500">E-Mail</label>
              <p className="text-sm mt-1">{customer?.email || "—"}</p>
            </div>
          </div>
        </div>

        <div className="p-6 rounded-lg border border-zinc-800 bg-zinc-900">
          <h3 className="text-sm font-medium text-zinc-400 mb-2">
            Passwort ändern
          </h3>
          <p className="text-sm text-zinc-500">
            Diese Funktion wird in Kürze verfügbar sein.
          </p>
        </div>
      </div>
    </div>
  )
}
