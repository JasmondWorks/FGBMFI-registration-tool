import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  return new Pool({
    connectionString: url,
    max: 5,
    // Neon pooled URLs ask for channel binding; node-postgres supports it with this flag.
    enableChannelBinding: url.includes("channel_binding=require"),
  });
}

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { __deskPool?: Pool };
const pool = globalForDb.__deskPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.__deskPool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
