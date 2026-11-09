-- MyHealth · rutinas de Hevy (sincronización de solo lectura)

CREATE TABLE IF NOT EXISTS hevy_routines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hevy_id TEXT NOT NULL UNIQUE,
  title TEXT,
  folder_id INTEGER,
  exercise_count INTEGER NOT NULL DEFAULT 0,
  set_count INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hevy_routines_title ON hevy_routines(title);
