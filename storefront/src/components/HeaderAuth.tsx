"use client"

import { useState } from "react"
import Link from "next/link"
import { User, Gavel, Trophy, Settings, LogOut } from "lucide-react"
import { useAuth } from "./AuthProvider"
import { AuthModal } from "./AuthModal"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function HeaderAuth() {
  const { isAuthenticated, customer, logout, loading } = useAuth()
  const [authModalOpen, setAuthModalOpen] = useState(false)

  if (loading) return null

  if (isAuthenticated && customer) {
    const initials =
      (customer.first_name?.[0] || "") + (customer.last_name?.[0] || "")
    const displayName = customer.first_name || customer.email

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-gradient-to-br from-primary/30 to-primary/10 text-primary text-xs font-medium">
                {initials || "U"}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {displayName}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild>
            <Link href="/account" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              My Account
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/account/bids" className="flex items-center gap-2">
              <Gavel className="h-4 w-4" />
              My Bids
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/account/wins" className="flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              Won
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/account/settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              if (window.confirm("Are you sure you want to log out?")) logout()
            }}
            className="flex items-center gap-2 text-muted-foreground"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <>
      <Button
        size="sm"
        onClick={() => setAuthModalOpen(true)}
        className="bg-gradient-to-r from-primary to-[#b8860b]"
      >
        Login
      </Button>
      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
    </>
  )
}
