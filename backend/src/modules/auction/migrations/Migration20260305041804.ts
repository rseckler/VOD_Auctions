import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260305041804 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "transaction" ("id" text not null, "block_item_id" text not null, "user_id" text not null, "amount" real not null, "shipping_cost" real not null, "total_amount" real not null, "currency" text not null default 'eur', "stripe_session_id" text null, "stripe_payment_intent_id" text null, "status" text not null default 'pending', "shipping_status" text not null default 'pending', "paid_at" timestamptz null, "shipped_at" timestamptz null, "delivered_at" timestamptz null, "shipping_name" text null, "shipping_address_line1" text null, "shipping_address_line2" text null, "shipping_city" text null, "shipping_postal_code" text null, "shipping_country" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "transaction_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_transaction_block_item_id" ON "transaction" ("block_item_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_transaction_deleted_at" ON "transaction" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "transaction" add constraint "transaction_block_item_id_foreign" foreign key ("block_item_id") references "block_item" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "transaction" cascade;`);
  }

}
