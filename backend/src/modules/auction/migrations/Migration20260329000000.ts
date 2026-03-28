import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260329000000 extends Migration {

  override async up(): Promise<void> {
    // Add payment reminder tracking timestamps to transaction
    this.addSql(`alter table if exists "transaction" add column if not exists "payment_reminder_1_sent_at" timestamptz null;`);
    this.addSql(`alter table if exists "transaction" add column if not exists "payment_reminder_3_sent_at" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "transaction" drop column if exists "payment_reminder_1_sent_at";`);
    this.addSql(`alter table if exists "transaction" drop column if exists "payment_reminder_3_sent_at";`);
  }

}
