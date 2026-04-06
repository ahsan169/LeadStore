import * as schema from "@shared/schema";
import { Pool as PgPool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const url = process.env.DATABASE_URL;
const isNeonDatabase = url.includes("neon.tech");

export const db = isNeonDatabase
  ? drizzleNeon(neon(url), { schema })
  : drizzlePg({ client: new PgPool({ connectionString: url }), schema });
