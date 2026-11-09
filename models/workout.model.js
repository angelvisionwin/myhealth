'use strict';

const db = require('../config/database');
const exerciseModel = require('./exercise.model');
const { escapeLike } = require('../utils/query');

function buildFilters(filters = {}) {
  const clauses = [];
  const params = {};

  if (filters.from) {
    clauses.push("date(w.start_time, 'localtime') >= @from");
    params.from = filters.from;
  }

  if (filters.to) {
    clauses.push("date(w.start_time, 'localtime') <= @to");
    params.to = filters.to;
  }

  if (filters.search) {
    clauses.push("w.title LIKE @search ESCAPE '\\'");
    params.search = `%${escapeLike(filters.search)}%`;
  }

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  };
}

function list(filters = {}) {
  const { where, params } = buildFilters(filters);
  const limit = filters.limit || 20;
  const offset = filters.offset || 0;

  const total = db
    .prepare(`SELECT COUNT(*) AS count FROM workouts w ${where}`)
    .get(params).count;

  const rows = db
    .prepare(`
      SELECT
        w.*,
        (SELECT COUNT(DISTINCT ws.exercise_id) FROM workout_sets ws WHERE ws.workout_id = w.id) AS exercise_count,
        (SELECT COUNT(*) FROM workout_sets ws WHERE ws.workout_id = w.id) AS set_count
      FROM workouts w
      ${where}
      ORDER BY COALESCE(w.start_time, w.created_at) DESC, w.id DESC
      LIMIT @limit OFFSET @offset
    `)
    .all({ ...params, limit, offset });

  return { rows, total };
}

function getRecent(limit = 5) {
  return list({ limit, offset: 0 }).rows;
}

function findById(id) {
  const workout = db.prepare('SELECT * FROM workouts WHERE id = ?').get(id);
  if (!workout) {
    return null;
  }

  const rows = db
    .prepare(`
      SELECT
        ws.*,
        e.name AS exercise_name,
        e.muscle_group,
        e.equipment
      FROM workout_sets ws
      JOIN exercises e ON e.id = ws.exercise_id
      WHERE ws.workout_id = ?
      ORDER BY ws.id ASC
    `)
    .all(id);

  const exercises = [];
  const exercisesById = new Map();

  for (const row of rows) {
    let exercise = exercisesById.get(row.exercise_id);
    if (!exercise) {
      exercise = {
        id: row.exercise_id,
        name: row.exercise_name,
        muscle_group: row.muscle_group,
        equipment: row.equipment,
        sets: []
      };
      exercisesById.set(row.exercise_id, exercise);
      exercises.push(exercise);
    }

    exercise.sets.push({
      id: row.id,
      set_index: row.set_index,
      set_type: row.set_type,
      weight_kg: row.weight_kg,
      repetitions: row.repetitions,
      distance_meters: row.distance_meters,
      duration_seconds: row.duration_seconds,
      rpe: row.rpe
    });
  }

  return {
    ...workout,
    exercises,
    exercise_count: exercises.length,
    set_count: rows.length
  };
}

function getMonthlySummary() {
  // strftime con 'localtime' usa la zona horaria del sistema (España en este equipo).
  return db
    .prepare(`
      SELECT
        COUNT(*) AS workout_count,
        COALESCE(SUM(CASE WHEN duration_seconds > 0 THEN duration_seconds ELSE 0 END), 0) AS duration_seconds
      FROM workouts
      WHERE start_time IS NOT NULL
        AND strftime('%Y-%m', start_time, 'localtime') = strftime('%Y-%m', 'now', 'localtime')
    `)
    .get();
}

function computeDurationSeconds(startTime, endTime) {
  if (!startTime || !endTime) {
    return null;
  }

  const start = Date.parse(startTime);
  const end = Date.parse(endTime);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }

  return Math.round((end - start) / 1000);
}

function upsertFromHevy(workout) {
  if (!workout.hevyId) {
    throw new Error('El entrenamiento de Hevy no tiene identificador.');
  }

  const now = new Date().toISOString();
  const findWorkout = db.prepare('SELECT id FROM workouts WHERE hevy_id = ?');
  const insertWorkout = db.prepare(`
    INSERT INTO workouts
      (hevy_id, title, description, start_time, end_time, duration_seconds, created_at, updated_at, raw_json)
    VALUES
      (@hevyId, @title, @description, @startTime, @endTime, @durationSeconds, @createdAt, @updatedAt, @rawJson)
  `);
  const updateWorkout = db.prepare(`
    UPDATE workouts SET
      title = @title,
      description = @description,
      start_time = @startTime,
      end_time = @endTime,
      duration_seconds = @durationSeconds,
      created_at = @createdAt,
      updated_at = @updatedAt,
      raw_json = @rawJson
    WHERE id = @id
  `);
  const deleteSets = db.prepare('DELETE FROM workout_sets WHERE workout_id = ?');
  const insertSet = db.prepare(`
    INSERT INTO workout_sets
      (workout_id, exercise_id, set_index, set_type, weight_kg, repetitions,
       distance_meters, duration_seconds, rpe, raw_json)
    VALUES
      (@workoutId, @exerciseId, @setIndex, @setType, @weightKg, @repetitions,
       @distanceMeters, @durationSeconds, @rpe, @rawJson)
  `);

  const save = db.transaction((data) => {
    const existing = findWorkout.get(data.hevyId);
    const workoutValues = {
      title: data.title ?? null,
      description: data.description ?? null,
      startTime: data.startTime ?? null,
      endTime: data.endTime ?? null,
      durationSeconds: computeDurationSeconds(data.startTime, data.endTime),
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
      rawJson: data.rawJson ?? null
    };

    let workoutId;

    if (existing) {
      updateWorkout.run({ ...workoutValues, id: existing.id });
      workoutId = existing.id;
    } else {
      const result = insertWorkout.run({ ...workoutValues, hevyId: data.hevyId });
      workoutId = result.lastInsertRowid;
    }

    deleteSets.run(workoutId);

    for (const exercise of data.exercises || []) {
      const exerciseId = exerciseModel.upsertFromHevy(exercise);

      for (const set of exercise.sets || []) {
        insertSet.run({
          workoutId,
          exerciseId,
          setIndex: set.index ?? null,
          setType: set.type ?? null,
          weightKg: set.weightKg ?? null,
          repetitions: set.repetitions ?? null,
          distanceMeters: set.distanceMeters ?? null,
          durationSeconds: set.durationSeconds ?? null,
          rpe: set.rpe ?? null,
          rawJson: set.rawJson ?? null
        });
      }
    }

    return { created: !existing, workoutId };
  });

  return save(workout);
}

module.exports = {
  list,
  getRecent,
  findById,
  getMonthlySummary,
  upsertFromHevy
};
