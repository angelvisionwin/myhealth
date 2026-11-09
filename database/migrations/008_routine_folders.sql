-- MyHealth · carpetas de rutinas de Hevy y carpeta preferida para el plan semanal

CREATE TABLE IF NOT EXISTS hevy_routine_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hevy_id INTEGER NOT NULL UNIQUE,
  title TEXT NOT NULL,
  folder_index INTEGER,
  synced_at TEXT NOT NULL
);

ALTER TABLE athlete_profile ADD COLUMN routine_folder_id INTEGER;
