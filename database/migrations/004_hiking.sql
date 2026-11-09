-- MyHealth · salidas de senderismo y montaña

CREATE TABLE IF NOT EXISTS hiking_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_date TEXT NOT NULL,
  duration_minutes INTEGER,
  elevation_gain_m INTEGER,
  distance_km REAL,
  effort_score INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hiking_sessions_date ON hiking_sessions(session_date);
