-- MyHealth · nutrición, plan semanal y molestias estructuradas

-- Preferencias del plan de alimentación y de la semana.
ALTER TABLE athlete_profile ADD COLUMN activity_level TEXT DEFAULT 'moderate';
ALTER TABLE athlete_profile ADD COLUMN protein_g_per_kg REAL DEFAULT 1.4;
ALTER TABLE athlete_profile ADD COLUMN deficit_pct REAL;
ALTER TABLE athlete_profile ADD COLUMN meals_per_day INTEGER DEFAULT 3;
ALTER TABLE athlete_profile ADD COLUMN training_days TEXT;
ALTER TABLE athlete_profile ADD COLUMN hiking_days TEXT;

-- Seguimiento semanal: días en los que se alcanzó el objetivo de proteína y zonas de molestia.
ALTER TABLE checkins ADD COLUMN protein_days INTEGER;
ALTER TABLE checkins ADD COLUMN pain_zones TEXT;
