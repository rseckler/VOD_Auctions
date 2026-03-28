import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260330100000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "block_item" add column if not exists "view_count" integer not null default 0;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "block_item" drop column if exists "view_count";`);
  }

}
