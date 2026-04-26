// ─── VOD Auctions Admin UI Components ───────────────────────────────────────
// Reusable UI primitives. Every page imports from here.
import { useEffect, type CSSProperties, type ReactNode } from "react"
import { C, S, BADGE_VARIANTS } from "./admin-tokens"

// ─── Badge ─────────────────────────────────────────────────────────────────

type BadgeVariant = keyof typeof BADGE_VARIANTS

interface BadgeProps {
  label: string
  variant: BadgeVariant
}

export function Badge({ label, variant }: BadgeProps) {
  return <span style={BADGE_VARIANTS[variant]}>{label}</span>
}

// Custom color badge
export function ColorBadge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: "inline-block", fontSize: 11, fontWeight: 600, padding: "2px 8px",
      borderRadius: S.radius.sm, textTransform: "uppercase", letterSpacing: "0.03em",
      background: color + "12", color, border: `1px solid ${color}30`,
    }}>
      {label}
    </span>
  )
}

// ─── Toggle ────────────────────────────────────────────────────────────────

interface ToggleProps {
  active: boolean
  onChange: () => void
  disabled?: boolean
}

export function Toggle({ active, onChange, disabled }: ToggleProps) {
  return (
    <button
      onClick={disabled ? undefined : onChange}
      style={{
        width: 38, height: 20, borderRadius: 10, position: "relative",
        background: active ? C.success : C.border,
        border: "none", cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.2s", flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: active ? 21 : 3,
        width: 14, height: 14, borderRadius: 7, background: "#fff",
        transition: "left 0.15s",
      }} />
    </button>
  )
}

// ─── Toast ─────────────────────────────────────────────────────────────────

interface ToastProps {
  message: string
  type?: "success" | "error"
  onDone: () => void
}

export function Toast({ message, type = "success", onDone }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500)
    return () => clearTimeout(t)
  }, [onDone])

  const color = type === "error" ? C.error : C.success
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      background: C.card, border: `1px solid ${color}`, color,
      padding: "10px 18px", borderRadius: S.radius.lg,
      fontSize: 12, fontWeight: 600,
      boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
    }}>
      {message}
    </div>
  )
}

// ─── Alert ─────────────────────────────────────────────────────────────────

interface AlertProps {
  type: "error" | "warning" | "success" | "info"
  children: ReactNode
  onDismiss?: () => void
  style?: CSSProperties
}

const ALERT_STYLES: Record<string, { bg: string; border: string; color: string }> = {
  error:   { bg: "#fef2f2", border: "#fca5a5", color: C.error },
  warning: { bg: C.warning + "08", border: C.warning + "30", color: C.warning },
  success: { bg: "#f0fdf4", border: "#bbf7d0", color: C.success },
  info:    { bg: C.blue + "08", border: C.blue + "30", color: C.blue },
}

export function Alert({ type, children, onDismiss, style }: AlertProps) {
  const s = ALERT_STYLES[type]
  return (
    <div style={{
      background: s.bg, border: `1px solid ${s.border}`, borderRadius: S.radius.lg,
      padding: "12px 16px", marginBottom: 16, fontSize: 13, color: s.color,
      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      ...style,
    }}>
      <div>{children}</div>
      {onDismiss && (
        <button onClick={onDismiss} style={{ background: "none", border: "none", color: s.color, cursor: "pointer", fontWeight: 700, fontSize: 14, lineHeight: 1 }}>
          ×
        </button>
      )}
    </div>
  )
}

// ─── EmptyState ────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
}

export function EmptyState({ icon = "📋", title, description }: EmptyStateProps) {
  return (
    <div style={{ padding: "48px 20px", textAlign: "center" }}>
      <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>{icon}</div>
      <div style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>{title}</div>
      {description && <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>{description}</p>}
    </div>
  )
}

// ─── Buttons ───────────────────────────────────────────────────────────────

const BTN_BASE: CSSProperties = {
  fontSize: 12, fontWeight: 600, padding: "6px 16px", borderRadius: S.radius.md,
  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: S.gap.xs,
  transition: "opacity 0.15s",
}

type BtnVariant = "primary" | "gold" | "danger" | "ghost"

const BTN_VARIANTS: Record<BtnVariant, CSSProperties> = {
  primary: { ...BTN_BASE, background: C.text, color: "#fff", border: "none" },
  gold:    { ...BTN_BASE, background: C.gold, color: "#fff", border: "none" },
  danger:  { ...BTN_BASE, background: C.error + "12", color: C.error, border: `1px solid ${C.error}40` },
  ghost:   { ...BTN_BASE, background: "transparent", color: C.muted, border: `1px solid ${C.border}` },
}

interface BtnProps {
  label: string
  variant?: BtnVariant
  disabled?: boolean
  onClick?: () => void
  style?: CSSProperties
}

export function Btn({ label, variant = "primary", disabled, onClick, style }: BtnProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        ...BTN_VARIANTS[variant],
        ...(disabled ? { opacity: 0.4, cursor: "not-allowed" } : {}),
        ...style,
      }}
    >
      {label}
    </button>
  )
}

// ─── Config Row ────────────────────────────────────────────────────────────

interface ConfigRowProps {
  label: string
  hint?: string
  children: ReactNode
}

export function ConfigRow({ label, hint, children }: ConfigRowProps) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 0", borderBottom: `1px solid ${C.border}80`,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: S.gap.sm, flexShrink: 0 }}>
        {children}
      </div>
    </div>
  )
}

// ─── Input ─────────────────────────────────────────────────────────────────

export const inputStyle: CSSProperties = {
  width: "100%", maxWidth: 240, padding: "7px 11px", borderRadius: S.radius.md,
  border: `1px solid ${C.border}`, background: C.card, color: C.text,
  fontSize: 13, outline: "none",
}

export const selectStyle: CSSProperties = {
  ...inputStyle, cursor: "pointer", maxWidth: 200,
}

// ─── Modal ─────────────────────────────────────────────────────────────────

interface ModalProps {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  maxWidth?: number
}

export function Modal({ title, subtitle, children, footer, onClose, maxWidth = 540 }: ModalProps) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 10000 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
        width: "100%", maxWidth, maxHeight: "80vh", overflow: "auto",
        boxShadow: "0 24px 80px rgba(0,0,0,0.15)", zIndex: 10001,
      }}>
        <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: "18px 24px" }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{title}</div>
          {subtitle && <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{subtitle}</div>}
        </div>
        <div style={{ padding: "20px 24px" }}>
          {children}
        </div>
        {footer && (
          <div style={{ padding: "14px 24px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", gap: S.gap.sm }}>
            {footer}
          </div>
        )}
      </div>
    </>
  )
}
