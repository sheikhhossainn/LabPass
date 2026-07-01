require('./env');

const { Pool } = require('pg');

function createPoolConfig() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || null;
  const sslMode = String(process.env.PGSSLMODE || process.env.PG_SSLMODE || '').toLowerCase();
  const shouldUseSsl = sslMode === 'require' || process.env.PGSSL === 'true' || /sslmode=require/i.test(connectionString || '');

  const config = connectionString
    ? { connectionString }
    : {
        host: process.env.PGHOST,
        port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
        database: process.env.PGDATABASE,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
      };

  if (shouldUseSsl) {
    config.ssl = { rejectUnauthorized: false };
  }

  return config;
}

const pool = new Pool(createPoolConfig());

async function query(sql, params = []) {
  return pool.query(sql, params);
}

async function run(sql, params = []) {
  return query(sql, params);
}

async function get(sql, params = []) {
  const result = await query(sql, params);
  return result.rows[0] || null;
}

async function all(sql, params = []) {
  const result = await query(sql, params);
  return result.rows;
}

async function initializeDatabase() {
  await query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id BIGSERIAL PRIMARY KEY,
      pc_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'expired', 'logged_out')),
      created_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);

  await query('CREATE INDEX IF NOT EXISTS idx_sessions_status_expires_at ON sessions(status, expires_at)');
  await query('CREATE INDEX IF NOT EXISTS idx_sessions_pc_id ON sessions(pc_id)');
}

module.exports = {
  all,
  get,
  initializeDatabase,
  run,
};