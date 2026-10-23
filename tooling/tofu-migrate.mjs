// Tofu: apply supabase/migrations during the build, once each.
//
// Tofu creates the app's database and hands the build DATABASE_URL and SUPABASE_CA_CERT, but it leaves the
// supabase/migrations folder to a build that applies it itself. This script applies the files in file-name order,
// records each version in the Supabase CLI's own ledger (supabase_migrations.schema_migrations) so a later Tofu step
// or a person with the database key never runs one twice, and exits without a database when there is none (local
// builds, previews without a database).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import tls from "node:tls";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("[tofu-migrate] DATABASE_URL is not set; nothing to apply.");
  process.exit(0);
}
const cert = process.env.SUPABASE_CA_CERT;
if (!cert) {
  console.error("[tofu-migrate] SUPABASE_CA_CERT is not set; refusing to connect without verifying the server.");
  process.exit(1);
}
const ca = cert.includes("BEGIN CERTIFICATE") ? cert : Buffer.from(cert, "base64").toString("utf8");

// node-postgres reads sslmode from the URL as full verification and lets it replace the ssl object, so the ssl
// parameters come out of the URL and the certificate goes in beside it.
const target = new URL(url);
for (const key of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"]) target.searchParams.delete(key);

const { default: pg } = await import("pg");
const pool = new pg.Pool({
  connectionString: target.toString(),
  ssl: { ca: [...tls.rootCertificates, ca], rejectUnauthorized: true },
});

const directory = join(process.cwd(), "supabase", "migrations");
let files = [];
try {
  files = readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
} catch {
  console.log("[tofu-migrate] no supabase/migrations folder; nothing to apply.");
  await pool.end();
  process.exit(0);
}

const client = await pool.connect();
try {
  await client.query("create schema if not exists supabase_migrations");
  await client.query(
    "create table if not exists supabase_migrations.schema_migrations (version text primary key, name text, statements text[], applied_at timestamptz not null default now())",
  );
  const done = new Set((await client.query("select version from supabase_migrations.schema_migrations")).rows.map((row) => row.version));
  let applied = 0;
  for (const file of files) {
    const version = file.split("_")[0];
    if (!version || done.has(version)) continue;
    const sql = readFileSync(join(directory, file), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)", [version, file]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw new Error(`${file}: ${error.message}`);
    }
    applied += 1;
    console.log(`[tofu-migrate] applied ${file}`);
  }
  console.log(`[tofu-migrate] ${applied} applied, ${files.length - applied} already recorded, ${files.length} files.`);
} finally {
  client.release();
  await pool.end();
}
