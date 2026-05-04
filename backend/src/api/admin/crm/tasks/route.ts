import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/crm/tasks — Cross-Customer "My Tasks"-View
//   ?assigned_to=me|<email>|all (default: all)
//   ?status=open|done|cancelled|all (default: open)
//   ?bucket=overdue|today|week|month (optional)
//   ?limit=100 (default 100, max 500)
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const assignedToParam = (req.query.assigned_to as string) || "all"
  const status = (req.query.status as string) || "open"
  const bucket = (req.query.bucket as string) || ""
  const limit = Math.min(Number(req.query.limit) || 100, 500)

  try {
    let q = pgConnection("crm_master_task as t")
      .leftJoin("crm_master_contact as mc", "mc.id", "t.master_id")
      .whereNull("t.deleted_at")
      .whereNull("mc.deleted_at")
      .select(
        "t.id", "t.master_id", "t.title", "t.description", "t.due_at",
        "t.status", "t.priority", "t.reminder_at", "t.reminder_sent_at",
        "t.reminder_channel", "t.assigned_to", "t.completed_at",
        "t.completed_by", "t.created_by", "t.created_at",
        "mc.display_name as master_display_name",
        "mc.tier as master_tier",
        "mc.lifecycle_stage as master_lifecycle"
      )

    if (status !== "all") {
      q = q.where("t.status", status)
    }
    if (assignedToParam && assignedToParam !== "all") {
      q = q.where("t.assigned_to", assignedToParam)
    }
    if (bucket === "overdue") {
      q = q.where("t.due_at", "<", pgConnection.fn.now()).where("t.status", "open")
    } else if (bucket === "today") {
      q = q.whereRaw("t.due_at::date = CURRENT_DATE")
    } else if (bucket === "week") {
      q = q.whereRaw("t.due_at >= CURRENT_DATE AND t.due_at < CURRENT_DATE + INTERVAL '7 days'")
    } else if (bucket === "month") {
      q = q.whereRaw("t.due_at >= CURRENT_DATE AND t.due_at < CURRENT_DATE + INTERVAL '30 days'")
    }

    const tasks = await q
      .orderByRaw(`
        CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        t.due_at NULLS LAST,
        t.created_at DESC
      `)
      .limit(limit)

    // Counters für die UI-Buckets
    const [overdueCount, todayCount, weekCount] = await Promise.all([
      pgConnection("crm_master_task")
        .whereNull("deleted_at").where("status", "open")
        .where("due_at", "<", pgConnection.fn.now())
        .count("* as n").first(),
      pgConnection("crm_master_task")
        .whereNull("deleted_at").where("status", "open")
        .whereRaw("due_at::date = CURRENT_DATE")
        .count("* as n").first(),
      pgConnection("crm_master_task")
        .whereNull("deleted_at").where("status", "open")
        .whereRaw("due_at >= CURRENT_DATE AND due_at < CURRENT_DATE + INTERVAL '7 days'")
        .count("* as n").first(),
    ])

    res.json({
      tasks,
      counters: {
        overdue: Number(overdueCount?.n || 0),
        today: Number(todayCount?.n || 0),
        week: Number(weekCount?.n || 0),
      },
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
