import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260305144812 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "cart_item" ("id" text not null, "user_id" text not null, "release_id" text not null, "price" real not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "cart_item_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cart_item_deleted_at" ON "cart_item" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cart_item_user_release" ON "cart_item" ("user_id", "release_id") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "transaction" drop constraint if exists "transaction_block_item_id_foreign";`);

    this.addSql(`drop index if exists "IDX_transaction_block_item_id";`);

    this.addSql(`alter table if exists "transaction" add column if not exists "release_id" text null, add column if not exists "item_type" text not null default 'auction', add column if not exists "order_group_id" text null;`);
    this.addSql(`alter table if exists "transaction" alter column "block_item_id" type text using ("block_item_id"::text);`);
    this.addSql(`alter table if exists "transaction" alter column "block_item_id" drop not null;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_transaction_order_group_id" ON "transaction" ("order_group_id") WHERE order_group_id IS NOT NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "cart_item" cascade;`);

    this.addSql(`alter table if exists "transaction" drop column if exists "release_id", drop column if exists "item_type", drop column if exists "order_group_id";`);

    this.addSql(`alter table if exists "transaction" alter column "block_item_id" type text using ("block_item_id"::text);`);
    this.addSql(`alter table if exists "transaction" alter column "block_item_id" set not null;`);
    this.addSql(`alter table if exists "transaction" add constraint "transaction_block_item_id_foreign" foreign key ("block_item_id") references "block_item" ("id") on update cascade;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_transaction_block_item_id" ON "transaction" ("block_item_id") WHERE deleted_at IS NULL;`);
  }

}
