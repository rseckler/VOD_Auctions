"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useFlow } from "@/context/FlowContext"
import { User, Gavel, Trophy, Settings, ArrowLeft } from "lucide-react"

const navItems = [
  { href: "/account", label: "Übersicht", icon: User },
  { href: "/account/bids", label: "Meine Gebote", icon: Gavel },
  { href: "/account/wins", label: "Gewonnen", icon: Trophy },
  { href: "/account/settings", label: "Einstellungen", icon: Settings },
]

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { isLoggedIn } = useFlow()

  if (!isLoggedIn) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-24 text-center">
        <h1 className="font-serif text-3xl mb-4">Anmeldung erforderlich</h1>
        <p className="text-muted-foreground mb-6">Bitte melde dich an, um deinen Account zu sehen.</p>
        <Link href="/" className="text-primary hover:underline flex items-center justify-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Zur Startseite
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar */}
        <nav className="lg:w-56 shrink-0">
          <div className="flex lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm shrink-0 transition-colors ${
                    isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  )
}
