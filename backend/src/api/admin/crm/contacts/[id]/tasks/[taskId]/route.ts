import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

const ADMIN_FALLBACK = "admin@vod-auctions.com"
const ALLOWED_PRIORITY = new Set(["low", "normal", "high", "urgent"])
const ALLOWED_STATUS = new Set(["open", "done", "cancelled"])

type Params = { id?: string; taskId?: string }

type PatchBody = {
  title?: string
  description?: string | null
  due_at?: string | null
  priority?: string
  reminder_at?: string | null
  reminder_channel?: string | null
  assigned_to?: string | null
  status?: string
}

// PATCH /admin/crm/contacts/:id/tasks/:taskId — Task editieren / Status ändern
export async function PATCH(
  req: MedusaRequest<PatchBody, Params>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const params = req.params as Params
  const masterId = params?.id
  const taskId = params?.taskId
  const payload = (req.body || {}) as PatchBody
  const admin = ADMIN_FALLBACK

  if (!masterId || !taskId) {
    res.status(400).json({ ok: false, error: "id and taskId required" })
    return
  }

  try {
    const result = await pgConnection.transaction(async (trx) => {
      const before = await trx("crm_master_task")
        .where({ id: taskId, master_id: masterId })
        .whereNull("deleted_at")
        .first()
      if (!before) throw new Error("Task not found")

      const updates: Record<string, unknown> = {}
      const fieldsChanged: string[] = []

      if (typeof payload.title === "string") {
        const v = payload.title.trim()
        if (v && v !== before.title) {
          updates.title = v
          fieldsChanged.push("title")
        }
      }
      if (payload.description !== undefined) {
        const v = payload.description === null ? null : (payload.description || "").trim() || null
        if (v !== before.description) {
          updates.description = v
          fieldsChanged.push("description")
        }
      }
      if (payload.due_at !== undefined) {
        const v = payload.due_at || null
        if (String(before.due_at || "") !== String(v || "")) {
          updates.due_at = v
          fieldsChanged.push("due_at")
        }
      }
      if (payload.priority && ALLOWED_PRIORITY.has(payload.priority) && payload.priority !== before.priority) {
        updates.priority = payload.priority
        fieldsChanged.push("priority")
      }
      if (payload.reminder_at !== undefined) {
        const v = payload.reminder_at || null
        if (String(before.reminder_at || "") !== String(v || "")) {
          updates.reminder_at = v
          updates.reminder_sent_at = null  // reset wenn neu gesetzt
          fieldsChanged.push("reminder_at")
        }
      }
      if (payload.reminder_channel !== undefined) {
        const v = payload.reminder_channel || null
        if (v !== before.reminder_channel) {
          updates.reminder_channel = v
          fieldsChanged.push("reminder_channel")
        }
      }
      if (payload.assigned_to !== undefined) {
        const v = payload.assigned_to || null
        if (v !== before.assigned_to) {
          updates.assigned_to = v
          fieldsChanged.push("assigned_to")
        }
      }
      if (payload.status && ALLOWED_STATUS.has(payload.status) && payload.status !== before.status) {
        updates.status = payload.status
        fieldsChanged.push("status")
        if (payload.status === "done") {
          updates.completed_at = trx.fn.now()
          updates.completed_by = admin
        } else if (before.status === "done") {
          updates.completed_at = null
          updates.completed_by = null
        }
      }

      if (Object.keys(updates).length === 0) return before

      const [after] = await trx("crm_master_task")
        .where({ id: taskId })
        .update(updates)
        .returning("*")

      // Audit-Log
      const audits: Array<Record<string, unknown>> = []
      if (fieldsChanged.includes("status")) {
        audits.push({
          master_id: masterId,
          action: updates.status === "done" ? "task_completed" : updates.status === "cancelled" ? "task_cancelled" : "task_reopened",
          details: { task_id: taskId, title: before.title },
          source: "admin_ui",
          admin_email: admin,
        })
      } else if (fieldsChanged.length > 0) {
        audits.push({
          master_id: masterId,
          action: "task_updated",
          details: { task_id: taskId, fields_changed: fieldsChanged },
          source: "admin_ui",
          admin_email: admin,
        })
      }
      if (audits.length > 0) await trx("crm_master_audit_log").insert(audits)

      return after
    })

    res.json({ task: result })
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err)
    res.status(m === "Task not found" ? 404 : 500).json({ ok: false, error: m })
  }
}

// DELETE /admin/crm/contacts/:id/tasks/:taskId — soft-delete
export async function DELETE(
  req: MedusaRequest<unknown, Params>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const params = req.params as Params
  const masterId = params?.id
  const taskId = params?.taskId
  const admin = ADMIN_FALLBACK

  if (!masterId || !taskId) {
    res.status(400).json({ ok: false, error: "id and taskId required" })
    return
  }

  try {
    const updated = await pgConnection("crm_master_task")
      .where({ id: taskId, master_id: masterId })
      .whereNull("deleted_at")
      .update({ deleted_at: pgConnection.fn.now() })

    if (updated === 0) {
      res.status(404).json({ ok: false, error: "Task not found" })
      return
    }

    await pgConnection("crm_master_audit_log").insert({
      master_id: masterId,
      action: "task_deleted",
      details: { task_id: taskId },
      source: "admin_ui",
      admin_email: admin,
    })

    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
