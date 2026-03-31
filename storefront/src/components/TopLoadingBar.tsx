"use client"
import { useEffect, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"

export function TopLoadingBar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Navigation completed — complete the bar
    setProgress(100)
    completeTimerRef.current = setTimeout(() => {
      setVisible(false)
      setProgress(0)
    }, 400)

    return () => {
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current)
    }
  }, [pathname, searchParams])

  // Intercept link clicks to start the bar on navigation
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = (e.target as HTMLElement).closest("a")
      if (!target) return
      const href = target.getAttribute("href")
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("http")) return

      setVisible(true)
      setProgress(15)

      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 85) {
            if (timerRef.current) clearInterval(timerRef.current)
            return 85
          }
          return prev + (85 - prev) * 0.1
        })
      }, 100)
    }

    document.addEventListener("click", handleClick)
    return () => {
      document.removeEventListener("click", handleClick)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  if (!visible && progress === 0) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] h-[2px] pointer-events-none"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 300ms" }}
    >
      <div
        className="h-full bg-[#d4a54a]"
        style={{
          width: `${progress}%`,
          transition: progress === 100 ? "width 200ms ease-out" : "width 300ms ease-out",
        }}
      />
    </div>
  )
}
