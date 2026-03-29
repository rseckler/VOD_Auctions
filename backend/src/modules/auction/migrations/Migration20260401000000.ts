import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260401000000 extends Migration {

  override async up(): Promise<void> {
    // 1. customer_note table
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "customer_note" (
        "id" text NOT NULL,
        "customer_id" text NOT NULL,
        "body" text NOT NULL,
        "author_email" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL,
        CONSTRAINT "customer_note_pkey" PRIMARY KEY ("id")
      );
    `);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_customer_note_customer_id" ON "customer_note" ("customer_id");`);

    // 2. customer_audit_log table
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "customer_audit_log" (
        "id" text NOT NULL,
        "customer_id" text NOT NULL,
        "action" text NOT NULL,
        "details" jsonb NULL,
        "admin_email" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "customer_audit_log_pkey" PRIMARY KEY ("id")
      );
    `);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_customer_audit_log_customer_id" ON "customer_audit_log" ("customer_id");`);

    // 3. Extend customer_stats
    this.addSql(`ALTER TABLE "customer_stats" ADD COLUMN IF NOT EXISTS "brevo_contact_id" text NULL;`);
    this.addSql(`ALTER TABLE "customer_stats" ADD COLUMN IF NOT EXISTS "brevo_synced_at" timestamptz NULL;`);
    this.addSql(`ALTER TABLE "customer_stats" ADD COLUMN IF NOT EXISTS "blocked_at" timestamptz NULL;`);
    this.addSql(`ALTER TABLE "customer_stats" ADD COLUMN IF NOT EXISTS "blocked_reason" text NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "customer_note" CASCADE;`);
    this.addSql(`DROP TABLE IF EXISTS "customer_audit_log" CASCADE;`);
    this.addSql(`ALTER TABLE "customer_stats" DROP COLUMN IF EXISTS "brevo_contact_id";`);
    this.addSql(`ALTER TABLE "customer_stats" DROP COLUMN IF EXISTS "brevo_synced_at";`);
    this.addSql(`ALTER TABLE "customer_stats" DROP COLUMN IF EXISTS "blocked_at";`);
    this.addSql(`ALTER TABLE "customer_stats" DROP COLUMN IF EXISTS "blocked_reason";`);
  }

}
