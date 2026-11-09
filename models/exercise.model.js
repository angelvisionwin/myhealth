'use strict';

const db = require('../config/database');

function findById(id) {
  return db.prepare('SELECT * FROM exercises WHERE id = ?').get(id) || null;
}

function findByHevyId(hevyExerciseId) {
  if (!hevyExerciseId) {
    return null;
  }

  return db.prepare('SELECT * FROM exercises WHERE hevy_exercise_id = ?').get(hevyExerciseId) || null;
}

// Catálogo mínimo para relacionar los ejercicios de una rutina con su grupo muscular.
function listCatalog() {
  return db
    .prepare(`
      SELECT id, hevy_exercise_id, name, muscle_group, secondary_muscle_groups, equipment, is_unilateral
      FROM exercises
      WHERE hevy_exercise_id IS NOT NULL
    `)
    .all();
}

function listForSettings() {
  return db
    .prepare(`
      SELECT
        e.id,
        e.name,
        e.muscle_group,
        e.equipment,
        e.is_unilateral,
        COUNT(ws.id) AS set_count,
        MAX(date(w.start_time, 'localtime')) AS last_used
      FROM exercises e
      LEFT JOIN workout_sets ws ON ws.exercise_id = e.id
      LEFT JOIN workouts w ON w.id = ws.workout_id
      GROUP BY e.id
      HAVING COUNT(ws.id) > 0
      ORDER BY set_count DESC, e.name COLLATE NOCASE ASC
    `)
    .all();
}

function setUnilateral(id, isUnilateral) {
  return db
    .prepare('UPDATE exercises SET is_unilateral = ? WHERE id = ?')
    .run(isUnilateral ? 1 : 0, id).changes;
}

function upsertFromHevy(exercise) {
  if (!exercise.hevyExerciseId || !exercise.name) {
    throw new Error('El ejercicio de Hevy no tiene identificador o nombre.');
  }

  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO exercises
      (hevy_exercise_id, name, muscle_group, secondary_muscle_groups, equipment, created_at, updated_at)
    VALUES
      (@hevyExerciseId, @name, @muscleGroup, @secondaryMuscleGroups, @equipment, @createdAt, @updatedAt)
    ON CONFLICT(hevy_exercise_id) DO UPDATE SET
      name = excluded.name,
      muscle_group = COALESCE(excluded.muscle_group, exercises.muscle_group),
      secondary_muscle_groups = COALESCE(
        excluded.secondary_muscle_groups,
        exercises.secondary_muscle_groups
      ),
      equipment = COALESCE(excluded.equipment, exercises.equipment),
      updated_at = excluded.updated_at
  `).run({
    hevyExerciseId: exercise.hevyExerciseId,
    name: exercise.name,
    muscleGroup: exercise.muscleGroup ?? null,
    secondaryMuscleGroups: Array.isArray(exercise.secondaryMuscleGroups)
      ? JSON.stringify(exercise.secondaryMuscleGroups)
      : null,
    equipment: exercise.equipment ?? null,
    createdAt: exercise.createdAt || now,
    updatedAt: exercise.updatedAt || now
  });

  const row = db
    .prepare('SELECT id FROM exercises WHERE hevy_exercise_id = ?')
    .get(exercise.hevyExerciseId);

  return row.id;
}

module.exports = {
  findById,
  findByHevyId,
  listCatalog,
  listForSettings,
  setUnilateral,
  upsertFromHevy
};
