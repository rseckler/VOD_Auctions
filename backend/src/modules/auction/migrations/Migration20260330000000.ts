import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260330000000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "auction_block" add column if not exists "newsletter_teaser_sent_at" timestamptz null;`);
    this.addSql(`alter table if exists "auction_block" add column if not exists "newsletter_tomorrow_sent_at" timestamptz null;`);
    this.addSql(`alter table if exists "auction_block" add column if not exists "newsletter_live_sent_at" timestamptz null;`);
    this.addSql(`alter table if exists "auction_block" add column if not exists "newsletter_ending_sent_at" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "auction_block" drop column if exists "newsletter_teaser_sent_at";`);
    this.addSql(`alter table if exists "auction_block" drop column if exists "newsletter_tomorrow_sent_at";`);
    this.addSql(`alter table if exists "auction_block" drop column if exists "newsletter_live_sent_at";`);
    this.addSql(`alter table if exists "auction_block" drop column if exists "newsletter_ending_sent_at";`);
  }

}
