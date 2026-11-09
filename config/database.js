'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const settings = require('./settings');

const migrationFolders = [
  path.join(settings.projectRoot, 'database', 'schema'),
  path.join(settings.projectRoot, 'database', 'migrations')
];

function ensureDatabaseDirectory() {
  fs.mkdirSync(path.dirname(settings.databasePath), { recursive: true });
}

function listMigrations() {
  return migrationFolders.flatMap((folder) => {
    if (!fs.existsSync(folder)) {
      return [];
    }

    return fs
      .readdirSync(folder)
      .filter((file) => file.endsWith('.sql'))
      .sort()
      .map((file) => ({
        name: `${path.basename(folder)}/${file}`,
        filePath: path.join(folder, file)
      }));
  });
}

function applyPendingMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const isApplied = db.prepare('SELECT 1 FROM schema_migrations WHERE filename = ?');
  const recordMigration = db.prepare(
    'INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)'
  );

  const applyMigration = db.transaction((migration) => {
    const sql = fs.readFileSync(migration.filePath, 'utf8');
    db.exec(sql);
    recordMigration.run(migration.name, new Date().toISOString());
  });

  for (const migration of listMigrations()) {
    if (isApplied.get(migration.name)) {
      continue;
    }

    applyMigration(migration);
    console.log(`[database] Migración aplicada: ${migration.name}`);
  }
}

ensureDatabaseDirectory();

const db = new Database(settings.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

applyPendingMigrations(db);

module.exports = db;
