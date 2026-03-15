"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/components/AuthProvider"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"
import { getToken } from "@/lib/auth"
import { toast } from "sonner"
import { Pencil, Check, X, Loader2, AlertTriangle } from "lucide-react"

export default function SettingsPage() {
  const { customer, refreshCustomer } = useAuth()

  // Profile editing
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [profileSaving, setProfileSaving] = useState(false)

  // Password change
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState("")

  // Account deletion
  const [deleteConfirmation, setDeleteConfirmation] = useState("")

  // Newsletter
  const [newsletterOptin, setNewsletterOptin] = useState(false)
  const [newsletterLoading, setNewsletterLoading] = useState(true)
  const [newsletterSaving, setNewsletterSaving] = useState(false)

  // Sync profile fields when customer loads
  useEffect(() => {
    if (customer) {
      setFirstName(customer.first_name || "")
      setLastName(customer.last_name || "")
    }
  }, [customer])

  const fetchNewsletterStatus = useCallback(async () => {
    const token = getToken()
    if (!token) return
    try {
      const res = await fetch(`${MEDUSA_URL}/store/account/newsletter`, {
        headers: {
          "x-publishable-api-key": PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
        },
      })
      if (res.ok) {
        const data = await res.json()
        setNewsletterOptin(data.newsletter_optin || false)
      }
    } catch {
      // silently fail
    } finally {
      setNewsletterLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNewsletterStatus()
  }, [fetchNewsletterStatus])

  async function toggleNewsletter() {
    const token = getToken()
    if (!token) return
    setNewsletterSaving(true)
    const newValue = !newsletterOptin
    try {
      const res = await fetch(`${MEDUSA_URL}/store/account/newsletter`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newsletter_optin: newValue }),
      })
      if (res.ok) {
        setNewsletterOptin(newValue)
      }
    } catch {
      // silently fail
    } finally {
      setNewsletterSaving(false)
    }
  }

  // --- Profile save ---
  async function handleProfileSave() {
    const token = getToken()
    if (!token) return

    setProfileSaving(true)
    try {
      const res = await fetch(`${MEDUSA_URL}/store/customers/me`, {
        method: "POST",
        headers: {
          "x-publishable-api-key": PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        }),
      })
      if (res.ok) {
        toast.success("Profile updated successfully")
        setIsEditingProfile(false)
        refreshCustomer()
      } else {
        toast.error("Failed to update profile")
      }
    } catch {
      toast.error("Failed to update profile")
    } finally {
      setProfileSaving(false)
    }
  }

  function handleProfileCancel() {
    setFirstName(customer?.first_name || "")
    setLastName(customer?.last_name || "")
    setIsEditingProfile(false)
  }

  // --- Password change ---
  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError("")

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters")
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match")
      return
    }

    setPasswordSaving(true)
    try {
      // Step 1: Authenticate with current password to get a fresh token
      const authRes = await fetch(`${MEDUSA_URL}/auth/customer/emailpass`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: customer?.email,
          password: currentPassword,
        }),
      })

      if (!authRes.ok) {
        setPasswordError("Current password is incorrect")
        setPasswordSaving(false)
        return
      }

      const authData = await authRes.json()
      const freshToken = authData.token

      // Step 2: Update password with fresh token
      const updateRes = await fetch(
        `${MEDUSA_URL}/auth/customer/emailpass/update`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${freshToken}`,
          },
          body: JSON.stringify({ password: newPassword }),
        }
      )

      if (updateRes.ok) {
        toast.success("Password changed successfully")
        setCurrentPassword("")
        setNewPassword("")
        setConfirmPassword("")
      } else {
        setPasswordError("Failed to update password. Please try again.")
      }
    } catch {
      setPasswordError("An error occurred. Please try again.")
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Settings</h2>

      <div className="space-y-6">
        {/* Profile Information */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">
              Profile Information
            </h3>
            {!isEditingProfile && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditingProfile(true)}
                className="gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            )}
          </div>

          {isEditingProfile ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                  />
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Email</Label>
                <p className="text-sm mt-1 text-muted-foreground">
                  {customer?.email || "---"}
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  onClick={handleProfileSave}
                  disabled={profileSaving}
                  className="gap-1.5"
                >
                  {profileSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleProfileCancel}
                  disabled={profileSaving}
                  className="gap-1.5"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">First Name</Label>
                <p className="text-sm mt-1">
                  {customer?.first_name || "\u2014"}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Last Name</Label>
                <p className="text-sm mt-1">
                  {customer?.last_name || "\u2014"}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Email</Label>
                <p className="text-sm mt-1">{customer?.email || "\u2014"}</p>
              </div>
            </div>
          )}
        </Card>

        {/* Newsletter */}
        <Card className="p-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">
            Newsletter
          </h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">VOD Auctions Newsletter</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Auction updates, new arrivals, and exclusive offers.
              </p>
            </div>
            <button
              onClick={toggleNewsletter}
              disabled={newsletterLoading || newsletterSaving}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                newsletterOptin ? "bg-primary" : "bg-muted"
              }`}
              role="switch"
              aria-checked={newsletterOptin}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out ${
                  newsletterOptin ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          {newsletterOptin && (
            <p className="text-xs text-muted-foreground mt-3">
              You can unsubscribe at any time by toggling this off or via the
              unsubscribe link in any newsletter email.
            </p>
          )}
        </Card>

        {/* Change Password */}
        <Card className="p-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">
            Change Password
          </h3>
          <Separator className="my-3" />
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  required
                  minLength={8}
                />
              </div>
            </div>
            {passwordError && (
              <p className="text-sm text-destructive">{passwordError}</p>
            )}
            <Button
              type="submit"
              size="sm"
              disabled={
                passwordSaving ||
                !currentPassword ||
                !newPassword ||
                !confirmPassword
              }
              className="gap-1.5"
            >
              {passwordSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Update Password
            </Button>
          </form>
        </Card>

        {/* Delete Account */}
        <Card className="p-6 border-destructive/30">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h3 className="text-sm font-medium text-destructive">
              Delete Account
            </h3>
          </div>
          <Separator className="my-3" />
          <p className="text-sm text-muted-foreground mb-4">
            This will permanently delete your account and all associated data.
            This action cannot be undone.
          </p>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="deleteConfirm" className="text-sm">
                Type <span className="font-mono font-semibold">DELETE</span> to
                confirm
              </Label>
              <Input
                id="deleteConfirm"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder="DELETE"
                className="max-w-xs"
              />
            </div>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteConfirmation !== "DELETE"}
              onClick={() => {
                toast.info(
                  "To delete your account, please contact info@vod-records.com"
                )
              }}
            >
              Request Account Deletion
            </Button>
            <p className="text-xs text-muted-foreground">
              To delete your account, please contact{" "}
              <a
                href="mailto:info@vod-records.com"
                className="text-primary hover:underline"
              >
                info@vod-records.com
              </a>
              .
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
