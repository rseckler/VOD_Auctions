// TypeScript JobTracker — TS-Pendant zum Python lib/job_tracker.py (rc53.11).
// Schreibt fortlaufend Status, Heartbeat und Result-Summary in die background_job-Tabelle,
// damit Long-Running-Jobs (Bulk-Invite, künftige Pipelines) im Admin-UI sichtbar sind.

import { Knex } from "knex"
import { generateEntityId } from "@medusajs/framework/utils"
import os from "os"

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled"

export interface CreateJobOpts {
  kind: string
  display_name: string
  total?: number
  payload?: Record<string, unknown>
  triggered_by?: string
}

export class JobTracker {
  readonly id: string
  private pg: Knex
  private hostname: string
  private cancelChecked = 0

  private constructor(pg: Knex, id: string) {
    this.pg = pg
    this.id = id
    this.hostname = os.hostname()
  }

  static async create(pg: Knex, opts: CreateJobOpts): Promise<JobTracker> {
    const id = generateEntityId()
    await pg("background_job").insert({
      id,
      kind: opts.kind,
      display_name: opts.display_name,
      status: "running",
      progress_done: 0,
      progress_total: opts.total ?? null,
      started_at: new Date(),
      last_heartbeat: new Date(),
      pid: process.pid,
      hostname: os.hostname(),
      payload: opts.payload ? JSON.stringify(opts.payload) : null,
      triggered_by: opts.triggered_by ?? null,
    })
    return new JobTracker(pg, id)
  }

  /**
   * Bump processed-counter + heartbeat in one call.
   * Call this every N items in a loop.
   */
  async tick(processedDelta = 1): Promise<void> {
    await this.pg("background_job")
      .where("id", this.id)
      .increment("progress_done", processedDelta)
      .update({ last_heartbeat: new Date(), updated_at: new Date() })
  }

  async setTotal(total: number): Promise<void> {
    await this.pg("background_job")
      .where("id", this.id)
      .update({ progress_total: total, updated_at: new Date() })
  }

  /**
   * Returns true if cancel_requested was set externally.
   * Caller should break the loop ASAP.
   */
  async isCancelled(): Promise<boolean> {
    // Throttle DB reads — only check every 5 calls
    this.cancelChecked++
    if (this.cancelChecked % 5 !== 0) return false
    const row = await this.pg("background_job")
      .where("id", this.id)
      .select("cancel_requested")
      .first()
    return !!row?.cancel_requested
  }

  async finish(
    status: JobStatus,
    summary: Record<string, unknown> = {}
  ): Promise<void> {
    await this.pg("background_job")
      .where("id", this.id)
      .update({
        status,
        finished_at: new Date(),
        last_heartbeat: new Date(),
        result_summary: JSON.stringify(summary),
        updated_at: new Date(),
      })
  }

  async appendLog(line: string, maxKb = 32): Promise<void> {
    // Append-with-truncate so the log stays bounded
    await this.pg.raw(
      `UPDATE background_job
         SET log_tail = RIGHT(COALESCE(log_tail, '') || ?, ?),
             updated_at = NOW()
       WHERE id = ?`,
      [`[${new Date().toISOString()}] ${line}\n`, maxKb * 1024, this.id]
    )
  }
}
