"use client"

import { useFlow, FLOW_STEPS } from "@/context/FlowContext"
import { useRouter } from "next/navigation"
import { ChevronRight, RotateCcw } from "lucide-react"
import { motion } from "framer-motion"

export function FlowGuide() {
  const { step, advance, reset } = useFlow()
  const router = useRouter()

  const current = FLOW_STEPS[step]
  const isLast = step >= 9

  const handleAdvance = () => {
    const path = advance()
    router.push(path)
  }

  const handleReset = () => {
    reset()
    router.push("/")
  }

  return (
    <motion.div
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      className="fixed bottom-0 left-0 right-0 z-[90] border-t border-primary/20 bg-card/95 backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="hidden sm:inline shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            {step + 1}/10
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{current.name}</p>
            <p className="text-xs text-muted-foreground truncate">{current.description}</p>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-1.5 mx-4">
          {FLOW_STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 w-1.5 rounded-full transition-colors ${
                i <= step ? "bg-primary" : "bg-secondary"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Zurücksetzen</span>
          </button>
          {!isLast && (
            <button
              onClick={handleAdvance}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Nächster Schritt
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}
