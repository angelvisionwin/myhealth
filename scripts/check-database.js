'use strict';

const db = require('../config/database');

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
  .all()
  .map((row) => row.name);

console.log(`Tablas: ${tables.join(', ')}`);
console.log(`foreign_keys: ${db.pragma('foreign_keys', { simple: true })}`);
console.log(`journal_mode: ${db.pragma('journal_mode', { simple: true })}`);
console.log(`Ruta: ${require('../config/settings').databasePath}`);

db.close();
