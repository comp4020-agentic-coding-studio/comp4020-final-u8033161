// Docker's CMD. Applies any pending Drizzle migrations against the SQLite
// file on the Fly volume (see fly.toml: /data is the only thing that
// survives a redeploy), then starts the built @astrojs/node standalone
// server. Runs ahead of every request, not just on first boot, so a stale
// deploy never serves against an out-of-date schema.
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const dbPath = process.env.DB_PATH ?? "/data/app.db";
const sqlite = new Database(dbPath);
const db = drizzle(sqlite);

migrate(db, { migrationsFolder: "./drizzle" });
sqlite.close();

console.log(`migrations applied against ${dbPath}`);

await import("../dist/server/entry.mjs");
