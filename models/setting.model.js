'use strict';

const db = require('../config/database');

function get(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function set(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (@key, @value, @updatedAt)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run({
    key,
    value: value === undefined || value === null ? null : String(value),
    updatedAt: new Date().toISOString()
  });
}

function getAll() {
  return db
    .prepare('SELECT key, value FROM settings')
    .all()
    .reduce((result, row) => {
      result[row.key] = row.value;
      return result;
    }, {});
}

module.exports = {
  get,
  set,
  getAll
};
