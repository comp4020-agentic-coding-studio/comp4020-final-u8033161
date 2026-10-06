import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// A crit room: one per presenter session. `presenterToken` is paired with an
// httpOnly cookie (never put in the URL -- the stage is projected) so only
// the presenter's own browser can move the ladder or read who's in it.
export const rooms = sqliteTable(
  "rooms",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull().unique(),
    presenterToken: text("presenter_token").notNull(),
    currentStep: integer("current_step").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('subsec') * 1000)`),
  },
  (table) => [check("current_step_range", sql`${table.currentStep} BETWEEN 1 AND 4`)],
);

// One piece of feedback, submitted to one rung of the ladder. `step` is
// fixed at submission time even if the presenter later moves on.
export const cards = sqliteTable(
  "cards",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roomId: integer("room_id")
      .notNull()
      .references(() => rooms.id),
    step: integer("step").notNull(),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('subsec') * 1000)`),
  },
  (table) => [check("card_step_range", sql`${table.step} BETWEEN 1 AND 4`)],
);
