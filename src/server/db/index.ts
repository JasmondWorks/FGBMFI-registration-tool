import "server-only";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "./schema";

// Raw Postgres (TCP:5432) is blocked on some networks (firewalls/DPI that only
// allow recognised traffic on 443). Neon's driver tunnels the same protocol over
// a WebSocket on 443 instead, which works everywhere HTTPS does.
neonConfig.webSocketConstructor = ws;

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  return new Pool({ connectionString: url, max: 12 });
}

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { __deskPool?: Pool };
const pool = globalForDb.__deskPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.__deskPool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
