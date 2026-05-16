import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireCommunityEnabled } from "../../../../../lib/community"

const STATUSES = ["open", "reviewed", "actioned", "dismissed"]

// PATCH /admin/community/reports/:id — resolve a report.
// Body: { status }
export async function PATCH(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await requireCommunityEnabled(pg, res))) return

  const report = await pg("community_report")
    .where({ id: req.params.id })
    .first("id")
  if (!report) {
    res.status(404).json({ message: "Report not found" })
    return
  }

  const status = (req.body as Record<string, any>)?.status
  if (!STATUSES.includes(status)) {
    res.status(422).json({ message: "Invalid status" })
    return
  }

  const [row] = await pg("community_report")
    .where({ id: report.id })
    .update({
      status,
      reviewed_at: status === "open" ? null : new Date(),
    })
    .returning("*")
  res.json({ report: row })
}
