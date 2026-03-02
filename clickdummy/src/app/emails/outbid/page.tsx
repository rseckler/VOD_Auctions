"use client"
import { EmailFrame, EmailHeader, EmailFooter } from "@/components/EmailFrame"

export default function OutbidEmail() {
  return (
    <EmailFrame subject="Du wurdest überboten — Lot #07">
      <EmailHeader />
      <div className="px-6 py-6">
        <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 mb-4">
          <p className="text-sm font-semibold text-orange-700">Du wurdest überboten!</p>
        </div>
        <div className="flex gap-3 mb-4">
          <img src="https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=60&h=60&fit=crop" alt="" className="h-14 w-14 rounded-lg object-cover" />
          <div>
            <p className="text-xs text-zinc-500">Lot #07 — Dark Ambient & Drone</p>
            <p className="text-sm font-medium text-zinc-900">Lustmord — The Place Where the Black Stars Hang</p>
          </div>
        </div>
        <div className="rounded-lg bg-zinc-50 p-3 mb-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-500">Dein Gebot</span>
            <span className="text-zinc-900 line-through">82,00 EUR</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Aktuelles Höchstgebot</span>
            <span className="text-orange-600 font-semibold">85,00 EUR</span>
          </div>
        </div>
        <p className="text-zinc-600 text-sm mb-4">
          Ein anderer Bieter hat dich überholt. Die Auktion läuft noch — biete jetzt erneut!
        </p>
        <a className="block w-full rounded-lg bg-[#d4a54a] py-3 text-center text-sm font-semibold text-[#1c1915]">
          Jetzt neu bieten
        </a>
      </div>
      <EmailFooter />
    </EmailFrame>
  )
}
