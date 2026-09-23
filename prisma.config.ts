import { loadEnvFile } from "node:process";
import { defineConfig, env } from "prisma/config";

// Prisma 7 no longer loads `.env` automatically, so do it explicitly.
// Absent file is fine — CI/production inject real environment variables.
try {
  loadEnvFile(".env");
} catch {
  // no .env present
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
