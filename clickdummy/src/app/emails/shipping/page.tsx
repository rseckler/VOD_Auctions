"use client"
import { EmailFrame, EmailHeader, EmailFooter } from "@/components/EmailFrame"

export default function ShippingEmail() {
  return (
    <EmailFrame subject="Dein Paket ist unterwegs! 📦">
      <EmailHeader />
      <div className="px-6 py-6">
        <h2 className="text-lg font-bold text-zinc-900 mb-2">Dein Paket ist unterwegs!</h2>
        <p className="text-sm text-zinc-600 mb-4">
          Hallo Max, deine Bestellung wurde versendet und ist auf dem Weg zu dir.
        </p>
        <div className="rounded-lg bg-sky-50 border border-sky-200 p-3 mb-4 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-zinc-500">Versandart</span>
            <span className="text-zinc-900">DHL Paket</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Sendungsnr.</span>
            <span className="font-mono text-zinc-900">123456789012</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Voraussichtlich</span>
            <span className="text-zinc-900">05.03.2026</span>
          </div>
        </div>
        <div className="flex gap-3 mb-4 p-3 bg-zinc-50 rounded-lg">
          <img src="https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=60&h=60&fit=crop" alt="" className="h-12 w-12 rounded object-cover" />
          <div>
            <p className="text-sm font-medium text-zinc-900">Lustmord — The Place Where the Black Stars Hang</p>
            <p className="text-xs text-zinc-500">Vinyl, NM/NM — Bestellung #VOD-2026-0042</p>
          </div>
        </div>
        <div className="rounded-lg bg-zinc-50 p-3 mb-4 text-sm">
          <p className="text-xs text-zinc-500 mb-1">Lieferadresse</p>
          <p className="text-zinc-900">Max Mustermann<br/>Musterstraße 42<br/>10115 Berlin</p>
        </div>
        <a className="block w-full rounded-lg bg-[#d4a54a] py-3 text-center text-sm font-semibold text-[#1c1915]">
          Sendung verfolgen
        </a>
      </div>
      <EmailFooter />
    </EmailFrame>
  )
}
