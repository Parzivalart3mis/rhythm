import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // Fail loudly at first query rather than at import time, so the app can still
  // boot in environments where the DB isn't configured (e.g. static checks).
  console.warn("DATABASE_URL is not set — database queries will fail.");
}

const sql = neon(connectionString ?? "postgres://invalid");
export const db = drizzle(sql, { schema });

export { schema };
