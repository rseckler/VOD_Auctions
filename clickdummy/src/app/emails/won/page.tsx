"use client"
import { EmailFrame, EmailHeader, EmailFooter } from "@/components/EmailFrame"

export default function WonEmail() {
  return (
    <EmailFrame subject="Zuschlag! Du hast Lot #07 gewonnen">
      <EmailHeader />
      <div className="px-6 py-6">
        <div className="text-center mb-4">
          <div className="text-3xl mb-1">🎉</div>
          <h2 className="text-lg font-bold text-zinc-900">Glückwunsch, Max!</h2>
          <p className="text-sm text-zinc-500">Du hast den Zuschlag erhalten.</p>
        </div>
        <div className="flex gap-3 mb-4">
          <img src="https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=60&h=60&fit=crop" alt="" className="h-14 w-14 rounded-lg object-cover" />
          <div>
            <p className="text-xs text-zinc-500">Lot #07 — Dark Ambient & Drone</p>
            <p className="text-sm font-medium text-zinc-900">Lustmord — The Place Where the Black Stars Hang</p>
            <p className="text-xs text-zinc-500">Vinyl, NM/NM, 1994</p>
          </div>
        </div>
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 mb-4 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-600">Zuschlagspreis</span>
            <span className="text-green-700 font-bold">92,00 EUR</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-zinc-500">+ Versand</span>
            <span className="text-zinc-600">5,90 EUR</span>
          </div>
          <div className="flex justify-between mt-2 pt-2 border-t border-green-200">
            <span className="font-semibold text-zinc-900">Gesamt</span>
            <span className="font-bold text-zinc-900">97,90 EUR</span>
          </div>
        </div>
        <p className="text-sm text-zinc-600 mb-4">
          Bitte bezahle innerhalb von 7 Tagen, damit wir deinen Tonträger schnell versenden können.
        </p>
        <a className="block w-full rounded-lg bg-[#d4a54a] py-3 text-center text-sm font-semibold text-[#1c1915]">
          Jetzt bezahlen
        </a>
      </div>
      <EmailFooter />
    </EmailFrame>
  )
}
