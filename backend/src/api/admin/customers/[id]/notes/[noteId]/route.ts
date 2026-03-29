import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// DELETE /admin/customers/:id/notes/:noteId
export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id, noteId } = req.params

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    const updated = await pgConnection("customer_note")
      .where("id", noteId)
      .where("customer_id", id)
      .whereNull("deleted_at")
      .update({ deleted_at: pgConnection.fn.now() })

    if (!updated) {
      res.status(404).json({ message: "Note not found" })
      return
    }

    res.json({ success: true })
  } catch (err: any) {
    console.error(`[admin/customers/${id}/notes/${noteId}] DELETE Error:`, err.message)
    res.status(500).json({ message: "Failed to delete note" })
  }
}
