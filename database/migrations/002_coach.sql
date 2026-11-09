-- MyHealth · Entrenador personal (perfil, check-ins e informes)

CREATE TABLE IF NOT EXISTS athlete_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  birth_year INTEGER,
  height_cm REAL,
  sex TEXT,
  experience TEXT,
  primary_goal TEXT NOT NULL DEFAULT 'sarcopenia_fat_loss',
  target_weight_kg REAL,
  target_waist_cm REAL,
  target_body_fat_pct REAL,
  target_sessions_per_week INTEGER,
  session_minutes INTEGER,
  equipment TEXT,
  limitations TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO athlete_profile
  (id, birth_year, primary_goal, target_sessions_per_week, created_at, updated_at)
VALUES
  (1, 1972, 'sarcopenia_fat_loss', 3,
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checkin_date TEXT NOT NULL UNIQUE,
  weight_kg REAL,
  sleep_score INTEGER,
  energy_score INTEGER,
  stress_score INTEGER,
  soreness_score INTEGER,
  pain_notes TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_checkins_date ON checkins(checkin_date);

CREATE TABLE IF NOT EXISTS coach_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  period_days INTEGER NOT NULL,
  rules_version TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  report_text TEXT NOT NULL,
  ai_text TEXT,
  ai_model TEXT,
  generated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_coach_reports_generated_at ON coach_reports(generated_at);

-- Grupos musculares secundarios de la plantilla de Hevy (array JSON).
ALTER TABLE exercises ADD COLUMN secondary_muscle_groups TEXT;
