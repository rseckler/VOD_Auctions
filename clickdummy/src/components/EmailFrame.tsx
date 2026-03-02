"use client"

import { Smartphone } from "lucide-react"

export function EmailFrame({ children, subject }: { children: React.ReactNode; subject: string }) {
  return (
    <div className="flex flex-col items-center py-12 px-4">
      <h2 className="font-serif text-2xl mb-2">E-Mail Vorschau</h2>
      <p className="text-sm text-muted-foreground mb-8">Betreff: {subject}</p>

      <div className="relative mx-auto w-full max-w-sm">
        {/* Phone frame */}
        <div className="rounded-[2.5rem] border-[3px] border-zinc-700 bg-white p-3 shadow-2xl">
          {/* Notch */}
          <div className="mx-auto mb-2 h-5 w-24 rounded-full bg-zinc-700" />
          {/* Screen */}
          <div className="rounded-2xl overflow-hidden bg-white text-zinc-900 text-sm min-h-[500px] max-h-[600px] overflow-y-auto">
            {children}
          </div>
          {/* Home indicator */}
          <div className="mx-auto mt-2 h-1 w-28 rounded-full bg-zinc-300" />
        </div>
      </div>
    </div>
  )
}

export function EmailHeader() {
  return (
    <div className="bg-[#1c1915] px-6 py-6 text-center">
      <div className="flex items-center justify-center gap-2 mb-1">
        <div className="h-5 w-5 rounded-full bg-[#d4a54a] flex items-center justify-center text-[10px] font-bold text-[#1c1915]">V</div>
        <span className="text-[#d4a54a] font-semibold text-sm">VOD Auctions</span>
      </div>
    </div>
  )
}

export function EmailFooter() {
  return (
    <div className="border-t border-zinc-200 px-6 py-4 text-center text-[11px] text-zinc-400">
      <p>VOD Auctions &mdash; Kuratierte Musik-Auktionen</p>
      <p className="mt-1">
        <span className="underline">Abbestellen</span> &middot; <span className="underline">Einstellungen</span>
      </p>
    </div>
  )
}
