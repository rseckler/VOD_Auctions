import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260331000000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "customer_stats" (
        "id" text NOT NULL,
        "customer_id" text UNIQUE NOT NULL,
        "total_spent" decimal(10,2) NOT NULL DEFAULT 0,
        "total_purchases" integer NOT NULL DEFAULT 0,
        "total_bids" integer NOT NULL DEFAULT 0,
        "total_wins" integer NOT NULL DEFAULT 0,
        "last_purchase_at" timestamptz NULL,
        "last_bid_at" timestamptz NULL,
        "first_purchase_at" timestamptz NULL,
        "tags" text[] NOT NULL DEFAULT '{}',
        "is_vip" boolean NOT NULL DEFAULT false,
        "is_dormant" boolean NOT NULL DEFAULT false,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "customer_stats_pkey" PRIMARY KEY ("id")
      );
    `);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_customer_stats_customer_id" ON "customer_stats" ("customer_id");`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_customer_stats_total_spent" ON "customer_stats" ("total_spent" DESC);`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_customer_stats_is_vip" ON "customer_stats" ("is_vip");`);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "customer_stats" CASCADE;`);
  }

}
