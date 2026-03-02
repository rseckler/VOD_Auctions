import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260302072013 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "auction_block" ("id" text not null, "title" text not null, "subtitle" text null, "slug" text not null, "start_time" timestamptz not null, "end_time" timestamptz not null, "preview_from" timestamptz null, "status" text not null default 'draft', "block_type" text not null default 'theme', "short_description" text null, "long_description" text null, "header_image" text null, "video_url" text null, "audio_url" text null, "staggered_ending" boolean not null default false, "stagger_interval_seconds" integer not null default 120, "default_start_price_percent" integer not null default 50, "auto_extend" boolean not null default true, "extension_minutes" integer not null default 5, "total_revenue" real null, "total_items" integer null, "sold_items" integer null, "total_bids" integer null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "auction_block_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_auction_block_deleted_at" ON "auction_block" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "block_item" ("id" text not null, "auction_block_id" text not null, "release_id" text not null, "estimated_value" real null, "start_price" real not null, "reserve_price" real null, "buy_now_price" real null, "current_price" real null, "bid_count" integer not null default 0, "lot_number" integer null, "lot_end_time" timestamptz null, "status" text not null default 'reserved', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "block_item_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_block_item_auction_block_id" ON "block_item" ("auction_block_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_block_item_deleted_at" ON "block_item" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "block_item" add constraint "block_item_auction_block_id_foreign" foreign key ("auction_block_id") references "auction_block" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "block_item" drop constraint if exists "block_item_auction_block_id_foreign";`);

    this.addSql(`drop table if exists "auction_block" cascade;`);

    this.addSql(`drop table if exists "block_item" cascade;`);
  }

}
