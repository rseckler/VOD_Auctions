export type TimeUrgency = {
  text: string
  level: "critical" | "urgent" | "normal" | "ended"
}

export function getTimeUrgency(endTime: string): TimeUrgency {
  const diff = new Date(endTime).getTime() - Date.now()
  if (diff <= 0) return { text: "Ended", level: "ended" }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)

  if (diff < 5 * 60 * 1000) {
    const text = diff < 60 * 1000 ? `${seconds}s left` : `${minutes}m ${seconds}s left`
    return { text, level: "critical" }
  }
  if (diff < 60 * 60 * 1000) {
    return { text: `${minutes}m ${seconds}s left`, level: "urgent" }
  }

  if (days > 0) return { text: `${days}d ${hours}h left`, level: "normal" }
  return { text: `${hours}h ${minutes}m left`, level: "normal" }
}
