import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260329100000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "saved_item" add column if not exists "watchlist_reminded_at" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "saved_item" drop column if exists "watchlist_reminded_at";`);
  }

}
