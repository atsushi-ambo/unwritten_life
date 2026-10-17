import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const aiBudget = sqliteTable("ai_budget", {
  id: text("id").primaryKey(),
  calls: integer("calls").notNull().default(0),
  reservedMicro: integer("reserved_micro").notNull().default(0),
  lockUntil: integer("lock_until").notNull().default(0),
  lockRequest: text("lock_request").notNull().default(""),
});
export const aiAttempts = sqliteTable("ai_attempts", {
  requestId: text("request_id").primaryKey(),
  status: text("status").notNull(),
  startedAt: integer("started_at").notNull(),
});
