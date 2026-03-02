"use client"
import { EmailFrame, EmailHeader, EmailFooter } from "@/components/EmailFrame"

export default function FeedbackEmail() {
  return (
    <EmailFrame subject="Wie war dein Einkauf bei VOD Auctions?">
      <EmailHeader />
      <div className="px-6 py-6">
        <h2 className="text-lg font-bold text-zinc-900 mb-2">Wie war dein Einkauf?</h2>
        <p className="text-sm text-zinc-600 mb-4">
          Hallo Max, dein Tonträger sollte inzwischen angekommen sein. Wir hoffen, du bist zufrieden!
        </p>
        <div className="flex gap-3 mb-4 p-3 bg-zinc-50 rounded-lg">
          <img src="https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=60&h=60&fit=crop" alt="" className="h-12 w-12 rounded object-cover" />
          <div>
            <p className="text-sm font-medium text-zinc-900">Lustmord — The Place Where the Black Stars Hang</p>
            <p className="text-xs text-zinc-500">Vinyl, NM/NM</p>
          </div>
        </div>
        <p className="text-sm text-zinc-600 mb-4">
          Dein Feedback hilft uns, VOD Auctions noch besser zu machen. Wie bewertest du deinen Einkauf?
        </p>
        <div className="flex justify-center gap-2 mb-4">
          {["😟", "😐", "🙂", "😊", "🤩"].map((emoji, i) => (
            <button key={i} className="h-10 w-10 rounded-full bg-zinc-100 text-xl hover:bg-zinc-200 transition-colors">
              {emoji}
            </button>
          ))}
        </div>
        <div className="border-t border-zinc-200 pt-4 mt-4">
          <p className="text-xs text-zinc-500 mb-2">Oder schreib uns direkt:</p>
          <div className="rounded-lg border border-zinc-300 p-2 mb-3">
            <textarea rows={3} placeholder="Dein Feedback..." className="w-full text-sm text-zinc-900 resize-none outline-none placeholder:text-zinc-400" />
          </div>
          <a className="block w-full rounded-lg bg-[#d4a54a] py-3 text-center text-sm font-semibold text-[#1c1915]">
            Feedback senden
          </a>
        </div>
        <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3">
          <p className="text-sm text-amber-800 font-medium mb-1">Neue Auktionen warten!</p>
          <p className="text-xs text-amber-600">
            Schau dir unsere kommenden Blöcke an: EBM Classics und Noise Japan starten bald.
          </p>
        </div>
      </div>
      <EmailFooter />
    </EmailFrame>
  )
}
