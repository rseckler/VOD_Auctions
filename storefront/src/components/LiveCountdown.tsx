"use client"

import { useState, useEffect } from "react"
import { Clock } from "lucide-react"
import { getTimeUrgency } from "@/lib/time-utils"

const URGENCY_COLORS: Record<string, string> = {
  critical: "text-red-400",
  urgent: "text-status-active",
  normal: "text-status-active",
  ended: "text-muted-foreground/60",
}

export function LiveCountdown({
  endTime,
  className,
  showIcon = false,
  size = "sm",
}: {
  endTime: string
  className?: string
  showIcon?: boolean
  size?: "sm" | "lg"
}) {
  const [, setTick] = useState(0)

  useEffect(() => {
    const diff = new Date(endTime).getTime() - Date.now()
    if (diff <= 0) return

    // Tick every second when < 1 hour, every 30s otherwise
    const interval = diff < 3600000 ? 1000 : 30000
    const id = setInterval(() => setTick((t) => t + 1), interval)
    return () => clearInterval(id)
  }, [endTime])

  const urgency = getTimeUrgency(endTime)
  const color = URGENCY_COLORS[urgency.level]

  if (size === "lg") {
    return (
      <div className={`flex items-center gap-2 ${color} font-bold ${className || ""}`}>
        <Clock className="h-5 w-5" />
        <span className="font-serif text-3xl md:text-4xl leading-none">
          {urgency.text}
        </span>
      </div>
    )
  }

  return (
    <span className={`flex items-center gap-1 ${color} ${className || ""}`}>
      {showIcon && <Clock className="h-3 w-3" />}
      {urgency.text}
    </span>
  )
}
