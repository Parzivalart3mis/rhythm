import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Next puts local secrets in .env.local; load it first, then fall back to .env.
config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
