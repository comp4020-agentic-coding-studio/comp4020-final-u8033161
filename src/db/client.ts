import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema.ts";

// /data is the Fly volume (see fly.toml) -- the only thing that survives a
// redeploy. Local dev and CI's throwaway container both override this.
const dbPath = process.env.DB_PATH ?? "/data/app.db";

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });
