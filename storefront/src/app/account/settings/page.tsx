"use client"

import { useAuth } from "@/components/AuthProvider"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

export default function SettingsPage() {
  const { customer } = useAuth()

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Einstellungen</h2>

      <div className="space-y-6">
        <Card className="p-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">
            Profil-Informationen
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground">Vorname</Label>
              <p className="text-sm mt-1">
                {customer?.first_name || "—"}
              </p>
            </div>
            <div>
              <Label className="text-muted-foreground">Nachname</Label>
              <p className="text-sm mt-1">
                {customer?.last_name || "—"}
              </p>
            </div>
            <div>
              <Label className="text-muted-foreground">E-Mail</Label>
              <p className="text-sm mt-1">{customer?.email || "—"}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">
            Passwort ändern
          </h3>
          <Separator className="my-3" />
          <p className="text-sm text-muted-foreground">
            Diese Funktion wird in Kürze verfügbar sein.
          </p>
        </Card>
      </div>
    </div>
  )
}
