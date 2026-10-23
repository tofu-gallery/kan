import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PoolConfig } from "pg";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

// Still used by the PGlite databases in packages/api/integration-tests.
export const pgliteExtensions = { pg_trgm, uuid_ossp };

export type dbClient = NodePgDatabase<typeof schema> & {
  $client: Pool;
};

/**
 * Tofu changed this: node-postgres lets a URL's `sslmode` override its own
 * `ssl` option and treats `require` as full certificate verification, which
 * fails against a managed database's pooler (SELF_SIGNED_CERT_IN_CHAIN).
 * When the URL names an `sslmode`, it is taken out and TLS is set here:
 * verified against SUPABASE_CA_CERT (PEM text or base64) when that is set,
 * encrypted without verification otherwise, and off for `disable`. Host,
 * port, user, password and database stay in the URL, which pg parses itself;
 * a URL without `sslmode` reaches pg unchanged, as it did upstream.
 */
const toPoolConfig = (databaseUrl: string): PoolConfig => {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    // A shape the URL parser refuses (a Unix socket with an empty host) is left to pg's own parser.
    return { connectionString: databaseUrl };
  }

  const sslmode = url.searchParams.get("sslmode");
  if (!sslmode) return { connectionString: databaseUrl };
  url.searchParams.delete("sslmode");

  const caSetting = process.env.SUPABASE_CA_CERT;
  const ca = caSetting
    ? caSetting.includes("-----BEGIN")
      ? caSetting
      : Buffer.from(caSetting, "base64").toString("utf8")
    : undefined;

  let ssl: PoolConfig["ssl"];
  if (sslmode === "disable") {
    ssl = false;
  } else if (sslmode === "verify-ca" || sslmode === "verify-full") {
    ssl = ca ? { ca } : true;
  } else {
    ssl = ca ? { ca } : { rejectUnauthorized: false };
  }

  return { connectionString: url.toString(), ssl };
};

/**
 * Tofu changed this: the connection comes from DATABASE_URL (Tofu's managed
 * database), then upstream's POSTGRES_URL. With neither set it throws instead
 * of falling back to a PGlite database in ./pgdata, which on a serverless
 * host lives on temporary disk and silently loses every write.
 */
export const createDrizzleClient = (): dbClient => {
  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!databaseUrl) {
    throw new Error(
      "No database configured: set DATABASE_URL (or POSTGRES_URL) to a PostgreSQL connection string.",
    );
  }

  const pool = new Pool(toPoolConfig(databaseUrl));

  return drizzlePg(pool, { schema }) as dbClient;
};
