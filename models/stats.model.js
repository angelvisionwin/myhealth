'use strict';

const db = require('../config/database');

const VOLUME_CONDITION =
  "ws.weight_kg > 0 AND ws.repetitions > 0 AND COALESCE(ws.set_type, 'normal') <> 'warmup'";

function getSummary() {
  const workouts = db
    .prepare(`
      SELECT
        COUNT(*) AS workout_count,
        COALESCE(SUM(duration_seconds), 0) AS duration_seconds
      FROM workouts
      WHERE start_time IS NOT NULL
        AND strftime('%Y-%m', start_time, 'localtime') = strftime('%Y-%m', 'now', 'localtime')
    `)
    .get();

  const sets = db
    .prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN ${VOLUME_CONDITION} THEN ws.weight_kg * ws.repetitions ELSE 0 END), 0) AS volume,
        COUNT(ws.id) AS set_count,
        COUNT(DISTINCT ws.exercise_id) AS exercise_count
      FROM workout_sets ws
      JOIN workouts w ON w.id = ws.workout_id
      WHERE w.start_time IS NOT NULL
        AND strftime('%Y-%m', w.start_time, 'localtime') = strftime('%Y-%m', 'now', 'localtime')
    `)
    .get();

  const overall = db.prepare('SELECT COUNT(*) AS workout_count FROM workouts').get();

  return {
    ...workouts,
    ...sets,
    total_workout_count: overall.workout_count
  };
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(monthString, months) {
  const [year, month] = monthString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getWeeklyStats(weeks = 12) {
  const currentWeekStart = db
    .prepare("SELECT date('now', 'localtime', 'weekday 0', '-6 days') AS week_start")
    .get().week_start;

  const rows = db
    .prepare(`
      SELECT
        date(w.start_time, 'localtime', 'weekday 0', '-6 days') AS week_start,
        COUNT(DISTINCT w.id) AS workout_count,
        COALESCE(
          SUM(CASE WHEN ${VOLUME_CONDITION} THEN ws.weight_kg * ws.repetitions ELSE 0 END),
          0
        ) AS volume
      FROM workouts w
      LEFT JOIN workout_sets ws ON ws.workout_id = w.id
      WHERE w.start_time IS NOT NULL
        AND date(w.start_time, 'localtime', 'weekday 0', '-6 days') >= date(@currentWeekStart, '-77 days')
      GROUP BY week_start
      ORDER BY week_start
    `)
    .all({ currentWeekStart });

  const byWeek = new Map(rows.map((row) => [row.week_start, row]));

  return Array.from({ length: weeks }, (_, index) => {
    const weekStart = addDays(currentWeekStart, -7 * (weeks - 1 - index));
    const row = byWeek.get(weekStart);
    return {
      weekStart,
      workoutCount: row?.workout_count ?? 0,
      volume: row?.volume ?? 0
    };
  });
}

function getMonthlyStats(months = 12) {
  const currentMonth = db
    .prepare("SELECT strftime('%Y-%m', 'now', 'localtime') AS month")
    .get().month;

  const workoutRows = db
    .prepare(`
      SELECT
        strftime('%Y-%m', start_time, 'localtime') AS month,
        COUNT(*) AS workout_count,
        COALESCE(SUM(duration_seconds), 0) AS duration_seconds
      FROM workouts
      WHERE start_time IS NOT NULL
        AND strftime('%Y-%m', start_time, 'localtime') >= strftime('%Y-%m', 'now', 'localtime', '-11 months')
      GROUP BY month
      ORDER BY month
    `)
    .all();

  const volumeRows = db
    .prepare(`
      SELECT
        strftime('%Y-%m', w.start_time, 'localtime') AS month,
        COALESCE(
          SUM(CASE WHEN ${VOLUME_CONDITION} THEN ws.weight_kg * ws.repetitions ELSE 0 END),
          0
        ) AS volume
      FROM workout_sets ws
      JOIN workouts w ON w.id = ws.workout_id
      WHERE w.start_time IS NOT NULL
        AND strftime('%Y-%m', w.start_time, 'localtime') >= strftime('%Y-%m', 'now', 'localtime', '-11 months')
      GROUP BY month
      ORDER BY month
    `)
    .all();

  const workoutsByMonth = new Map(workoutRows.map((row) => [row.month, row]));
  const volumeByMonth = new Map(volumeRows.map((row) => [row.month, row]));

  return Array.from({ length: months }, (_, index) => {
    const month = addMonths(currentMonth, -(months - 1 - index));
    const workout = workoutsByMonth.get(month);
    const volume = volumeByMonth.get(month);

    return {
      month,
      workoutCount: workout?.workout_count ?? 0,
      durationSeconds: workout?.duration_seconds ?? 0,
      volume: volume?.volume ?? 0
    };
  });
}

function listExercisesWithData() {
  return db
    .prepare(`
      SELECT e.id, e.name, COUNT(ws.id) AS set_count
      FROM exercises e
      JOIN workout_sets ws ON ws.exercise_id = e.id
      GROUP BY e.id
      ORDER BY e.name COLLATE NOCASE ASC
    `)
    .all();
}

function findExerciseById(id) {
  return db.prepare('SELECT id, name FROM exercises WHERE id = ?').get(id) || null;
}

function getExerciseEvolution(exerciseId) {
  return db
    .prepare(`
      SELECT
        w.id AS workout_id,
        w.title,
        w.start_time,
        MAX(CASE WHEN ws.weight_kg > 0 THEN ws.weight_kg END) AS max_weight,
        SUM(CASE WHEN ws.repetitions > 0 THEN ws.repetitions ELSE 0 END) AS total_reps,
        COALESCE(
          SUM(CASE WHEN ${VOLUME_CONDITION} THEN ws.weight_kg * ws.repetitions ELSE 0 END),
          0
        ) AS volume,
        COUNT(ws.id) AS set_count
      FROM workout_sets ws
      JOIN workouts w ON w.id = ws.workout_id
      WHERE ws.exercise_id = ?
      GROUP BY w.id
      ORDER BY w.start_time ASC, w.id ASC
    `)
    .all(exerciseId);
}

function getPersonalRecords() {
  const rows = db
    .prepare(`
      SELECT
        e.id AS exercise_id,
        e.name,
        ws.weight_kg,
        ws.repetitions,
        w.start_time
      FROM workout_sets ws
      JOIN exercises e ON e.id = ws.exercise_id
      JOIN workouts w ON w.id = ws.workout_id
      WHERE (ws.weight_kg IS NOT NULL AND ws.weight_kg > 0)
         OR (ws.repetitions IS NOT NULL AND ws.repetitions > 0)
      ORDER BY e.name COLLATE NOCASE ASC, w.start_time ASC, ws.id ASC
    `)
    .all();

  const records = new Map();

  for (const row of rows) {
    let record = records.get(row.exercise_id);
    if (!record) {
      record = {
        exerciseId: row.exercise_id,
        name: row.name,
        bestWeight: null,
        bestReps: null
      };
      records.set(row.exercise_id, record);
    }

    const weight = row.weight_kg !== null && row.weight_kg > 0 ? row.weight_kg : null;
    const reps = row.repetitions !== null && row.repetitions > 0 ? row.repetitions : null;

    if (
      weight !== null &&
      (!record.bestWeight ||
        weight > record.bestWeight.weight ||
        (weight === record.bestWeight.weight && (reps ?? 0) > (record.bestWeight.reps ?? 0)))
    ) {
      record.bestWeight = { weight, reps, date: row.start_time };
    }

    if (
      reps !== null &&
      (!record.bestReps ||
        reps > record.bestReps.reps ||
        (reps === record.bestReps.reps && (weight ?? 0) > (record.bestReps.weight ?? 0)))
    ) {
      record.bestReps = { reps, weight, date: row.start_time };
    }
  }

  return [...records.values()];
}

module.exports = {
  getSummary,
  getWeeklyStats,
  getMonthlyStats,
  listExercisesWithData,
  findExerciseById,
  getExerciseEvolution,
  getPersonalRecords
};
