import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260328100000 extends Migration {

  override async up(): Promise<void> {
    // Add max_extensions to auction_block
    this.addSql(`alter table if exists "auction_block" add column if not exists "max_extensions" integer not null default 10;`);

    // Add extension_count to block_item
    this.addSql(`alter table if exists "block_item" add column if not exists "extension_count" integer not null default 0;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "auction_block" drop column if exists "max_extensions";`);
    this.addSql(`alter table if exists "block_item" drop column if exists "extension_count";`);
  }

}
