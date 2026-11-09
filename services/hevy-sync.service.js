'use strict';

const settings = require('../config/settings');
const hevyService = require('./hevy.service');
const workoutModel = require('../models/workout.model');
const syncHistoryModel = require('../models/sync-history.model');

const MAX_ERROR_MESSAGE_LENGTH = 1000;

let syncInProgress = false;

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toIntegerOrNull(value) {
  const number = toNumberOrNull(value);
  return number === null ? null : Math.round(number);
}

function buildTemplateMap(templates) {
  const map = new Map();

  for (const template of templates) {
    if (template && typeof template.id === 'string' && template.id.length > 0) {
      map.set(template.id, template);
    }
  }

  return map;
}

function normalizeWorkout(workout, templates) {
  if (!workout || typeof workout !== 'object') {
    throw new Error('Hevy devolvió un entrenamiento con un formato inesperado.');
  }

  const hevyId = typeof workout.id === 'string' ? workout.id.trim() : '';
  if (!hevyId) {
    throw new Error('El entrenamiento no tiene identificador de Hevy.');
  }

  const rawExercises = Array.isArray(workout.exercises) ? workout.exercises : [];
  const exercises = rawExercises.map((exercise) => {
    const templateId =
      typeof exercise.exercise_template_id === 'string'
        ? exercise.exercise_template_id.trim()
        : '';

    if (!templateId) {
      throw new Error('Un ejercicio no tiene exercise_template_id.');
    }

    const template = templates.get(templateId);
    const title =
      typeof exercise.title === 'string' && exercise.title.trim()
        ? exercise.title.trim()
        : template?.title;

    if (!title) {
      throw new Error('Un ejercicio no tiene título ni plantilla asociada.');
    }

    const rawSets = Array.isArray(exercise.sets) ? exercise.sets : [];
    const sets = rawSets.map((set) => ({
      index: toIntegerOrNull(set.index),
      type: typeof set.type === 'string' ? set.type : null,
      weightKg: toNumberOrNull(set.weight_kg),
      repetitions: toIntegerOrNull(set.reps),
      distanceMeters: toNumberOrNull(set.distance_meters),
      durationSeconds: toIntegerOrNull(set.duration_seconds),
      rpe: toNumberOrNull(set.rpe),
      rawJson: JSON.stringify(set)
    }));

    return {
      hevyExerciseId: templateId,
      name: title,
      muscleGroup:
        template && typeof template.primary_muscle_group === 'string'
          ? template.primary_muscle_group
          : null,
      secondaryMuscleGroups:
        template && Array.isArray(template.secondary_muscle_groups)
          ? template.secondary_muscle_groups.filter((group) => typeof group === 'string')
          : null,
      equipment:
        template && typeof template.equipment === 'string' ? template.equipment : null,
      sets
    };
  });

  return {
    hevyId,
    title: typeof workout.title === 'string' ? workout.title : null,
    description: typeof workout.description === 'string' ? workout.description : null,
    startTime: typeof workout.start_time === 'string' ? workout.start_time : null,
    endTime: typeof workout.end_time === 'string' ? workout.end_time : null,
    createdAt: typeof workout.created_at === 'string' ? workout.created_at : null,
    updatedAt: typeof workout.updated_at === 'string' ? workout.updated_at : null,
    rawJson: JSON.stringify(workout),
    exercises
  };
}

function truncateErrorMessage(message) {
  if (!message) {
    return null;
  }

  return message.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH - 1)}…`
    : message;
}

function createSyncError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function syncAll() {
  if (!settings.hevy.isConfigured) {
    throw createSyncError(
      'HEVY_NOT_CONFIGURED',
      'La API Key de Hevy no está configurada. Añade HEVY_API_KEY al fichero .env.'
    );
  }

  if (syncInProgress) {
    throw createSyncError('SYNC_IN_PROGRESS', 'Ya hay una sincronización con Hevy en curso.');
  }

  syncInProgress = true;
  let historyId = null;
  const counters = {
    itemsRead: 0,
    itemsCreated: 0,
    itemsUpdated: 0
  };
  const failedWorkouts = [];
  let templateWarning = null;

  try {
    syncHistoryModel.failInterrupted('hevy');
    const history = syncHistoryModel.start('hevy');
    historyId = history.id;

    let templates = new Map();

    try {
      const templateList = await hevyService.fetchAllExerciseTemplates();
      templates = buildTemplateMap(templateList);
    } catch (error) {
      // La autenticación y los errores de configuración deben detener la sincronización.
      if (error.code === 'INVALID_API_KEY' || error.code === 'HEVY_NOT_CONFIGURED') {
        throw error;
      }

      templateWarning = `No se pudo cargar el catálogo de ejercicios: ${error.message}`;
      console.warn(`[hevy-sync] ${templateWarning}`);
    }

    const pagination = await hevyService.fetchAllWorkouts(async (page) => {
      for (const rawWorkout of page.items) {
        counters.itemsRead += 1;

        try {
          const workout = normalizeWorkout(rawWorkout, templates);
          const result = workoutModel.upsertFromHevy(workout);

          if (result.created) {
            counters.itemsCreated += 1;
          } else {
            counters.itemsUpdated += 1;
          }
        } catch (error) {
          failedWorkouts.push(`Entrenamiento ${counters.itemsRead}: ${error.message}`);
        }
      }
    });

    const status = failedWorkouts.length > 0 ? 'partial' : 'success';
    const messageParts = [];

    if (templateWarning) {
      messageParts.push(templateWarning);
    }

    if (failedWorkouts.length > 0) {
      messageParts.push(
        `${failedWorkouts.length} entrenamiento(s) no se pudieron guardar: ${failedWorkouts
          .slice(0, 3)
          .join(' | ')}`
      );
    }

    const result = {
      status,
      ...counters,
      pagesFetched: pagination.pagesFetched,
      failedCount: failedWorkouts.length,
      errorMessage: truncateErrorMessage(messageParts.join(' '))
    };

    syncHistoryModel.finish(historyId, {
      ...result,
      finishedAt: new Date().toISOString()
    });

    return result;
  } catch (error) {
    if (historyId !== null) {
      try {
        syncHistoryModel.finish(historyId, {
          status: 'error',
          itemsRead: counters.itemsRead,
          itemsCreated: counters.itemsCreated,
          itemsUpdated: counters.itemsUpdated,
          errorMessage: truncateErrorMessage(error.message),
          finishedAt: new Date().toISOString()
        });
      } catch (finishError) {
        console.error('[hevy-sync] No se pudo cerrar el historial de sincronización:', finishError);
      }
    }

    throw error;
  } finally {
    syncInProgress = false;
  }
}

module.exports = {
  syncAll
};
