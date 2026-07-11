import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // Warn but don't crash at import time, so the app can still be built and boot
  // in environments where the DB isn't configured yet (e.g. build page-data
  // collection). Queries will fail at runtime until DATABASE_URL is set.
  console.warn("DATABASE_URL is not set — database queries will fail.");
}

// neon() throws on an empty/invalid string at construction, so fall back to a
// syntactically valid placeholder when unset.
const sql = neon(
  connectionString || "postgresql://placeholder:placeholder@localhost:5432/placeholder"
);
export const db = drizzle(sql, { schema });

export { schema };
