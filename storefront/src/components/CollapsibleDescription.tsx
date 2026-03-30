"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"

interface CollapsibleDescriptionProps {
  paragraphs: string[]
  maxLines?: number
}

export function CollapsibleDescription({ paragraphs, maxLines = 3 }: CollapsibleDescriptionProps) {
  const [expanded, setExpanded] = useState(false)

  const estimatedLineBreakParagraphs = 1 // ~3 lines = roughly 1 short paragraph
  const needsCollapse = paragraphs.length > estimatedLineBreakParagraphs || paragraphs.join(" ").length > 300

  return (
    <div>
      <div
        className={`prose prose-invert max-w-none prose-p:text-muted-foreground prose-p:leading-relaxed overflow-hidden transition-all duration-300`}
        style={
          !expanded && needsCollapse
            ? {
                display: "-webkit-box",
                WebkitLineClamp: maxLines,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }
            : undefined
        }
      >
        {paragraphs.map((p, i) =>
          p.trim() ? <p key={i}>{p}</p> : null
        )}
      </div>

      {needsCollapse && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-primary transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              Show more
            </>
          )}
        </button>
      )}
    </div>
  )
}
