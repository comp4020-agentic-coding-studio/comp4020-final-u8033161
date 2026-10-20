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

// A person submitting feedback, identified across requests by two separate
// values: `token` (paired with an httpOnly cookie, same scoping idea as
// `presenterToken` -- never logged, never shown) and `publicId` (safe to log
// and to show on screen, which `token` is not). The server always resolves
// identity from the cookie's token; `publicId` is what the rest of the app
// -- cards, logs -- actually refers to.
export const participants = sqliteTable("participants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  publicId: text("public_id").notNull().unique(),
  roomId: integer("room_id")
    .notNull()
    .references(() => rooms.id),
  token: text("token").notNull().unique(),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
});

// One piece of feedback, submitted to one rung of the ladder. `step` is
// fixed at submission time even if the presenter later moves on.
// `participantId` is the author's `publicId` -- set from the submitting
// request's own cookie-resolved identity, never from anything the request
// body claims (see `docs/access-control.md`). Nullable because cards
// submitted before participant identity existed have no author to point to;
// those render as "anonymous" rather than attributed to anyone.
export const cards = sqliteTable(
  "cards",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roomId: integer("room_id")
      .notNull()
      .references(() => rooms.id),
    step: integer("step").notNull(),
    body: text("body").notNull(),
    participantId: text("participant_id").references(() => participants.publicId),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch('subsec') * 1000)`),
  },
  (table) => [check("card_step_range", sql`${table.step} BETWEEN 1 AND 4`)],
);
