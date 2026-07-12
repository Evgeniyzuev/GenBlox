import { readFile } from "node:fs/promises";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const migration = await readFile(new URL("../supabase/migrations/202607120001_creator_private_versions.sql", import.meta.url), "utf8");
const sql = postgres(databaseUrl, { max: 1, ssl: "require", onnotice: () => {} });

try {
  await sql.begin((transaction) => transaction.unsafe(migration));
  console.log("Creator private-version schema is ready.");
} finally {
  await sql.end();
}
