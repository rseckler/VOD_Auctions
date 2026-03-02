import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
}: {
  icon: LucideIcon
  title: string
  description?: string
  actionLabel?: string
  actionHref?: string
}) {
  return (
    <div className="text-center py-16">
      <Icon className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
      <p className="text-muted-foreground font-medium mb-1">{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground/70 mb-4">{description}</p>
      )}
      {actionLabel && actionHref && (
        <Button variant="outline" size="sm" asChild>
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
    </div>
  )
}
