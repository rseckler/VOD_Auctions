import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260329200000 extends Migration {

  override async up(): Promise<void> {
    // Add reserve_price to block_item (hidden minimum — lot only awarded if bid meets or exceeds it)
    this.addSql(`alter table if exists "block_item" add column if not exists "reserve_price" numeric(10,2) null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "block_item" drop column if exists "reserve_price";`);
  }

}
