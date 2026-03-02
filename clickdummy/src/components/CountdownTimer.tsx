"use client"

import { useEffect, useState } from "react"
import { useFlow } from "@/context/FlowContext"

interface Props {
  endDate: string
  className?: string
}

export function CountdownTimer({ endDate, className = "" }: Props) {
  const { step } = useFlow()
  const [time, setTime] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })

  const isEnding = step >= 5

  useEffect(() => {
    const calc = () => {
      const diff = new Date(endDate).getTime() - Date.now()
      if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 }
      return {
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      }
    }
    setTime(calc())
    const id = setInterval(() => setTime(calc()), 1000)
    return () => clearInterval(id)
  }, [endDate])

  if (isEnding) {
    return (
      <span className={`inline-flex items-center gap-1 text-destructive font-mono animate-pulse ${className}`}>
        <span className="h-2 w-2 rounded-full bg-destructive" />
        04:37
      </span>
    )
  }

  const parts = [
    { value: time.days, label: "T" },
    { value: time.hours, label: "Std" },
    { value: time.minutes, label: "Min" },
    { value: time.seconds, label: "Sek" },
  ]

  return (
    <span className={`inline-flex items-center gap-1 font-mono text-sm ${className}`}>
      {parts.map((p, i) => (
        <span key={i}>
          <span className="text-foreground">{String(p.value).padStart(2, "0")}</span>
          <span className="text-muted-foreground text-xs">{p.label}</span>
          {i < parts.length - 1 && <span className="text-muted-foreground mx-0.5">:</span>}
        </span>
      ))}
    </span>
  )
}
