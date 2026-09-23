import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Relative (not "@/...") so plain-Node scripts run through tsx can import this
// module without needing tsconfig path-alias resolution.
import { PrismaClient } from "./generated/prisma/client";

/**
 * Prisma 7 requires an explicit driver adapter; the connection URL is no longer
 * read from schema.prisma. We use the node-postgres adapter against the real
 * PostgreSQL cluster managed by scripts/db.mjs.
 */

/**
 * Pool size is bounded deliberately: the embedded cluster runs with
 * `max_connections=30`, and Next's dev server can otherwise open a pool per
 * worker and exhaust it.
 */
const POOL_MAX = Number(process.env.PG_POOL_MAX ?? 10);

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and run `npm run db:start`.",
    );
  }

  const pool = new Pool({
    connectionString,
    max: POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  // An idle client erroring (e.g. the database restarting) must not take the
  // process down with an unhandled 'error' event.
  pool.on("error", (error) => {
    console.error("[db] idle client error:", error.message);
  });

  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

// Next.js dev mode hot-reloads modules; without a global cache every reload
// would open a new pool and exhaust PostgreSQL's connection limit.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
