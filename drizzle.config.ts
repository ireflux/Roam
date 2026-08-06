import { loadEnvFile } from "node:process";
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  try {
    loadEnvFile(".env.local");
  } catch {}
}

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
