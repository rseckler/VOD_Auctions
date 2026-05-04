import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

const ADMIN_FALLBACK = "admin@vod-auctions.com"
const ALLOWED_PRIORITY = new Set(["low", "normal", "high", "urgent"])
const ALLOWED_STATUS = new Set(["open", "done", "cancelled"])

// GET /admin/crm/contacts/:id/tasks — Tasks für einen Master
export async function GET(
  req: MedusaRequest<unknown, { id?: string }>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const masterId = (req.params as { id?: string })?.id
  const status = (req.query.status as string) || "all"

  if (!masterId) {
    res.status(400).json({ ok: false, error: "id required" })
    return
  }

  try {
    let q = pgConnection("crm_master_task")
      .where({ master_id: masterId })
      .whereNull("deleted_at")
    if (status !== "all" && ALLOWED_STATUS.has(status)) {
      q = q.where({ status })
    }
    const tasks = await q
      // open tasks first, sorted by priority + due_at
      .orderByRaw(`status = 'done' ASC, status = 'cancelled' ASC,
                   CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
                   due_at NULLS LAST, created_at DESC`)
    res.json({ tasks })
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}

// POST /admin/crm/contacts/:id/tasks — Task anlegen
type CreateBody = {
  title?: string
  description?: string
  due_at?: string | null
  priority?: string
  reminder_at?: string | null
  reminder_channel?: string | null
  assigned_to?: string | null
}

export async function POST(
  req: MedusaRequest<CreateBody, { id?: string }>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const masterId = (req.params as { id?: string })?.id
  const body = (req.body || {}) as CreateBody
  const admin = ADMIN_FALLBACK

  const title = (body.title || "").trim()
  if (!masterId || !title) {
    res.status(400).json({ ok: false, error: "title required" })
    return
  }

  const priority = body.priority && ALLOWED_PRIORITY.has(body.priority) ? body.priority : "normal"

  try {
    const result = await pgConnection.transaction(async (trx) => {
      const master = await trx("crm_master_contact")
        .where({ id: masterId, deleted_at: null })
        .first()
      if (!master) throw new Error("Contact not found")

      const [task] = await trx("crm_master_task")
        .insert({
          master_id: masterId,
          title,
          description: body.description?.trim() || null,
          due_at: body.due_at || null,
          priority,
          reminder_at: body.reminder_at || null,
          reminder_channel: body.reminder_channel || "email",
          assigned_to: body.assigned_to || admin,
          created_by: admin,
        })
        .returning("*")

      await trx("crm_master_audit_log").insert({
        master_id: masterId,
        action: "task_added",
        details: {
          task_id: task.id,
          title: task.title,
          due_at: task.due_at,
          assigned_to: task.assigned_to,
          priority: task.priority,
        },
        source: "admin_ui",
        admin_email: admin,
      })

      return task
    })

    res.json({ task: result })
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err)
    res.status(m === "Contact not found" ? 404 : 500).json({ ok: false, error: m })
  }
}
