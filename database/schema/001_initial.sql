-- MyHealth · esquema inicial
-- Fechas y horas se guardan como texto ISO-8601. Las fechas de medida, como YYYY-MM-DD.

CREATE TABLE IF NOT EXISTS workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hevy_id TEXT NOT NULL UNIQUE,
  title TEXT,
  description TEXT,
  start_time TEXT,
  end_time TEXT,
  duration_seconds INTEGER,
  created_at TEXT,
  updated_at TEXT,
  raw_json TEXT
);

CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hevy_exercise_id TEXT UNIQUE,
  name TEXT NOT NULL,
  muscle_group TEXT,
  equipment TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS workout_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  set_index INTEGER,
  set_type TEXT,
  weight_kg REAL,
  repetitions INTEGER,
  distance_meters REAL,
  duration_seconds INTEGER,
  rpe REAL,
  raw_json TEXT
);

CREATE TABLE IF NOT EXISTS measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  measurement_date TEXT NOT NULL,
  parameter TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS sync_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  items_read INTEGER DEFAULT 0,
  items_created INTEGER DEFAULT 0,
  items_updated INTEGER DEFAULT 0,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_workouts_start_time ON workouts(start_time);
CREATE INDEX IF NOT EXISTS idx_workout_sets_workout_id ON workout_sets(workout_id);
CREATE INDEX IF NOT EXISTS idx_measurements_date ON measurements(measurement_date);
CREATE INDEX IF NOT EXISTS idx_measurements_parameter ON measurements(parameter);
CREATE INDEX IF NOT EXISTS idx_sync_history_started_at ON sync_history(started_at);
