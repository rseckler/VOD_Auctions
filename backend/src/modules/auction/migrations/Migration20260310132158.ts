import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260310132158 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "saved_item" ("id" text not null, "user_id" text not null, "release_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "saved_item_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_saved_item_deleted_at" ON "saved_item" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "transaction" add column if not exists "tracking_number" text null, add column if not exists "carrier" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "saved_item" cascade;`);

    this.addSql(`alter table if exists "transaction" drop column if exists "tracking_number", drop column if exists "carrier";`);
  }

}
