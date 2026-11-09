'use strict';

const db = require('../config/database');

function list() {
  return db
    .prepare(`
      SELECT id, hevy_id, title, folder_id, exercise_count, set_count, synced_at
      FROM hevy_routines
      ORDER BY title COLLATE NOCASE ASC
    `)
    .all();
}

function findByHevyId(hevyId) {
  if (!hevyId) {
    return null;
  }

  const row = db
    .prepare(
      'SELECT id, hevy_id, title, folder_id, raw_json FROM hevy_routines WHERE hevy_id = ?'
    )
    .get(hevyId);

  if (!row) {
    return null;
  }

  let raw = null;

  try {
    raw = JSON.parse(row.raw_json);
  } catch (error) {
    raw = null;
  }

  return { ...row, raw };
}

function mapDetailedRow(row) {
  let raw = null;

  try {
    raw = JSON.parse(row.raw_json);
  } catch (error) {
    raw = null;
  }

  const exercises = Array.isArray(raw?.exercises) ? raw.exercises : [];

  return {
    id: row.id,
    hevyId: row.hevy_id,
    title: row.title || 'Rutina sin título',
    folderId: Number.isInteger(row.folder_id) ? row.folder_id : null,
    syncedAt: row.synced_at || null,
    exercises: exercises
      .filter((exercise) => exercise && exercise.title)
      .map((exercise) => ({
        title: String(exercise.title).slice(0, 200),
        notes: typeof exercise.notes === 'string' ? exercise.notes.trim().slice(0, 400) : null,
        templateId: exercise.exercise_template_id || null,
        supersetId: Number.isInteger(exercise.superset_id) ? exercise.superset_id : null,
        restSeconds: Number.isFinite(Number(exercise.rest_seconds))
          ? Number(exercise.rest_seconds)
          : null,
        sets: (Array.isArray(exercise.sets) ? exercise.sets : []).map((set) => ({
          type: set?.type || 'normal',
          weightKg: Number.isFinite(Number(set?.weight_kg)) ? Number(set.weight_kg) : null,
          reps: Number.isFinite(Number(set?.reps)) ? Number(set.reps) : null,
          repRange:
            set?.rep_range &&
            Number.isFinite(Number(set.rep_range.start)) &&
            Number.isFinite(Number(set.rep_range.end))
              ? {
                  start: Number(set.rep_range.start),
                  end: Number(set.rep_range.end)
                }
              : null,
          durationSeconds: Number.isFinite(Number(set?.duration_seconds))
            ? Number(set.duration_seconds)
            : null,
          distanceMeters: Number.isFinite(Number(set?.distance_meters))
            ? Number(set.distance_meters)
            : null
        }))
      }))
  };
}

// Rutinas con sus ejercicios y series normalizados para construir el plan semanal.
function listDetailed() {
  return db
    .prepare(`
      SELECT id, hevy_id, title, folder_id, raw_json, synced_at
      FROM hevy_routines
      ORDER BY title COLLATE NOCASE ASC
    `)
    .all()
    .map(mapDetailedRow);
}

function findDetailedByHevyId(hevyId) {
  if (!hevyId) {
    return null;
  }

  const row = db
    .prepare(
      'SELECT id, hevy_id, title, folder_id, raw_json, synced_at FROM hevy_routines WHERE hevy_id = ?'
    )
    .get(hevyId);

  return row ? mapDetailedRow(row) : null;
}

function removeMissing(hevyIds) {
  const keep = new Set(
    (Array.isArray(hevyIds) ? hevyIds : []).filter(
      (hevyId) => typeof hevyId === 'string' && hevyId.length > 0
    )
  );
  const rows = db.prepare('SELECT id, hevy_id FROM hevy_routines').all();
  const removed = rows.filter((row) => !keep.has(row.hevy_id));

  if (removed.length === 0) {
    return 0;
  }

  const remove = db.prepare('DELETE FROM hevy_routines WHERE id = ?');
  const run = db.transaction(() => {
    for (const row of removed) {
      remove.run(row.id);
    }
  });

  run();
  return removed.length;
}

function upsertMany(routines) {
  const now = new Date().toISOString();
  const find = db.prepare('SELECT id FROM hevy_routines WHERE hevy_id = ?');
  const insert = db.prepare(`
    INSERT INTO hevy_routines
      (hevy_id, title, folder_id, exercise_count, set_count, raw_json, synced_at)
    VALUES
      (@hevyId, @title, @folderId, @exerciseCount, @setCount, @rawJson, @syncedAt)
  `);
  const update = db.prepare(`
    UPDATE hevy_routines SET
      title = @title,
      folder_id = @folderId,
      exercise_count = @exerciseCount,
      set_count = @setCount,
      raw_json = @rawJson,
      synced_at = @syncedAt
    WHERE id = @id
  `);

  let created = 0;
  let updated = 0;

  const run = db.transaction((items) => {
    for (const routine of items) {
      if (!routine || typeof routine.id !== 'string' || routine.id.length === 0) {
        continue;
      }

      const exercises = Array.isArray(routine.exercises) ? routine.exercises : [];
      const setCount = exercises.reduce(
        (total, exercise) =>
          total + (Array.isArray(exercise.sets) ? exercise.sets.length : 0),
        0
      );
      const values = {
        hevyId: routine.id,
        title: typeof routine.title === 'string' ? routine.title : null,
        folderId: Number.isInteger(routine.folder_id) ? routine.folder_id : null,
        exerciseCount: exercises.length,
        setCount,
        rawJson: JSON.stringify(routine),
        syncedAt: now
      };
      const existing = find.get(values.hevyId);

      if (existing) {
        update.run({ ...values, id: existing.id });
        updated += 1;
      } else {
        insert.run(values);
        created += 1;
      }
    }
  });

  run(routines);

  return { created, updated };
}

module.exports = {
  findByHevyId,
  findDetailedByHevyId,
  list,
  listDetailed,
  removeMissing,
  upsertMany
};
