'use strict';

const hevyService = require('./hevy.service');
const athleteProfileModel = require('../models/athlete-profile.model');
const routineFolderModel = require('../models/hevy-routine-folder.model');
const routineModel = require('../models/hevy-routine.model');
const syncHistoryModel = require('../models/sync-history.model');

const PROVIDER = 'hevy-routines';
const MAX_ERROR_MESSAGE_LENGTH = 1000;

let syncInProgress = false;

function truncate(message) {
  if (!message) {
    return null;
  }

  return message.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH - 1)}…`
    : message;
}

async function syncRoutines() {
  if (syncInProgress) {
    const error = new Error('Ya hay una sincronización de rutinas en curso.');
    error.code = 'ROUTINES_SYNC_IN_PROGRESS';
    throw error;
  }

  syncInProgress = true;
  const history = syncHistoryModel.start(PROVIDER);
  let itemsRead = 0;
  let itemsCreated = 0;
  let itemsUpdated = 0;
  let itemsRemoved = 0;
  let foldersRead = 0;
  let foldersRemoved = 0;
  let foldersSynced = false;

  try {
    // Las carpetas solo sirven para elegir la que alimenta el plan. Si fallan, la
    // sincronización de rutinas sigue adelante y se conserva la última copia local.
    let folders = [];
    try {
      folders = await hevyService.fetchAllRoutineFolders();
      foldersRead = folders.length;
      routineFolderModel.upsertMany(folders);
      foldersSynced = true;
    } catch (error) {
      foldersRead = 0;
    }

    const routines = await hevyService.fetchAllRoutines();
    itemsRead = routines.length;
    const result = routineModel.upsertMany(routines);
    itemsCreated = result.created;
    itemsUpdated = result.updated;
    itemsRemoved = routineModel.removeMissing(routines.map((routine) => routine.id));

    if (foldersSynced) {
      const validFolderIds = new Set(
        folders.map((folder) => folder.id).filter((id) => Number.isInteger(id))
      );
      foldersRemoved = routineFolderModel.removeMissing([...validFolderIds]).length;

      const profile = athleteProfileModel.get();
      if (profile?.routine_folder_id && !validFolderIds.has(profile.routine_folder_id)) {
        athleteProfileModel.clearRoutineFolderId();
      }
    }

    syncHistoryModel.finish(history.id, {
      status: 'success',
      itemsRead,
      itemsCreated,
      itemsUpdated
    });

    return { itemsRead, itemsCreated, itemsUpdated, itemsRemoved, foldersRead, foldersRemoved };
  } catch (error) {
    syncHistoryModel.finish(history.id, {
      status: 'error',
      itemsRead,
      itemsCreated,
      itemsUpdated,
      errorMessage: truncate(error.message)
    });
    throw error;
  } finally {
    syncInProgress = false;
  }
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toPutSet(set) {
  const repRange =
    set.rep_range && typeof set.rep_range === 'object'
      ? {
          start: toNumberOrNull(set.rep_range.start),
          end: toNumberOrNull(set.rep_range.end)
        }
      : null;

  return {
    type: set.type || 'normal',
    weight_kg: toNumberOrNull(set.weight_kg),
    reps: toNumberOrNull(set.reps),
    distance_meters: toNumberOrNull(set.distance_meters),
    duration_seconds: toNumberOrNull(set.duration_seconds),
    custom_metric: toNumberOrNull(set.custom_metric),
    rep_range: repRange
  };
}

// Convierte la rutina guardada (respuesta GET) al cuerpo que espera PUT /v1/routines.
function buildRoutinePayload(raw) {
  return {
    title: raw.title || 'Rutina',
    folder_id: Number.isInteger(raw.folder_id) ? raw.folder_id : null,
    notes: typeof raw.notes === 'string' ? raw.notes : null,
    exercises: (Array.isArray(raw.exercises) ? raw.exercises : [])
      .filter((exercise) => exercise && exercise.exercise_template_id)
      .map((exercise) => ({
        exercise_template_id: exercise.exercise_template_id,
        superset_id: Number.isInteger(exercise.superset_id) ? exercise.superset_id : null,
        rest_seconds: Number.isInteger(exercise.rest_seconds) ? exercise.rest_seconds : null,
        notes: typeof exercise.notes === 'string' ? exercise.notes : null,
        sets: (Array.isArray(exercise.sets) ? exercise.sets : []).map(toPutSet)
      }))
  };
}

function applyChangeToRoutine(routine, change) {
  const exercise = routine.exercises[change.routineExerciseIndex];

  if (!exercise) {
    throw new Error(`No se encontró el ejercicio de la rutina para aplicar «${change.exerciseName}».`);
  }

  const warmupSets = exercise.sets.filter((set) => set.type === 'warmup');
  const workingSets = exercise.sets.filter((set) => set.type !== 'warmup');
  const target = Number(change.to);

  if (change.field === 'sets') {
    if (!Number.isInteger(target) || target < 1) {
      throw new Error(`El número de series propuesto para «${change.exerciseName}» no es válido.`);
    }
    if (workingSets.length === 0) {
      throw new Error(`«${change.exerciseName}» no tiene series de trabajo que ajustar.`);
    }

    if (target < workingSets.length) {
      exercise.sets = [...warmupSets, ...workingSets.slice(0, target)];
    } else if (target > workingSets.length) {
      const lastSet = workingSets[workingSets.length - 1];
      const extraSets = Array.from({ length: target - workingSets.length }, () => ({
        ...lastSet
      }));
      exercise.sets = [...warmupSets, ...workingSets, ...extraSets];
    }
    return;
  }

  if (change.field === 'reps') {
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(String(change.to));
    const reps = Number.parseInt(change.to, 10);

    if (!range && !Number.isInteger(reps)) {
      throw new Error(`Las repeticiones propuestas para «${change.exerciseName}» no son válidas.`);
    }

    for (const set of workingSets) {
      set.reps = range ? null : reps;
      set.rep_range = range ? { start: Number(range[1]), end: Number(range[2]) } : null;
    }
    return;
  }

  if (change.field === 'weight') {
    if (!Number.isFinite(target) || target <= 0) {
      throw new Error(`El peso propuesto para «${change.exerciseName}» no es válido.`);
    }

    for (const set of workingSets) {
      set.weight_kg = target;
    }
    return;
  }

  throw new Error(`Tipo de cambio no soportado: ${change.field}.`);
}

async function applyPlanChanges({ routineUpdates = [] } = {}) {
  const results = [];

  for (const update of routineUpdates) {
    try {
      const stored = routineModel.findByHevyId(update.routineId);

      if (!stored?.raw) {
        throw new Error('La rutina ya no está en la copia local. Sincroniza antes de aplicar los cambios.');
      }

      const routine = buildRoutinePayload(stored.raw);

      for (const change of update.changes) {
        applyChangeToRoutine(routine, change);
      }

      const updatedRoutine = await hevyService.updateRoutine(update.routineId, routine);
      routineModel.upsertMany([
        Array.isArray(updatedRoutine.exercises) && updatedRoutine.exercises.length > 0
          ? updatedRoutine
          : { ...stored.raw, ...routine, id: update.routineId }
      ]);

      results.push({
        routineId: update.routineId,
        title: update.title,
        status: 'updated'
      });
    } catch (error) {
      results.push({
        routineId: update.routineId,
        title: update.title,
        status: 'error',
        message: truncate(error.message)
      });
    }
  }

  return {
    updated: results.filter((result) => result.status === 'updated').length,
    failed: results.filter((result) => result.status === 'error')
  };
}

module.exports = {
  applyPlanChanges,
  syncRoutines
};
