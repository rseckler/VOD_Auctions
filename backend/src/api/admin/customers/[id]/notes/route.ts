import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  generateEntityId,
} from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/customers/:id/notes
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    const notes = await pgConnection("customer_note")
      .where("customer_id", id)
      .whereNull("deleted_at")
      .orderBy("created_at", "desc")
      .select("*")

    res.json({ notes })
  } catch (err: any) {
    console.error(`[admin/customers/${id}/notes] GET Error:`, err.message)
    res.status(500).json({ message: "Failed to fetch notes" })
  }
}

// POST /admin/customers/:id/notes
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params
  const { body: noteBody } = req.body as { body: string }

  if (!noteBody || !noteBody.trim()) {
    res.status(400).json({ message: "Note body is required" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    const noteId = generateEntityId()
    const authorEmail =
      (req as any).auth_context?.actor_id || "admin"

    const [note] = await pgConnection("customer_note")
      .insert({
        id: noteId,
        customer_id: id,
        body: noteBody.trim(),
        author_email: authorEmail,
        created_at: pgConnection.fn.now(),
        updated_at: pgConnection.fn.now(),
      })
      .returning("*")

    res.status(201).json({ note })
  } catch (err: any) {
    console.error(`[admin/customers/${id}/notes] POST Error:`, err.message)
    res.status(500).json({ message: "Failed to create note" })
  }
}
