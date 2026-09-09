const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.warn(
    "\n⚠️  DATABASE_URL is not set. Copy server/.env.example to server/.env and add your Postgres connection string.\n"
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Most hosted Postgres providers (Neon, Supabase, Render) require SSL.
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});

module.exports = { pool };
