'use strict';

const db = require('../config/database');

// El volumen de datos de una app personal es pequeño (miles de series), así que el motor
// de métricas puede cargar el histórico completo y calcular las tendencias en JavaScript.

function listWorkouts() {
  return db
    .prepare(`
      SELECT
        w.id,
        w.title,
        w.duration_seconds,
        w.start_time,
        json_extract(w.raw_json, '$.routine_id') AS routine_id,
        date(w.start_time, 'localtime') AS local_date
      FROM workouts w
      WHERE w.start_time IS NOT NULL
      ORDER BY w.start_time ASC, w.id ASC
    `)
    .all();
}

function listSets() {
  return db
    .prepare(`
      SELECT
        ws.id AS set_id,
        ws.workout_id,
        ws.exercise_id,
        ws.set_type,
        ws.weight_kg,
        ws.repetitions,
        ws.distance_meters,
        ws.duration_seconds,
        w.start_time,
        date(w.start_time, 'localtime') AS local_date,
        e.name AS exercise_name,
        e.muscle_group,
        e.secondary_muscle_groups,
        e.is_unilateral
      FROM workout_sets ws
      JOIN workouts w ON w.id = ws.workout_id
      JOIN exercises e ON e.id = ws.exercise_id
      WHERE w.start_time IS NOT NULL
      ORDER BY w.start_time ASC, ws.id ASC
    `)
    .all();
}

function listHikingSessions() {
  return db
    .prepare(`
      SELECT *
      FROM hiking_sessions
      ORDER BY session_date ASC, id ASC
    `)
    .all();
}

function listMeasurements(parameter) {
  return db
    .prepare(`
      SELECT measurement_date, value
      FROM measurements
      WHERE parameter = ?
      ORDER BY measurement_date ASC, id ASC
    `)
    .all(parameter);
}

module.exports = {
  listWorkouts,
  listSets,
  listHikingSessions,
  listMeasurements
};
