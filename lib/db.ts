import { PrismaPg } from "@prisma/adapter-pg";

// Relative (not "@/...") so plain-Node scripts run through tsx can import this
// module without needing tsconfig path-alias resolution.
import { PrismaClient } from "./generated/prisma/client";

/**
 * Prisma 7 requires an explicit driver adapter; the connection URL is no longer
 * read from schema.prisma. We use the node-postgres adapter, which talks to the
 * real PostgreSQL cluster managed by scripts/db.mjs.
 */
function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and run `npm run db:start`.",
    );
  }

  return new PrismaClient({ adapter: new PrismaPg(connectionString) });
}

// Next.js dev mode hot-reloads modules; without a global cache every reload
// would open a new connection pool and exhaust PostgreSQL's connection limit.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
