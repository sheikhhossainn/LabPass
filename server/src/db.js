/**
 * LabPass Server — Database Module (Turso / LibSQL)
 *
 * Supports both remote Turso databases and local SQLite files.
 * Uses @libsql/client for all queries.
 */

require('./env');

const { createClient } = require('@libsql/client');

function buildClientConfig() {
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || 'file:labpass.db';
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

  return authToken ? { url, authToken } : { url };
}

const client = createClient(buildClientConfig());

/**
 * Execute a SQL statement. Converts $1, $2, ... placeholders to ? for libsql.
 * Returns { rows, rowsAffected, lastInsertRowid }.
 */
async function execute(sql, params = []) {
  // Convert PostgreSQL-style $1, $2 placeholders to positional ?
  const convertedSql = sql.replace(/\$(\d+)/g, '?');

  const result = await client.execute({
    sql: convertedSql,
    args: params,
  });

  return result;
}

/**
 * Run a write query (INSERT, UPDATE, DELETE).
 * Returns { rows, lastInsertRowid, rowsAffected }.
 */
async function run(sql, params = []) {
  const result = await execute(sql, params);
  return {
    rows: result.rows || [],
    lastInsertRowid: result.lastInsertRowid,
    rowsAffected: result.rowsAffected,
  };
}

/**
 * Get the first row matching the query, or null.
 */
async function get(sql, params = []) {
  const result = await execute(sql, params);
  return result.rows[0] || null;
}

/**
 * Get all rows matching the query.
 */
async function all(sql, params = []) {
  const result = await execute(sql, params);
  return result.rows;
}

/**
 * Initialize the database schema.
 * Creates users and sessions tables if they don't exist.
 */
async function initializeDatabase() {
  // Users table
  await execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT,
      picture_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Sessions table with user association
  await execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pc_id TEXT NOT NULL,
      user_id INTEGER,
      account_email TEXT,
      status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'expired', 'logged_out')),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Indexes
  await execute('CREATE INDEX IF NOT EXISTS idx_sessions_status_expires ON sessions(status, expires_at)');
  await execute('CREATE INDEX IF NOT EXISTS idx_sessions_pc_id ON sessions(pc_id)');
  await execute('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)');
  await execute('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
}

module.exports = {
  all,
  execute,
  get,
  initializeDatabase,
  run,
};