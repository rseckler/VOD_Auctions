"use client"
import { EmailFrame, EmailHeader, EmailFooter } from "@/components/EmailFrame"

export default function WelcomeEmail() {
  return (
    <EmailFrame subject="Willkommen bei VOD Auctions!">
      <EmailHeader />
      <div className="px-6 py-6">
        <h2 className="text-lg font-bold text-zinc-900 mb-2">Willkommen, Max!</h2>
        <p className="text-zinc-600 mb-4 leading-relaxed">
          Schön, dass du dabei bist. VOD Auctions ist deine Plattform für kuratierte Auktionen seltener Tonträger
          aus den Bereichen Industrial, Experimental & Electronic Music.
        </p>
        <p className="text-zinc-600 mb-4 leading-relaxed">
          Über 30.000 Tonträger warten in thematisch kuratierten Auktionsblöcken auf neue Besitzer.
        </p>
        <div className="rounded-lg bg-zinc-50 p-4 mb-4">
          <p className="text-xs text-zinc-500 mb-1">Dein nächster Schritt:</p>
          <p className="text-sm font-medium text-zinc-900">Stöbere durch unsere aktuellen Auktionen und gib dein erstes Gebot ab!</p>
        </div>
        <a className="block w-full rounded-lg bg-[#d4a54a] py-3 text-center text-sm font-semibold text-[#1c1915]">
          Zu den Auktionen
        </a>
      </div>
      <EmailFooter />
    </EmailFrame>
  )
}
