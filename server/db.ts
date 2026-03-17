import * as schema from "@shared/schema";
import { Pool as PgPool } from 'pg';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Use Neon serverless for Neon databases, regular pg for local PostgreSQL
const isNeonDatabase = process.env.DATABASE_URL.includes('neon.tech');

let db: ReturnType<typeof drizzlePg>;

if (isNeonDatabase) {
  // Use Neon serverless driver for Neon databases
  const { Pool, neonConfig } = await import('@neondatabase/serverless');
  const { drizzle } = await import('drizzle-orm/neon-serverless');
  const ws = await import("ws");
  
  neonConfig.webSocketConstructor = ws.default;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle({ client: pool, schema });
} else {
  // Use regular PostgreSQL driver for local/other databases
  const pool = new PgPool({ connectionString: process.env.DATABASE_URL });
  db = drizzlePg({ client: pool, schema });
}

export { db };
