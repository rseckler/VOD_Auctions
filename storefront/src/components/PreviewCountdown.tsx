"use client"

import { useState, useEffect } from "react"
import { Clock } from "lucide-react"

function computeCountdown(startTime: string): string {
  const diff = new Date(startTime).getTime() - Date.now()
  if (diff <= 0) return "Starting now"
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  const seconds = Math.floor((diff % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}

export function PreviewCountdown({ startTime }: { startTime: string }) {
  const [countdown, setCountdown] = useState(() => computeCountdown(startTime))

  useEffect(() => {
    const id = setInterval(() => setCountdown(computeCountdown(startTime)), 1000)
    return () => clearInterval(id)
  }, [startTime])

  return (
    <div className="ml-auto pl-6 border-l border-amber-500/20">
      <div className="text-[11px] uppercase tracking-[1px] text-amber-500/60 font-medium mb-1">
        Bidding opens in
      </div>
      <div className="flex items-center gap-2 text-amber-400 font-bold">
        <Clock className="h-5 w-5" />
        <span className="font-serif text-3xl md:text-4xl leading-none">
          {countdown}
        </span>
      </div>
    </div>
  )
}
