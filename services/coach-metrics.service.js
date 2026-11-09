'use strict';

const coachMetricsModel = require('../models/coach-metrics.model');
const checkinModel = require('../models/checkin.model');
const athleteProfileModel = require('../models/athlete-profile.model');
const exerciseModel = require('../models/exercise.model');
const hevyRoutineModel = require('../models/hevy-routine.model');
const hevyRoutineFolderModel = require('../models/hevy-routine-folder.model');
const coachConfig = require('../config/coach.config');
const coachPlanService = require('./coach-plan.service');
const dates = require('../utils/dates');
const format = require('../utils/format');

const DEFAULT_PERIOD_DAYS = 28;
const WEEKLY_WEEKS = 8;
const E1RM_MAX_REPS = 12;

function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (valid.length === 0) {
    return null;
  }

  return valid.reduce((total, value) => total + value, 0) / valid.length;
}

function percentChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return null;
  }

  return ((current - previous) / previous) * 100;
}

function isWorkingSet(set) {
  return String(set.set_type || 'normal').toLowerCase() !== 'warmup';
}

function parseSecondaryMuscles(value) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch (error) {
    return [];
  }
}

function parseStringArray(value) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch (error) {
    return [];
  }
}

function parseDayArray(value) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? [...new Set(parsed.map((day) => Number(day)))]
          .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
          .sort((a, b) => a - b)
      : [];
  } catch (error) {
    return [];
  }
}

function getGoal(profile) {
  return (
    coachConfig.GOAL_BY_KEY.get(profile?.primary_goal) ||
    coachConfig.GOAL_BY_KEY.get('sarcopenia_fat_loss')
  );
}

function detectBreaks(sessions, minGapDays = 14) {
  const uniqueDates = [...new Set(sessions.map((session) => session.date))].sort();
  const breaks = [];

  for (let index = 1; index < uniqueDates.length; index += 1) {
    const days = dates.daysBetween(uniqueDates[index - 1], uniqueDates[index]);

    if (days >= minGapDays) {
      breaks.push({
        startDate: uniqueDates[index - 1],
        endDate: uniqueDates[index],
        days
      });
    }
  }

  return breaks;
}

function buildProfileSummary(profile, today) {
  const goal = getGoal(profile);
  const currentYear = Number(today.slice(0, 4));
  const age =
    profile && Number.isInteger(profile.birth_year) && profile.birth_year > 1900
      ? currentYear - profile.birth_year
      : null;

  return {
    age,
    birthYear: profile?.birth_year ?? null,
    heightCm: profile?.height_cm ?? null,
    sex: profile?.sex ?? null,
    experience: profile?.experience ?? null,
    goalKey: goal.key,
    goalLabel: goal.label,
    goalShortLabel: goal.shortLabel,
    includesFatLoss: goal.includesFatLoss,
    targetWeightKg: profile?.target_weight_kg ?? null,
    targetWaistCm: profile?.target_waist_cm ?? null,
    targetBodyFatPct: profile?.target_body_fat_pct ?? null,
    targetSessionsPerWeek:
      profile?.target_sessions_per_week || goal.defaultSessionsPerWeek || 3,
    sessionMinutes: profile?.session_minutes ?? null,
    trainingDays: profile?.training_days ? parseDayArray(profile.training_days) : null,
    hikingDays: profile?.hiking_days ? parseDayArray(profile.hiking_days) : null,
    routineFolderId: Number.isInteger(profile?.routine_folder_id) ? profile.routine_folder_id : null,
    equipment: profile?.equipment ?? null,
    limitations: profile?.limitations ?? null,
    isComplete: Boolean(
      profile &&
        profile.birth_year &&
        profile.height_cm &&
        profile.target_sessions_per_week &&
        (goal.includesFatLoss ? profile.target_weight_kg : true)
    )
  };
}

function movingAverage(points, windowDays) {
  return points.map((point) => {
    const windowStart = dates.addDays(point.date, -(windowDays - 1));
    const windowValues = points
      .filter((candidate) => candidate.date >= windowStart && candidate.date <= point.date)
      .map((candidate) => candidate.value);

    return {
      date: point.date,
      value: round(average(windowValues) ?? point.value, 2)
    };
  });
}

// Pendiente de regresión lineal en % por semana sobre los valores del periodo.
function trendPercentPerWeek(points) {
  if (points.length < 4) {
    return null;
  }

  const baseDate = points[0].date;
  const xs = points.map((point) => dates.daysBetween(baseDate, point.date));
  const ys = points.map((point) => point.value);
  const meanX = average(xs);
  const meanY = average(ys);

  if (meanX === null || meanY === null || meanY === 0) {
    return null;
  }

  let numerator = 0;
  let denominator = 0;

  for (let index = 0; index < xs.length; index += 1) {
    numerator += (xs[index] - meanX) * (ys[index] - meanY);
    denominator += (xs[index] - meanX) ** 2;
  }

  if (denominator === 0) {
    return null;
  }

  const slopePerDay = numerator / denominator;
  return round((slopePerDay / meanY) * 7 * 100, 2);
}

function analyzeSeries(rows, { periodStart, today, chartDays = 120 } = {}) {
  const points = rows
    .filter((row) => Number.isFinite(row.value) && dates.isValidDateString(row.measurement_date))
    .map((row) => ({ date: row.measurement_date, value: row.value }));

  if (points.length === 0) {
    return {
      latest: null,
      latestDate: null,
      avg7: null,
      trendPctPerWeek: null,
      changePeriod: null,
      series: [],
      movingAverage: []
    };
  }

  const latest = points[points.length - 1];
  const periodPoints = points.filter((point) => point.date >= periodStart);
  const last7Points = points.filter((point) => point.date >= dates.addDays(today, -6));

  const referenceDate = dates.addDays(today, -Math.max(21, dates.daysBetween(periodStart, today)));
  const referencePoint = [...points].reverse().find((point) => point.date <= referenceDate) || null;

  const chartPoints = points.filter((point) => point.date >= dates.addDays(today, -(chartDays - 1)));

  return {
    latest: round(latest.value, 2),
    latestDate: latest.date,
    avg7: last7Points.length > 0 ? round(average(last7Points.map((point) => point.value)), 2) : null,
    trendPctPerWeek: trendPercentPerWeek(periodPoints),
    changePeriod: referencePoint ? round(latest.value - referencePoint.value, 2) : null,
    series: chartPoints,
    movingAverage: movingAverage(chartPoints, 7)
  };
}

function buildStrength(sets, { periodStart, previousStart, baselineStart, today }) {
  const exercises = new Map();

  for (const set of sets) {
    const weight = Number(set.weight_kg);
    const reps = Number(set.repetitions);

    if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(reps) || reps < 1) {
      continue;
    }
    if (reps > E1RM_MAX_REPS || !isWorkingSet(set)) {
      continue;
    }

    const e1rm = weight * (1 + reps / 30);
    let exercise = exercises.get(set.exercise_id);

    if (!exercise) {
      exercise = {
        id: set.exercise_id,
        name: set.exercise_name,
        muscleGroup: set.muscle_group,
        isUnilateral: Boolean(set.is_unilateral),
        sessions: new Map()
      };
      exercises.set(set.exercise_id, exercise);
    }

    let session = exercise.sessions.get(set.workout_id);
    if (!session) {
      session = { workoutId: set.workout_id, date: set.local_date, maxE1rm: 0, sets: 0 };
      exercise.sessions.set(set.workout_id, session);
    }

    session.maxE1rm = Math.max(session.maxE1rm, e1rm);
    session.sets += 1;
  }

  const summaries = [];
  const threshold = coachConfig.THRESHOLDS;

  for (const exercise of exercises.values()) {
    const sessionList = [...exercise.sessions.values()].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    const periodSessions = sessionList.filter((session) => session.date >= periodStart);

    if (periodSessions.length === 0) {
      continue;
    }

    const priorSessions = sessionList.filter((session) => session.date < periodStart);
    const effectiveBaselineStart =
      baselineStart && baselineStart > previousStart ? baselineStart : previousStart;
    const previousWindow = sessionList.filter(
      (session) => session.date >= effectiveBaselineStart && session.date < periodStart
    );
    const postBreakPrior = priorSessions.filter(
      (session) => session.date >= effectiveBaselineStart
    );
    const baselineSessions =
      previousWindow.length > 0
        ? previousWindow
        : postBreakPrior.length > 0
          ? [postBreakPrior[postBreakPrior.length - 1]]
          : [];

    const bestNow = Math.max(...periodSessions.map((session) => session.maxE1rm));
    const bestPrev =
      baselineSessions.length > 0
        ? Math.max(...baselineSessions.map((session) => session.maxE1rm))
        : null;
    const bestEverBefore =
      priorSessions.length > 0
        ? Math.max(...priorSessions.map((session) => session.maxE1rm))
        : null;
    const changePct =
      bestPrev && bestPrev > 0 ? percentChange(bestNow, bestPrev) : null;

    let stagnating = false;
    if (sessionList.length > threshold.stagnationSessions) {
      const recent = sessionList.slice(-threshold.stagnationSessions);
      const previous = sessionList.slice(0, -threshold.stagnationSessions);
      const recentBest = Math.max(...recent.map((session) => session.maxE1rm));
      const previousBest = Math.max(...previous.map((session) => session.maxE1rm));
      stagnating = recentBest <= previousBest * 1.005;
    }

    let status = 'new';
    if (changePct !== null) {
      if (changePct >= threshold.strengthChangePct.progress) {
        status = 'up';
      } else if (changePct <= threshold.strengthChangePct.declineWarn) {
        status = 'down';
      } else {
        status = 'flat';
      }
    }

    summaries.push({
      id: exercise.id,
      name: exercise.name,
      muscleGroup: coachConfig.resolveMuscleGroup(exercise.muscleGroup),
      isUnilateral: exercise.isUnilateral,
      maxE1rmLatest: round(bestNow, 1),
      maxE1rmPrevious: bestPrev ? round(bestPrev, 1) : null,
      changePct: changePct === null ? null : round(changePct, 1),
      status,
      stagnating,
      isPr: Boolean(bestEverBefore && bestNow > bestEverBefore * 1.005),
      sessionsPeriod: periodSessions.length,
      setsPeriod: periodSessions.reduce((total, session) => total + session.sets, 0),
      lastSessionDate: sessionList[sessionList.length - 1].date,
      daysSinceLastSession: dates.daysBetween(
        sessionList[sessionList.length - 1].date,
        today
      )
    });
  }

  summaries.sort(
    (a, b) => b.setsPeriod - a.setsPeriod || a.name.localeCompare(b.name, 'es')
  );

  const qualifiesForTrend = (exercise) =>
    exercise.sessionsPeriod >= 2 && exercise.setsPeriod >= 3;

  return {
    exercises: summaries,
    improvedCount: summaries.filter(
      (exercise) => qualifiesForTrend(exercise) && exercise.status === 'up'
    ).length,
    declinedCount: summaries.filter(
      (exercise) => qualifiesForTrend(exercise) && exercise.status === 'down'
    ).length,
    stagnatingCount: summaries.filter(
      (exercise) => qualifiesForTrend(exercise) && exercise.stagnating
    ).length,
    prCount: summaries.filter((exercise) => exercise.isPr).length
  };
}

function buildMuscles(sets, { periodStart, today, weekStarts }) {
  const weekSet = new Set(weekStarts);
  const totals = new Map();
  const lastTrained = new Map();
  const weekly = new Map(weekStarts.map((week) => [week, new Map()]));

  const addSets = (key, count) => {
    totals.set(key, (totals.get(key) || 0) + count);
  };

  const addWeekly = (week, key, count) => {
    const map = weekly.get(week);
    map.set(key, (map.get(key) || 0) + count);
  };

  for (const set of sets) {
    if (!isWorkingSet(set)) {
      continue;
    }

    const reps = Number(set.repetitions);
    if (!Number.isFinite(reps) || reps <= 0) {
      continue;
    }

    const primary = coachConfig.resolveMuscleGroup(set.muscle_group);
    const secondaries = parseSecondaryMuscles(set.secondary_muscle_groups)
      .map((group) => coachConfig.resolveMuscleGroup(group))
      .filter((group) => group && group !== primary);

    const contributions = [];
    if (primary) {
      contributions.push([primary, 1]);
    }
    for (const secondary of secondaries) {
      contributions.push([secondary, 0.5]);
    }

    for (const [key, count] of contributions) {
      if (set.local_date >= periodStart) {
        addSets(key, count);
      }

      const previousDate = lastTrained.get(key);
      if (!previousDate || set.local_date > previousDate) {
        lastTrained.set(key, set.local_date);
      }

      const week = dates.startOfWeek(set.local_date);
      if (weekSet.has(week)) {
        addWeekly(week, key, count);
      }
    }
  }

  const weeksInPeriod = Math.max(1, dates.daysBetween(periodStart, today) + 1) / 7;

  const perGroup = coachConfig.MUSCLE_GROUPS.map((group) => {
    const total = totals.get(group.key) || 0;
    const lastDate = lastTrained.get(group.key) || null;

    return {
      key: group.key,
      label: group.label,
      category: group.category,
      setsPeriod: round(total, 1),
      setsPerWeek: round(total / weeksInPeriod, 1),
      lastTrainedDate: lastDate,
      daysSince: lastDate ? dates.daysBetween(lastDate, today) : null
    };
  });

  const push = perGroup
    .filter((group) => group.category === 'push')
    .reduce((total, group) => total + group.setsPeriod, 0);
  const pull = perGroup
    .filter((group) => group.category === 'pull')
    .reduce((total, group) => total + group.setsPeriod, 0);
  const quads = perGroup.find((group) => group.key === 'quads')?.setsPeriod || 0;
  const hams = perGroup.find((group) => group.key === 'hams')?.setsPeriod || 0;

  const weeklySeries = weekStarts.map((week) => {
    const values = {};
    for (const group of coachConfig.MUSCLE_GROUPS) {
      values[group.key] = round(weekly.get(week).get(group.key) || 0, 1);
    }
    return { weekStart: week, values };
  });

  return {
    perGroup,
    weekly: weeklySeries,
    pushPull: {
      push: round(push, 1),
      pull: round(pull, 1),
      ratio: pull > 0 ? round(push / pull, 2) : null
    },
    quadsHams: {
      quads: round(quads, 1),
      hams: round(hams, 1),
      ratio: hams > 0 ? round(quads / hams, 2) : null
    }
  };
}

function buildNextSession(sets, muscles, { avoidLegs = false } = {}) {
  const candidates = new Map();

  for (const set of sets) {
    if (!isWorkingSet(set)) {
      continue;
    }

    const reps = Number(set.repetitions);
    if (!Number.isFinite(reps) || reps <= 0) {
      continue;
    }

    const group = coachConfig.resolveMuscleGroup(set.muscle_group);
    if (!group) {
      continue;
    }

    const current = candidates.get(set.exercise_id);
    if (!current || set.local_date > current.lastDate) {
      const weight = Number(set.weight_kg);
      candidates.set(set.exercise_id, {
        id: set.exercise_id,
        name: set.exercise_name,
        group,
        groupLabel: coachConfig.MUSCLE_GROUP_BY_KEY.get(group)?.label || group,
        lastDate: set.local_date,
        weight: Number.isFinite(weight) && weight > 0 ? round(weight, 1) : null,
        reps,
        isUnilateral: Boolean(set.is_unilateral)
      });
    }
  }

  const sortedGroups = [...muscles.perGroup].sort(
    (a, b) =>
      a.setsPerWeek - b.setsPerWeek ||
      (b.daysSince === null ? 999 : b.daysSince) - (a.daysSince === null ? 999 : a.daysSince)
  );
  const focusGroups = [];
  const exercises = [];
  const lowVolume = coachConfig.THRESHOLDS.setsPerMuscleWeek.low;

  for (const group of sortedGroups) {
    if (focusGroups.length >= 3) {
      break;
    }

    if (avoidLegs && ['quads', 'hams', 'glutes', 'calves'].includes(group.key)) {
      continue;
    }

    const isLow = group.setsPerWeek < lowVolume;
    const isStale = group.daysSince === null || group.daysSince > 10;
    if (!isLow && !isStale) {
      continue;
    }

    const exercise = [...candidates.values()]
      .filter((candidate) => candidate.group === group.key)
      .sort((a, b) => b.lastDate.localeCompare(a.lastDate))[0];

    if (!exercise) {
      continue;
    }

    focusGroups.push({
      key: group.key,
      label: group.label,
      setsPerWeek: group.setsPerWeek,
      daysSince: group.daysSince
    });
    exercises.push({
      ...exercise,
      sets: 3,
      reps: '8-12',
      load:
        exercise.weight === null
          ? 'peso corporal'
          : `${format.number(exercise.weight)} kg${exercise.isUnilateral ? ' por lado' : ''}`
    });
  }

  return { focusGroups, exercises };
}

function buildHiking(rows, { periodStart, today }) {
  const sessionsPeriod = rows.filter((row) => row.session_date >= periodStart);
  const last7 = rows.filter((row) => row.session_date >= dates.addDays(today, -6));
  const sum = (items, field) =>
    items.reduce((total, item) => total + (Number(item[field]) || 0), 0);
  const last = rows.length > 0 ? rows[rows.length - 1] : null;
  const minutesLast7 = sum(last7, 'duration_minutes');
  const elevationLast7 = sum(last7, 'elevation_gain_m');
  const bigHikeRecent =
    minutesLast7 >= 240 ||
    elevationLast7 >= 500 ||
    last7.some(
      (row) =>
        (Number(row.elevation_gain_m) || 0) >= 400 ||
        (Number(row.duration_minutes) || 0) >= 180
    );

  return {
    hasData: rows.length > 0,
    sessionsPeriod: sessionsPeriod.length,
    minutesPeriod: sum(sessionsPeriod, 'duration_minutes'),
    elevationPeriod: sum(sessionsPeriod, 'elevation_gain_m'),
    distancePeriod: round(sum(sessionsPeriod, 'distance_km'), 1),
    sessionsLast7: last7.length,
    minutesLast7,
    elevationLast7,
    lastSessionDate: last?.session_date ?? null,
    daysSince: last ? dates.daysBetween(last.session_date, today) : null,
    bigHikeRecent
  };
}

function buildRecovery(checkins, today) {
  const threshold = coachConfig.THRESHOLDS.recovery;
  const recent = checkins.filter(
    (checkin) => checkin.checkin_date >= dates.addDays(today, -13)
  );
  const latest = checkins.length > 0 ? checkins[checkins.length - 1] : null;

  const avg = (field) =>
    average(recent.map((checkin) => Number(checkin[field])).filter((value) => Number.isFinite(value)));

  const avgSleep = avg('sleep_score');
  const avgEnergy = avg('energy_score');
  const avgStress = avg('stress_score');
  const avgSoreness = avg('soreness_score');

  const zoneCounts = new Map();
  for (const checkin of recent) {
    const zones = parseStringArray(checkin.pain_zones).filter((key) =>
      coachConfig.PAIN_ZONE_BY_KEY.has(key)
    );

    for (const key of zones) {
      const zone = coachConfig.PAIN_ZONE_BY_KEY.get(key);
      const current = zoneCounts.get(key) || {
        key,
        label: zone.label,
        advice: zone.advice,
        count: 0,
        lastDate: null
      };
      current.count += 1;
      if (!current.lastDate || checkin.checkin_date > current.lastDate) {
        current.lastDate = checkin.checkin_date;
      }
      zoneCounts.set(key, current);
    }
  }

  const painZones = [...zoneCounts.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es')
  );
  const painNotes = recent
    .filter((checkin) => checkin.pain_notes && checkin.pain_notes.trim())
    .map((checkin) => ({
      date: checkin.checkin_date,
      text: checkin.pain_notes.trim()
    }));
  const negativeMarkers = [];
  if (avgSleep !== null && avgSleep <= threshold.lowScore + 0.5) {
    negativeMarkers.push({
      key: 'sleep',
      label: 'Sueño bajo',
      detail: `media de ${round(avgSleep, 1)}/5 en 14 días`
    });
  }
  if (avgEnergy !== null && avgEnergy <= threshold.lowScore + 0.5) {
    negativeMarkers.push({
      key: 'energy',
      label: 'Energía baja',
      detail: `media de ${round(avgEnergy, 1)}/5 en 14 días`
    });
  }
  if (avgStress !== null && avgStress >= threshold.highStress) {
    negativeMarkers.push({
      key: 'stress',
      label: 'Estrés alto',
      detail: `media de ${round(avgStress, 1)}/5 en 14 días`
    });
  }
  if (avgSoreness !== null && avgSoreness >= threshold.highSoreness) {
    negativeMarkers.push({
      key: 'soreness',
      label: 'Agujetas altas',
      detail: `media de ${round(avgSoreness, 1)}/5 en 14 días`
    });
  }
  if (painZones.length > 0 || painNotes.length > 0) {
    negativeMarkers.push({
      key: 'pain',
      label: 'Dolor o molestia',
      detail:
        painZones.length > 0
          ? `${painZones.length} zona(s) marcada(s) en los últimos 14 días`
          : 'hay notas de dolor en los últimos 14 días'
    });
  }

  return {
    latestCheckin: latest,
    daysSinceCheckin: latest ? dates.daysBetween(latest.checkin_date, today) : null,
    checkinCount14: recent.length,
    avgSleep: avgSleep === null ? null : round(avgSleep, 1),
    avgEnergy: avgEnergy === null ? null : round(avgEnergy, 1),
    avgStress: avgStress === null ? null : round(avgStress, 1),
    avgSoreness: avgSoreness === null ? null : round(avgSoreness, 1),
    painZones,
    painNotes: painNotes.slice(0, 3),
    negativeMarkers
  };
}

function build({ periodDays = DEFAULT_PERIOD_DAYS } = {}) {
  const today = dates.today();
  const periodStart = dates.addDays(today, -(periodDays - 1));
  const previousStart = dates.addDays(periodStart, -periodDays);
  const weekStarts = dates.eachWeekStart(today, WEEKLY_WEEKS);

  const profile = athleteProfileModel.get();
  const profileSummary = buildProfileSummary(profile, today);
  const workouts = coachMetricsModel.listWorkouts();
  const sets = coachMetricsModel.listSets();
  const weightRows = coachMetricsModel.listMeasurements('weight');
  const waistRows = coachMetricsModel.listMeasurements('waist');
  const bodyFatRows = coachMetricsModel.listMeasurements('body_fat');
  const hikingRows = coachMetricsModel.listHikingSessions();
  const checkins = checkinModel.listSince(dates.addDays(today, -120));
  const routines = hevyRoutineModel.listDetailed();
  const routineFolders = hevyRoutineFolderModel.list();
  const exerciseCatalog = exerciseModel.listCatalog();

  const sessions = workouts.map((workout) => ({
    id: workout.id,
    date: workout.local_date,
    durationSeconds: workout.duration_seconds
  }));
  const sessionsPeriod = sessions.filter((session) => session.date >= periodStart);
  const sessionsLast7 = sessions.filter((session) => session.date >= dates.addDays(today, -6));
  const lastSession = sessions.length > 0 ? sessions[sessions.length - 1] : null;
  const lastRoutineWorkout = [...workouts].reverse().find((workout) => workout.routine_id) || null;
  const breaks = detectBreaks(sessions);
  const lastBreak = breaks.length > 0 ? breaks[breaks.length - 1] : null;
  const daysSinceBreakEnd = lastBreak ? dates.daysBetween(lastBreak.endDate, today) : null;
  const isResuming = Boolean(lastBreak && daysSinceBreakEnd !== null && daysSinceBreakEnd <= 21);
  const baselineStart =
    lastBreak && lastBreak.endDate > previousStart ? lastBreak.endDate : previousStart;

  const countByWeek = new Map(weekStarts.map((week) => [week, 0]));
  for (const session of sessions) {
    const week = dates.startOfWeek(session.date);
    if (countByWeek.has(week)) {
      countByWeek.set(week, countByWeek.get(week) + 1);
    }
  }
  const weeklySessions = weekStarts.map((week) => ({
    weekStart: week,
    count: countByWeek.get(week)
  }));

  const targetSessions = profileSummary.targetSessionsPerWeek;
  let currentStreakWeeks = 0;
  for (let index = weeklySessions.length - 1; index >= 0; index -= 1) {
    if (weeklySessions[index].count >= targetSessions) {
      currentStreakWeeks += 1;
    } else {
      break;
    }
  }

  const volumeBetween = (from, to) =>
    sets
      .filter(
        (set) =>
          set.local_date >= from &&
          set.local_date <= to &&
          isWorkingSet(set) &&
          Number(set.weight_kg) > 0 &&
          Number(set.repetitions) > 0
      )
      .reduce(
        (total, set) =>
          total +
          Number(set.weight_kg) *
            Number(set.repetitions) *
            (set.is_unilateral ? 2 : 1),
        0
      );

  const volumeLast7 = volumeBetween(dates.addDays(today, -6), today);
  const volumePrevious7 = volumeBetween(dates.addDays(today, -13), dates.addDays(today, -7));
  const periodVolume = volumeBetween(periodStart, today);

  const muscles = buildMuscles(sets, { periodStart, today, weekStarts });
  const strength = buildStrength(sets, { periodStart, previousStart, baselineStart, today });
  const weight = analyzeSeries(weightRows, { periodStart, today });
  const waist = analyzeSeries(waistRows, { periodStart, today });
  const bodyFat = analyzeSeries(bodyFatRows, { periodStart, today });
  const recovery = buildRecovery(checkins, today);
  const hiking = buildHiking(hikingRows, { periodStart, today });
  const painAvoidsLegs = recovery.painZones.some((zone) =>
    ['knee', 'hip', 'ankle'].includes(zone.key)
  );
  const nextSession = buildNextSession(sets, muscles, {
    avoidLegs: hiking.bigHikeRecent || painAvoidsLegs
  });

  const warmupWorkouts = new Set(
    sets
      .filter(
        (set) =>
          set.local_date >= periodStart && String(set.set_type || '').toLowerCase() === 'warmup'
      )
      .map((set) => set.workout_id)
  );
  const warmupShare =
    sessionsPeriod.length > 0 ? warmupWorkouts.size / sessionsPeriod.length : null;

  const sessionsPerWeek = sessionsPeriod.length / (periodDays / 7);
  const periodWeeks = weeklySessions.slice(-Math.ceil(periodDays / 7));
  const activeWeeks = periodWeeks.filter((week) => week.count > 0).length;
  const sessionsPerWeekActive =
    activeWeeks > 0 ? sessionsPeriod.length / activeWeeks : 0;
  const effectiveSessionsPerWeek =
    isResuming && activeWeeks > 0 ? sessionsPerWeekActive : sessionsPerWeek;
  const last4Weeks = weeklySessions.slice(-4);

  const metrics = {
    generatedAt: new Date().toISOString(),
    periodDays,
    period: { start: periodStart, end: today },
    profile: profileSummary,
    training: {
      sessionsPeriod: sessionsPeriod.length,
      sessionsPerWeek: round(sessionsPerWeek, 1),
      sessionsPerWeekActive: round(sessionsPerWeekActive, 1),
      activeWeeks,
      breaks,
      lastBreak,
      isResuming,
      daysSinceBreakEnd,
      sessionsLast7: sessionsLast7.length,
      lastSessionDate: lastSession?.date ?? null,
      daysSinceLastSession: lastSession ? dates.daysBetween(lastSession.date, today) : null,
      lastRoutineId: lastRoutineWorkout?.routine_id ?? null,
      lastRoutineDate: lastRoutineWorkout?.local_date ?? null,
      lastRoutineTitle: lastRoutineWorkout?.title ?? null,
      routineHistory: workouts
        .filter((workout) => workout.routine_id)
        .map((workout) => ({
          date: workout.local_date,
          routineId: workout.routine_id,
          title: workout.title
        })),
      currentStreakWeeks,
      targetSessionsPerWeek: targetSessions,
      weekly: weeklySessions,
      completionPct: Math.min(
        100,
        Math.round((effectiveSessionsPerWeek / Math.max(1, targetSessions)) * 100)
      ),
      weeksMeetingTarget: last4Weeks.filter((week) => week.count >= targetSessions).length,
      warmupShare: warmupShare === null ? null : round(warmupShare * 100, 0)
    },
    volume: {
      last7: round(volumeLast7, 0),
      previous7: round(volumePrevious7, 0),
      changePct:
        volumePrevious7 > 0 ? round(percentChange(volumeLast7, volumePrevious7), 1) : null,
      periodTotal: round(periodVolume, 0)
    },
    muscles,
    strength,
    body: { weight, waist, bodyFat },
    recovery,
    hiking,
    nextSession,
    weeklyPlan: null
  };

  metrics.weeklyPlan = coachPlanService.buildWeek({
    profile: profileSummary,
    metrics,
    today,
    routines,
    routineFolders,
    exerciseCatalog
  });

  return metrics;
}

function getExerciseSeries(exerciseId) {
  const sets = coachMetricsModel
    .listSets()
    .filter(
      (set) =>
        set.exercise_id === exerciseId &&
        Number(set.weight_kg) > 0 &&
        Number(set.repetitions) >= 1 &&
        Number(set.repetitions) <= E1RM_MAX_REPS &&
        isWorkingSet(set)
    );

  const byWorkout = new Map();

  for (const set of sets) {
    const e1rm = Number(set.weight_kg) * (1 + Number(set.repetitions) / 30);
    let entry = byWorkout.get(set.workout_id);

    if (!entry) {
      entry = {
        workoutId: set.workout_id,
        date: set.local_date,
        maxE1rm: 0,
        maxWeight: 0,
        totalReps: 0
      };
      byWorkout.set(set.workout_id, entry);
    }

    entry.maxE1rm = Math.max(entry.maxE1rm, e1rm);
    entry.maxWeight = Math.max(entry.maxWeight, Number(set.weight_kg));
    entry.totalReps += Number(set.repetitions);
  }

  return {
    id: exerciseId,
    points: [...byWorkout.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((entry) => ({
        date: entry.date,
        e1rm: round(entry.maxE1rm, 1),
        maxWeight: round(entry.maxWeight, 2),
        totalReps: entry.totalReps
      }))
  };
}

function listWeightedExercises() {
  const map = new Map();

  for (const set of coachMetricsModel.listSets()) {
    if (!(Number(set.weight_kg) > 0) || !(Number(set.repetitions) > 0)) {
      continue;
    }

    const current = map.get(set.exercise_id);
    if (current) {
      current.sets += 1;
    } else {
      map.set(set.exercise_id, {
        id: set.exercise_id,
        name: set.exercise_name,
        sets: 1,
        isUnilateral: Boolean(set.is_unilateral)
      });
    }
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

module.exports = {
  build,
  getExerciseSeries,
  listWeightedExercises
};
