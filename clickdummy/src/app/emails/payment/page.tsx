"use client"
import { EmailFrame, EmailHeader, EmailFooter } from "@/components/EmailFrame"

export default function PaymentEmail() {
  return (
    <EmailFrame subject="Zahlungsbestätigung — Bestellung #VOD-2026-0042">
      <EmailHeader />
      <div className="px-6 py-6">
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 mb-4 flex items-center gap-2">
          <span className="text-green-600">✓</span>
          <p className="text-sm font-semibold text-green-700">Zahlung erfolgreich eingegangen</p>
        </div>
        <p className="text-sm text-zinc-600 mb-4">
          Hallo Max, wir haben deine Zahlung erhalten. Deine Bestellung wird jetzt für den Versand vorbereitet.
        </p>
        <div className="rounded-lg bg-zinc-50 p-3 mb-4 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-zinc-500">Bestellnummer</span>
            <span className="font-mono text-zinc-900">#VOD-2026-0042</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Bezahlt am</span>
            <span className="text-zinc-900">02.03.2026</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Betrag</span>
            <span className="text-zinc-900 font-semibold">97,90 EUR</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Zahlungsart</span>
            <span className="text-zinc-900">Kreditkarte (****4242)</span>
          </div>
        </div>
        <div className="flex gap-3 mb-4 p-3 bg-zinc-50 rounded-lg">
          <img src="https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=60&h=60&fit=crop" alt="" className="h-12 w-12 rounded object-cover" />
          <div>
            <p className="text-sm font-medium text-zinc-900">Lustmord — The Place Where the Black Stars Hang</p>
            <p className="text-xs text-zinc-500">Vinyl, NM/NM</p>
          </div>
        </div>
        <a className="block w-full rounded-lg border border-zinc-300 py-3 text-center text-sm font-medium text-zinc-700">
          Bestellung ansehen
        </a>
      </div>
      <EmailFooter />
    </EmailFrame>
  )
}
