import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260302091241 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "bid" ("id" text not null, "block_item_id" text not null, "user_id" text not null, "amount" real not null, "max_amount" real null, "is_winning" boolean not null default false, "is_outbid" boolean not null default false, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "bid_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_bid_block_item_id" ON "bid" ("block_item_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_bid_deleted_at" ON "bid" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "bid" add constraint "bid_block_item_id_foreign" foreign key ("block_item_id") references "block_item" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "bid" cascade;`);
  }

}
