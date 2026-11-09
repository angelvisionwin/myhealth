'use strict';

const coachConfig = require('../config/coach.config');
const dates = require('../utils/dates');
const exerciseNames = require('../utils/exercise-names');
const format = require('../utils/format');

function round(value, decimals = 0) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function parseDays(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  let days = value;

  if (typeof value === 'string' && value.trim()) {
    try {
      days = JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  if (!Array.isArray(days)) {
    return fallback;
  }

  return [...new Set(days.map((day) => Number(day)))]
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
    .sort((a, b) => a - b);
}

function defaultTrainingDays(sessionsPerWeek) {
  if (sessionsPerWeek <= 1) return [3];
  if (sessionsPerWeek === 2) return [2, 5];
  if (sessionsPerWeek === 4) return [1, 2, 4, 5];
  if (sessionsPerWeek >= 5) return [1, 2, 3, 5, 6];
  return [1, 3, 5];
}

function getFocusGroups(metrics, { usedGroups = new Set(), count = 2 } = {}) {
  const legGroups = new Set(['quads', 'hams', 'glutes', 'calves']);
  const avoidLegs =
    metrics.hiking?.bigHikeRecent ||
    (metrics.recovery?.painZones || []).some((zone) =>
      ['knee', 'hip', 'ankle'].includes(zone.key)
    );
  const sorted = [...(metrics.muscles?.perGroup || [])].sort(
    (a, b) =>
      a.setsPerWeek - b.setsPerWeek ||
      (b.daysSince === null ? 999 : b.daysSince) - (a.daysSince === null ? 999 : a.daysSince)
  );

  return sorted
    .filter((group) => !usedGroups.has(group.key))
    .filter((group) => !(avoidLegs && legGroups.has(group.key)))
    .slice(0, count)
    .map((group) => ({
      key: group.key,
      label: group.label,
      setsPerWeek: group.setsPerWeek,
      daysSince: group.daysSince
    }));
}

const GENERIC_EXERCISES = Object.freeze({
  chest: 'Press de banca o máquina',
  back: 'Remo o jalón',
  shoulders: 'Press militar o elevaciones laterales',
  biceps: 'Curl con mancuernas',
  triceps: 'Extensión de tríceps',
  quads: 'Sentadilla o prensa',
  hams: 'Curl femoral o peso muerto rumano',
  glutes: 'Hip thrust o zancadas',
  calves: 'Elevación de gemelos',
  abs: 'Plancha o crunch en polea'
});

function pickExercises(metrics, focusGroups) {
  const candidates = new Map();

  for (const exercise of metrics.nextSession?.exercises || []) {
    candidates.set(exercise.id || exercise.name, {
      name: exercise.name,
      group: exercise.group,
      groupLabel: exercise.groupLabel,
      reference: exercise.load ? `Última carga: ${exercise.load}` : null
    });
  }

  for (const exercise of metrics.strength?.exercises || []) {
    const key = exercise.id || exercise.name;
    if (!candidates.has(key)) {
      candidates.set(key, {
        name: exercise.name,
        group: exercise.muscleGroup,
        groupLabel:
          coachConfig.MUSCLE_GROUP_BY_KEY.get(exercise.muscleGroup)?.label ||
          exercise.muscleGroup,
        reference:
          exercise.maxE1rmLatest !== null
            ? `e1RM ${exercise.maxE1rmLatest} kg`
            : null
      });
    }
  }

  const all = [...candidates.values()];
  const picked = [];
  const usedNames = new Set();

  for (const group of focusGroups) {
    const matches = all
      .filter((exercise) => exercise.group === group.key && !usedNames.has(exercise.name))
      .slice(0, 2);

    if (matches.length === 0) {
      const fallback = GENERIC_EXERCISES[group.key];
      if (fallback && !usedNames.has(fallback)) {
        picked.push({
          name: fallback,
          groupLabel: group.label,
          reference: null
        });
        usedNames.add(fallback);
      }
      continue;
    }

    for (const match of matches) {
      if (picked.length >= 4) break;
      picked.push({
        name: match.name,
        groupLabel: match.groupLabel || group.label,
        reference: match.reference || null
      });
      usedNames.add(match.name);
    }
  }

  if (picked.length < 3) {
    for (const [key, name] of Object.entries(GENERIC_EXERCISES)) {
      if (picked.length >= 3) break;
      if (usedNames.has(name)) continue;

      picked.push({
        name,
        groupLabel: coachConfig.MUSCLE_GROUP_BY_KEY.get(key)?.label || key,
        reference: null
      });
      usedNames.add(name);
    }
  }

  return picked;
}

function buildHikingTarget(metrics) {
  const hiking = metrics.hiking || {};
  const avgMinutes =
    hiking.sessionsPeriod > 0 ? hiking.minutesPeriod / hiking.sessionsPeriod : null;
  const avgElevation =
    hiking.sessionsPeriod > 0 ? hiking.elevationPeriod / hiking.sessionsPeriod : null;
  const minutes = Math.min(300, Math.max(90, Math.round(((avgMinutes || 180) * 0.9) / 15) * 15));
  const elevation = Math.min(
    900,
    Math.max(250, Math.round(((avgElevation || 450) * 0.9) / 50) * 50)
  );

  return {
    minutes,
    elevation,
    note: hiking.bigHikeRecent
      ? 'La última semana ya tuvo carga alta de montaña: mantén esta salida suave o cambia a paseo.'
      : 'Ritmo conversacional. Si vas a acumular desnivel, baja el volumen de piernas del gimnasio.'
  };
}

const DEFAULT_ROUTINE_FOLDER = 'musculacion';
const LEG_GROUP_KEYS = new Set(['quads', 'hams', 'glutes', 'calves']);

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function sortRoutines(routines) {
  return [...routines].sort((a, b) =>
    String(a.title || '').localeCompare(String(b.title || ''), 'es', {
      numeric: true,
      sensitivity: 'base'
    })
  );
}

function findPlanFolder({ profile, routineFolders, routines, lastRoutineId }) {
  const preferredId = Number.isInteger(profile?.routineFolderId)
    ? profile.routineFolderId
    : null;

  if (preferredId !== null) {
    const preferred = routineFolders.find((folder) => folder.hevy_id === preferredId);
    if (preferred) {
      return preferred;
    }
  }

  const named = routineFolders.find(
    (folder) => normalizeText(folder.title) === DEFAULT_ROUTINE_FOLDER
  );
  if (named) {
    return named;
  }

  // Sin carpetas sincronizadas todavía, la carpeta de la última rutina realizada
  // es la mejor pista para no mezclar rutinas de carpetas distintas.
  const lastRoutine = routines.find((routine) => routine.hevyId === lastRoutineId);
  if (lastRoutine && lastRoutine.folderId !== null) {
    return { hevy_id: lastRoutine.folderId, title: null };
  }

  const counts = new Map();
  for (const routine of routines) {
    if (routine.folderId === null) {
      continue;
    }
    counts.set(routine.folderId, (counts.get(routine.folderId) || 0) + 1);
  }

  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? { hevy_id: best[0], title: null } : null;
}

function isWarmupSet(set) {
  return String(set.type || 'normal').toLowerCase() === 'warmup';
}

function workingSets(exercise) {
  return (exercise.sets || []).filter((set) => !isWarmupSet(set));
}

function describeReps(sets) {
  const ranges = sets
    .map((set) => set.repRange)
    .filter((range) => range && range.start > 0 && range.end > 0);

  if (ranges.length > 0) {
    const start = Math.min(...ranges.map((range) => range.start));
    const end = Math.max(...ranges.map((range) => range.end));
    return start === end ? String(start) : `${start}-${end}`;
  }

  const reps = sets
    .map((set) => Number(set.reps))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (reps.length > 0) {
    const min = Math.min(...reps);
    const max = Math.max(...reps);
    return min === max ? String(min) : `${min}-${max}`;
  }

  const durations = sets
    .map((set) => Number(set.durationSeconds))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (durations.length > 0) {
    const seconds = Math.max(...durations);
    return seconds >= 60 ? `${Math.round(seconds / 60)} min` : `${seconds} s`;
  }

  return '8-12';
}

function describeWeight(sets) {
  const weights = sets
    .map((set) => Number(set.weightKg))
    .filter((value) => Number.isFinite(value) && value > 0);

  return weights.length > 0 ? Math.max(...weights) : null;
}

function buildGroupMap(exerciseCatalog) {
  const map = new Map();

  for (const exercise of exerciseCatalog) {
    const group = coachConfig.resolveMuscleGroup(exercise.muscle_group);
    if (exercise.hevy_exercise_id && group) {
      map.set(exercise.hevy_exercise_id, group);
    }
  }

  return map;
}

function routineLegShare(routine, groupByTemplate) {
  let legSets = 0;
  let totalSets = 0;

  for (const exercise of routine.exercises) {
    const sets = workingSets(exercise).length;
    totalSets += sets;
    if (LEG_GROUP_KEYS.has(groupByTemplate.get(exercise.templateId))) {
      legSets += sets;
    }
  }

  return totalSets > 0 ? legSets / totalSets : 0;
}

function isLegRoutine(routine, groupByTemplate) {
  return routineLegShare(routine, groupByTemplate) >= 0.4;
}

function describeChanges(changes) {
  return changes
    .map((change) => {
      if (change.field === 'sets') {
        return `${change.from} → ${change.to} series`;
      }
      if (change.field === 'reps') {
        return `${change.from} → ${change.to} repeticiones`;
      }
      return `${format.number(change.from)} kg → ${format.number(change.to)} kg`;
    })
    .join(' · ');
}

function buildRoutineExercises({
  routine,
  groupByTemplate,
  nameByTemplate,
  strengthByTemplate,
  strengthByName,
  deload
}) {
  const groups = new Map();
  const exercises = [];
  let warmup = null;

  for (const [exerciseIndex, exercise] of routine.exercises.entries()) {
    const group = groupByTemplate.get(exercise.templateId) || null;
    const sets = workingSets(exercise);
    const weight = describeWeight(sets);
    const hasReps = sets.some((set) => Number(set.reps) > 0 || set.repRange);
    const hasDuration = sets.some((set) => Number(set.durationSeconds) > 0);

    // Un ejercicio sin grupo muscular ni series medibles suele ser el cardio de
    // calentamiento (por ejemplo, la cinta). Se resume en el calentamiento.
    if (!group && weight === null && !hasReps) {
      if (hasDuration && !warmup) {
        const warmupName = exerciseNames.resolveExerciseName(exercise, nameByTemplate);
        warmup = `${describeReps(sets)} de ${warmupName} suave para entrar en calor`;
      }
      continue;
    }

    const targetSets = deload
      ? Math.min(2, Math.max(1, sets.length))
      : Math.max(1, sets.length);
    const displayName = exerciseNames.resolveExerciseName(exercise, nameByTemplate);
    const originalSets = sets.length;
    const proposedReps = describeReps(sets);
    const originalReps = describeReps(sets);
    const proposedWeight = weight;
    const originalWeight = weight;
    const changes = [];

    if (targetSets !== originalSets) {
      changes.push({ field: 'sets', from: originalSets, to: targetSets });
    }
    if (proposedReps !== originalReps) {
      changes.push({ field: 'reps', from: originalReps, to: proposedReps });
    }
    if (proposedWeight !== originalWeight) {
      changes.push({ field: 'weight', from: originalWeight, to: proposedWeight });
    }

    const strength =
      strengthByTemplate.get(exercise.templateId) ||
      strengthByName.get(normalizeText(exercise.title)) ||
      null;
    const referenceParts = [];

    if (weight !== null) {
      referenceParts.push(`Rutina: ${format.number(weight)} kg`);
    }
    if (strength?.maxE1rmLatest !== null && strength?.maxE1rmLatest !== undefined) {
      referenceParts.push(`e1RM ${format.number(strength.maxE1rmLatest)} kg`);
    }

    if (group) {
      groups.set(group, (groups.get(group) || 0) + targetSets);
    }

    exercises.push({
      name: displayName,
      originalName: exercise.title,
      groupLabel: group ? coachConfig.MUSCLE_GROUP_BY_KEY.get(group)?.label || group : null,
      sets: String(targetSets),
      reps: proposedReps,
      reference: referenceParts.length > 0 ? referenceParts.join(' · ') : null,
      note: exercise.notes || null,
      changed: changes.length > 0,
      changes,
      changeSummary: changes.length > 0 ? describeChanges(changes) : null,
      routineExerciseIndex: exerciseIndex,
      originalSets
    });
  }

  return { exercises, groups, warmup };
}

function buildRoutineWeek({
  profile,
  metrics,
  today,
  routines,
  routineFolders,
  exerciseCatalog
}) {
  if (!Array.isArray(routines) || routines.length === 0) {
    return null;
  }

  const folder = findPlanFolder({
    profile,
    routineFolders,
    routines,
    lastRoutineId: metrics.training?.lastRoutineId
  });
  let planRoutines = folder
    ? routines.filter((routine) => routine.folderId === folder.hevy_id)
    : routines.filter((routine) => routine.folderId === null);

  if (planRoutines.length === 0) {
    planRoutines = routines;
  }

  planRoutines = sortRoutines(planRoutines);
  if (planRoutines.length === 0) {
    return null;
  }

  const folderTitle = folder?.title || null;
  const weekStart = dates.startOfWeek(today);
  const targetSessions = profile?.targetSessionsPerWeek || 3;
  const trainingDays = parseDays(profile?.trainingDays, defaultTrainingDays(targetSessions));
  const hikingDays = parseDays(
    profile?.hikingDays,
    (metrics.hiking?.sessionsPeriod || 0) > 0 || profile?.includesFatLoss ? [6] : []
  );
  const deload =
    (metrics.recovery?.negativeMarkers?.length || 0) >= 3 &&
    (metrics.strength?.declinedCount || 0) > 0;
  const groupByTemplate = buildGroupMap(exerciseCatalog);
  const nameByTemplate = exerciseNames.buildNameMap(exerciseCatalog);
  const catalogById = new Map(
    exerciseCatalog
      .filter((exercise) => exercise.id && exercise.hevy_exercise_id)
      .map((exercise) => [exercise.id, exercise.hevy_exercise_id])
  );
  const strengthByTemplate = new Map();
  for (const exercise of metrics.strength?.exercises || []) {
    const templateId = catalogById.get(exercise.id);
    if (templateId) {
      strengthByTemplate.set(templateId, exercise);
    }
  }
  const strengthByName = new Map(
    (metrics.strength?.exercises || []).map((exercise) => [normalizeText(exercise.name), exercise])
  );
  const avoidLegs =
    metrics.hiking?.bigHikeRecent ||
    (metrics.recovery?.painZones || []).some((zone) =>
      ['knee', 'hip', 'ankle'].includes(zone.key)
    );

  let rotation = planRoutines;

  if (avoidLegs) {
    const upper = rotation.filter((routine) => !isLegRoutine(routine, groupByTemplate));
    const leg = rotation.filter((routine) => isLegRoutine(routine, groupByTemplate));
    rotation = [...upper, ...leg];
  }

  const rotationIndexById = new Map(
    rotation.map((routine, index) => [routine.hevyId, index])
  );
  const routineHistory = metrics.training?.routineHistory || [];

  const startIndexAfterLastWorkoutBefore = (date) => {
    const previous = [...routineHistory]
      .reverse()
      .find((workout) => workout.date < date && rotationIndexById.has(workout.routineId));
    return previous ? rotationIndexById.get(previous.routineId) + 1 : 0;
  };

  const routineAfterForPastDate = (date) =>
    rotation[startIndexAfterLastWorkoutBefore(date) % rotation.length];

  // La primera sesión pendiente es siempre la siguiente a la última rutina
  // realmente realizada. Los días planificados que no se completan no avanzan
  // la rotación: al volver al gimnasio se retoma donde se dejó.
  const nextRoutineFrom = (startIndex) => {
    for (let offset = 0; offset < rotation.length; offset += 1) {
      const index = (startIndex + offset) % rotation.length;
      const routine = rotation[index];
      if (!(avoidLegs && isLegRoutine(routine, groupByTemplate))) {
        return { index, routine };
      }
    }

    const index = startIndex % rotation.length;
    return { index, routine: rotation[index] };
  };

  const routineByDate = new Map();
  let futureIndex = null;

  for (const weekday of trainingDays) {
    const date = dates.addDays(weekStart, weekday - 1);

    if (date < today) {
      routineByDate.set(date, routineAfterForPastDate(date));
      continue;
    }

    if (futureIndex === null) {
      futureIndex = startIndexAfterLastWorkoutBefore(today);
    }

    const { index, routine } = nextRoutineFrom(futureIndex);
    routineByDate.set(date, routine);
    futureIndex = index + 1;
  }

  const hikingTarget = buildHikingTarget(metrics);
  const days = [];

  for (let index = 0; index < 7; index += 1) {
    const weekday = index + 1;
    const date = dates.addDays(weekStart, index);
    const weekdayInfo = coachConfig.WEEKDAY_BY_KEY.get(weekday);
    const base = {
      date,
      weekday,
      weekdayLabel: weekdayInfo?.label || '',
      weekdayShort: weekdayInfo?.short || '',
      isToday: date === today,
      isPast: date < today
    };

    if (trainingDays.includes(weekday)) {
      const routine = routineByDate.get(date);
      const { exercises, groups, warmup } = buildRoutineExercises({
        routine,
        groupByTemplate,
        nameByTemplate,
        strengthByTemplate,
        strengthByName,
        deload
      });
      const focusGroups = [...groups.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([group]) => coachConfig.MUSCLE_GROUP_BY_KEY.get(group)?.label || group);
      const legDay = isLegRoutine(routine, groupByTemplate);

      days.push({
        ...base,
        type: 'strength',
        title: routine.title,
        focus: focusGroups.join(' + ') || routine.title,
        warmup:
          warmup
            ? `${warmup}. Añade movilidad y 2 series de aproximación en el primer ejercicio.`
            : '5-10 min de bici o cinta suave + movilidad de cadera y hombro + 2 series de aproximación en el primer ejercicio.',
        exercises,
        note: deload
          ? 'Semana de descarga: 2 series por ejercicio y cargas suaves.'
          : legDay && avoidLegs
            ? 'La montaña ya ha cargado las piernas: recorta 2 series en los ejercicios de pierna o cambia esta sesión por un paseo.'
            : 'Termina con 2 repeticiones en reserva y progresa solo si completas todas las series con buena técnica.',
        routineId: routine.hevyId,
        routineTitle: routine.title
      });
      continue;
    }

    if (hikingDays.includes(weekday)) {
      days.push({
        ...base,
        type: 'hiking',
        title: 'Montaña',
        focus: `${hikingTarget.minutes} min · ${hikingTarget.elevation} m de desnivel`,
        note: hikingTarget.note
      });
      continue;
    }

    days.push({
      ...base,
      type: 'rest',
      title: 'Descanso activo',
      focus: 'Paseo 20-30 min + movilidad',
      note: 'Si vienes de una salida larga, prioriza dormir y caminar suave.'
    });
  }

  const scheduledTitles = days
    .filter((day) => day.type === 'strength')
    .map((day) => day.routineTitle);
  const routineUpdates = [];
  const updatesByRoutine = new Map();

  for (const day of days) {
    if (day.type !== 'strength') {
      continue;
    }

    const changedExercises = (day.exercises || []).filter((exercise) => exercise.changed);
    if (changedExercises.length === 0) {
      continue;
    }

    let entry = updatesByRoutine.get(day.routineId);
    if (!entry) {
      entry = { routineId: day.routineId, title: day.routineTitle, folderTitle, changes: [] };
      updatesByRoutine.set(day.routineId, entry);
      routineUpdates.push(entry);
    }

    for (const exercise of changedExercises) {
      for (const change of exercise.changes) {
        const key = `${exercise.routineExerciseIndex}:${change.field}`;
        if (entry.changes.some((item) => item.key === key)) {
          continue;
        }

        entry.changes.push({
          key,
          routineExerciseIndex: exercise.routineExerciseIndex,
          exerciseName: exercise.name,
          field: change.field,
          from: change.from,
          to: change.to
        });
      }
    }
  }

  const changeCount = routineUpdates.reduce(
    (total, update) => total + update.changes.length,
    0
  );
  const upcomingRoutine =
    [...routineByDate.entries()]
      .filter(([date]) => date >= today)
      .sort((a, b) => a[0].localeCompare(b[0]))[0]?.[1] || null;
  const notes = [];

  if (deload) {
    notes.push('El entrenador ha detectado señales de recuperación baja: esta semana toca descargar.');
  }

  notes.push(
    folderTitle
      ? `Plan basado en tus rutinas de Hevy de la carpeta «${folderTitle}»: ${scheduledTitles.join(', ')}.`
      : `Plan basado en tus rutinas de Hevy: ${scheduledTitles.join(', ')}.`
  );

  if (upcomingRoutine) {
    notes.push(
      `Próxima sesión pendiente: «${upcomingRoutine.title}»${
        metrics.training?.lastRoutineTitle
          ? `, después de «${metrics.training.lastRoutineTitle}»`
          : ''
      }. Si no completas el ciclo, la rotación no se reinicia: al volver retomas esa misma rutina.`
    );
  } else if (metrics.training?.lastRoutineTitle) {
    notes.push(
      `La rotación continúa después de «${metrics.training.lastRoutineTitle}», la última rutina registrada.`
    );
  }

  if (avoidLegs) {
    notes.push(
      'La montaña o las molestias aconsejan no acumular piernas: se priorizan las rutinas de tren superior.'
    );
  }

  if (trainingDays.length > planRoutines.length) {
    notes.push(
      'Hay más días de fuerza que rutinas disponibles: la rotación se repite. Sincroniza rutinas nuevas si quieres ampliarla.'
    );
  }

  notes.push(
    'Puedes cambiar los días en Perfil y objetivo. El plan es orientativo: si un día no puedes, mueve la sesión, no la acumules.'
  );
  notes.push(
    'Si cambias una rutina en Hevy, pulsa «Sincronizar rutinas» para actualizar el plan.'
  );

  return {
    source: 'hevy',
    routineFolderTitle: folderTitle,
    routineTitles: scheduledTitles,
    routineUpdates,
    changeCount,
    hasChanges: changeCount > 0,
    weekStart,
    weekEnd: dates.addDays(weekStart, 6),
    today,
    trainingDays,
    hikingDays,
    deload,
    days,
    strengthSessions: days.filter((day) => day.type === 'strength').length,
    hikingSessions: days.filter((day) => day.type === 'hiking').length,
    notes
  };
}

function buildWeek({
  profile,
  metrics,
  today = dates.today(),
  routines = [],
  routineFolders = [],
  exerciseCatalog = []
} = {}) {
  const routineWeek = buildRoutineWeek({
    profile,
    metrics,
    today,
    routines,
    routineFolders,
    exerciseCatalog
  });

  if (routineWeek) {
    return routineWeek;
  }

  const generated = buildGeneratedWeek({ profile, metrics, today });
  generated.notes.unshift(
    'No hay rutinas de Hevy sincronizadas: el plan usa ejercicios de tu historial. Sincroniza tus rutinas para que el plan siga tus días reales.'
  );
  return generated;
}

function buildGeneratedWeek({ profile, metrics, today = dates.today() } = {}) {
  const weekStart = dates.startOfWeek(today);
  const targetSessions = profile?.targetSessionsPerWeek || 3;
  const trainingDays = parseDays(profile?.trainingDays, defaultTrainingDays(targetSessions));
  const hikingDays = parseDays(
    profile?.hikingDays,
    (metrics.hiking?.sessionsPeriod || 0) > 0 || profile?.includesFatLoss ? [6] : []
  );
  const deload =
    (metrics.recovery?.negativeMarkers?.length || 0) >= 3 &&
    (metrics.strength?.declinedCount || 0) > 0;
  const usedGroups = new Set();
  const days = [];
  const hikingTarget = buildHikingTarget(metrics);
  let strengthIndex = 0;

  for (let index = 0; index < 7; index += 1) {
    const weekday = index + 1;
    const date = dates.addDays(weekStart, index);
    const weekdayInfo = coachConfig.WEEKDAY_BY_KEY.get(weekday);
    const base = {
      date,
      weekday,
      weekdayLabel: weekdayInfo?.label || '',
      weekdayShort: weekdayInfo?.short || '',
      isToday: date === today,
      isPast: date < today
    };

    if (trainingDays.includes(weekday)) {
      strengthIndex += 1;
      const focusGroups = getFocusGroups(metrics, {
        usedGroups,
        count: strengthIndex === 3 ? 3 : 2
      });
      for (const group of focusGroups) usedGroups.add(group.key);
      const exercises = pickExercises(metrics, focusGroups);
      const sets = deload ? '2' : '3';

      days.push({
        ...base,
        type: 'strength',
        title: `Fuerza ${strengthIndex}`,
        focus: focusGroups.map((group) => group.label).join(' + ') || 'Cuerpo completo',
        warmup:
          '5-10 min de bici o cinta suave + movilidad de cadera y hombro + 2 series de aproximación en el primer ejercicio.',
        exercises: exercises.map((exercise) => ({
          ...exercise,
          sets,
          reps: '8-12',
          note: 'Termina con 2 repeticiones en reserva.'
        })),
        note: deload
          ? 'Semana de descarga: mismo patrón, 2 series por ejercicio y cargas suaves.'
          : 'Progresa solo si completas todas las series con buena técnica.'
      });
      continue;
    }

    if (hikingDays.includes(weekday)) {
      days.push({
        ...base,
        type: 'hiking',
        title: 'Montaña',
        focus: `${hikingTarget.minutes} min · ${hikingTarget.elevation} m de desnivel`,
        note: hikingTarget.note
      });
      continue;
    }

    days.push({
      ...base,
      type: 'rest',
      title: 'Descanso activo',
      focus: 'Paseo 20-30 min + movilidad',
      note: 'Si vienes de una salida larga, prioriza dormir y caminar suave.'
    });
  }

  return {
    source: 'generated',
    routineFolderTitle: null,
    routineTitles: [],
    routineUpdates: [],
    changeCount: 0,
    hasChanges: false,
    weekStart,
    weekEnd: dates.addDays(weekStart, 6),
    today,
    trainingDays,
    hikingDays,
    deload,
    days,
    strengthSessions: days.filter((day) => day.type === 'strength').length,
    hikingSessions: days.filter((day) => day.type === 'hiking').length,
    notes: [
      deload
        ? 'El entrenador ha detectado señales de recuperación baja: esta semana toca descargar.'
        : 'La distribución prioriza los grupos con menos volumen y evita piernas si la montaña ya las ha cargado.',
      'Puedes cambiar los días en Perfil y objetivo. El plan es orientativo: si un día no puedes, mueve la sesión, no la acumules.'
    ]
  };
}

module.exports = {
  buildWeek,
  parseDays,
  defaultTrainingDays
};
