import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  throw new Error("Missing TURSO_DATABASE_URL for drizzle-kit");
}

if (!authToken) {
  throw new Error("Missing TURSO_AUTH_TOKEN for drizzle-kit");
}

export default defineConfig({
  dialect: "turso",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url,
    authToken,
  },
  verbose: true,
  strict: true,
});
