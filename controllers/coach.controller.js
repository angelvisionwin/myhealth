'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const settings = require('../config/settings');
const athleteProfileModel = require('../models/athlete-profile.model');
const checkinModel = require('../models/checkin.model');
const coachReportModel = require('../models/coach-report.model');
const exerciseModel = require('../models/exercise.model');
const hikingModel = require('../models/hiking.model');
const measurementModel = require('../models/measurement.model');
const progressPhotoModel = require('../models/progress-photo.model');
const hevyRoutineModel = require('../models/hevy-routine.model');
const hevyRoutineFolderModel = require('../models/hevy-routine-folder.model');
const syncHistoryModel = require('../models/sync-history.model');
const statsModel = require('../models/stats.model');

const coachMetricsService = require('../services/coach-metrics.service');
const coachReportService = require('../services/coach-report.service');
const coachLlmService = require('../services/coach-llm.service');
const hevyRoutinesService = require('../services/hevy-routines.service');

const coachConfig = require('../config/coach.config');
const format = require('../utils/format');
const exerciseNames = require('../utils/exercise-names');
const dates = require('../utils/dates');
const createHttpError = require('../utils/http-error');
const { parsePositiveInteger } = require('../utils/query');

const STATUS_MESSAGES = {
  'profile-saved': {
    type: 'success',
    title: 'Perfil actualizado',
    message: 'El entrenador usará estos datos en el próximo informe.'
  },
  'checkin-saved': {
    type: 'success',
    title: 'Check-in guardado',
    message: 'Ya forma parte del análisis de recuperación.'
  },
  'checkin-deleted': {
    type: 'info',
    title: 'Check-in eliminado',
    message: 'El registro se ha borrado. El peso asociado en Mis constantes se conserva.'
  },
  'report-created': {
    type: 'success',
    title: 'Informe generado',
    message: 'El análisis se ha guardado en el historial.'
  },
  'report-ai': {
    type: 'success',
    title: 'Informe redactado con IA',
    message: 'La versión redactada se ha añadido al informe.'
  },
  'exercises-saved': {
    type: 'success',
    title: 'Ejercicios actualizados',
    message: 'El motor usará la marca de carga por lado en los próximos análisis.'
  },
  'hiking-saved': {
    type: 'success',
    title: 'Salida guardada',
    message: 'El entrenador tendrá en cuenta la carga de montaña.'
  },
  'hiking-updated': {
    type: 'success',
    title: 'Salida actualizada',
    message: 'Los datos de montaña se han corregido.'
  },
  'hiking-deleted': {
    type: 'info',
    title: 'Salida eliminada',
    message: 'El registro se ha borrado.'
  },
  'photo-saved': {
    type: 'success',
    title: 'Foto guardada',
    message: 'La imagen se ha guardado en local y no se envía a ningún servicio externo.'
  },
  'photo-deleted': {
    type: 'info',
    title: 'Foto eliminada',
    message: 'La imagen se ha borrado del almacenamiento local.'
  },
  'routines-synced': {
    type: 'success',
    title: 'Rutinas sincronizadas',
    message: 'Las rutinas y carpetas de Hevy se han copiado en modo de solo lectura.'
  },
  'routines-updated': {
    type: 'success',
    title: 'Rutinas actualizadas en Hevy',
    message: 'Los cambios del plan se han aplicado y la copia local se ha refrescado.'
  },
  'routines-no-changes': {
    type: 'info',
    title: 'Sin cambios pendientes',
    message: 'El plan ya coincide con tus rutinas de Hevy.'
  }
};

function getStatusMessage(req) {
  const status = typeof req.query.status === 'string' ? req.query.status : '';

  if (status === 'routines-synced') {
    const removed = Number.parseInt(req.query.removed, 10) || 0;
    const foldersRemoved = Number.parseInt(req.query.foldersRemoved, 10) || 0;

    if (removed > 0 || foldersRemoved > 0) {
      const parts = [];
      if (removed > 0) {
        parts.push(`${removed} rutina${removed === 1 ? '' : 's'}`);
      }
      if (foldersRemoved > 0) {
        parts.push(`${foldersRemoved} carpeta${foldersRemoved === 1 ? '' : 's'}`);
      }

      return {
        type: 'success',
        title: 'Rutinas sincronizadas',
        message: `Se han eliminado ${parts.join(' y ')} que ya no estaban en Hevy.`
      };
    }
  }

  return STATUS_MESSAGES[status] || null;
}

function rawValue(body, key) {
  return typeof body?.[key] === 'string' ? body[key].trim() : '';
}

function toDisplay(value) {
  return value === null || value === undefined ? '' : String(value);
}

function parseOptionalNumber(raw, { min, max, label, errors }) {
  if (raw === '') {
    return null;
  }

  const number = Number(raw.replace(',', '.'));
  if (!Number.isFinite(number) || number < min || number > max) {
    errors.push(`${label} debe ser un número entre ${min} y ${max}.`);
    return null;
  }

  return number;
}

function parseOptionalInteger(raw, { min, max, label, errors }) {
  if (raw === '') {
    return null;
  }

  const number = Number.parseInt(raw, 10);
  if (!Number.isInteger(number) || number < min || number > max) {
    errors.push(`${label} debe ser un número entero entre ${min} y ${max}.`);
    return null;
  }

  return number;
}

function parseStoredDays(value) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
      : [];
  } catch (error) {
    return [];
  }
}

function parseDaySelection(raw, { label, errors }) {
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const days = [];

  for (const value of values) {
    const day = Number.parseInt(value, 10);
    if (!Number.isInteger(day) || day < 1 || day > 7) {
      errors.push(`${label} contiene un día no válido.`);
      return [];
    }
    days.push(day);
  }

  return [...new Set(days)].sort((a, b) => a - b);
}

function parseStoredZones(value) {
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

function profileToForm(profile) {
  return {
    birth_year: toDisplay(profile.birth_year),
    height_cm: toDisplay(profile.height_cm),
    sex: toDisplay(profile.sex),
    experience: toDisplay(profile.experience),
    primary_goal: toDisplay(profile.primary_goal) || 'sarcopenia_fat_loss',
    target_weight_kg: toDisplay(profile.target_weight_kg),
    target_waist_cm: toDisplay(profile.target_waist_cm),
    target_body_fat_pct: toDisplay(profile.target_body_fat_pct),
    target_sessions_per_week: toDisplay(profile.target_sessions_per_week),
    session_minutes: toDisplay(profile.session_minutes),
    training_days: parseStoredDays(profile.training_days),
    hiking_days: parseStoredDays(profile.hiking_days),
    routine_folder_id: toDisplay(profile.routine_folder_id),
    equipment: toDisplay(profile.equipment),
    limitations: toDisplay(profile.limitations),
    notes: toDisplay(profile.notes)
  };
}

function parseProfileForm(req) {
  const body = req.body || {};
  const form = {
    birth_year: rawValue(body, 'birth_year'),
    height_cm: rawValue(body, 'height_cm'),
    sex: rawValue(body, 'sex'),
    experience: rawValue(body, 'experience'),
    primary_goal: rawValue(body, 'primary_goal'),
    target_weight_kg: rawValue(body, 'target_weight_kg'),
    target_waist_cm: rawValue(body, 'target_waist_cm'),
    target_body_fat_pct: rawValue(body, 'target_body_fat_pct'),
    target_sessions_per_week: rawValue(body, 'target_sessions_per_week'),
    session_minutes: rawValue(body, 'session_minutes'),
    training_days: Array.isArray(body.training_days)
      ? body.training_days.map(String)
      : body.training_days
        ? [String(body.training_days)]
        : [],
    hiking_days: Array.isArray(body.hiking_days)
      ? body.hiking_days.map(String)
      : body.hiking_days
        ? [String(body.hiking_days)]
        : [],
    routine_folder_id: rawValue(body, 'routine_folder_id'),
    equipment: rawValue(body, 'equipment'),
    limitations: rawValue(body, 'limitations'),
    notes: rawValue(body, 'notes')
  };
  const errors = [];
  const currentYear = Number(dates.today().slice(0, 4));

  const birthYear = parseOptionalInteger(form.birth_year, {
    min: 1900,
    max: currentYear - 14,
    label: 'El año de nacimiento',
    errors
  });

  const goal = coachConfig.GOAL_BY_KEY.get(form.primary_goal);
  if (!goal) {
    errors.push('Selecciona un objetivo válido.');
  }

  const sexKeys = coachConfig.SEX_OPTIONS.map((option) => option.key);
  if (form.sex && !sexKeys.includes(form.sex)) {
    errors.push('La opción de sexo no es válida.');
  }

  const experienceKeys = coachConfig.EXPERIENCE_LEVELS.map((option) => option.key);
  if (form.experience && !experienceKeys.includes(form.experience)) {
    errors.push('El nivel de experiencia no es válido.');
  }

  const heightCm = parseOptionalNumber(form.height_cm, {
    min: 100,
    max: 250,
    label: 'La altura',
    errors
  });

  const targetWeightKg = parseOptionalNumber(form.target_weight_kg, {
    min: 30,
    max: 300,
    label: 'El peso objetivo',
    errors
  });

  const targetWaistCm = parseOptionalNumber(form.target_waist_cm, {
    min: 30,
    max: 250,
    label: 'La cintura objetivo',
    errors
  });

  const targetBodyFatPct = parseOptionalNumber(form.target_body_fat_pct, {
    min: 3,
    max: 60,
    label: 'El porcentaje de grasa objetivo',
    errors
  });

  const targetSessionsPerWeek =
    form.target_sessions_per_week === ''
      ? goal?.defaultSessionsPerWeek || null
      : parseOptionalInteger(form.target_sessions_per_week, {
          min: 1,
          max: 7,
          label: 'Las sesiones por semana',
          errors
        });

  const sessionMinutes = parseOptionalInteger(form.session_minutes, {
    min: 10,
    max: 240,
    label: 'La duración de sesión',
    errors
  });

  const trainingDays = parseDaySelection(form.training_days, {
    label: 'Los días de fuerza',
    errors
  });
  const hikingDays = parseDaySelection(form.hiking_days, {
    label: 'Los días de montaña',
    errors
  });

  const overlappingDays = trainingDays.filter((day) => hikingDays.includes(day));
  if (overlappingDays.length > 0) {
    errors.push(
      'Un mismo día no puede ser de fuerza y de montaña. Elige días distintos para cada actividad.'
    );
  }

  const routineFolderId =
    form.routine_folder_id === ''
      ? null
      : parseOptionalInteger(form.routine_folder_id, {
          min: 1,
          max: Number.MAX_SAFE_INTEGER,
          label: 'La carpeta de rutinas',
          errors
        });

  if (
    routineFolderId !== null &&
    !hevyRoutineFolderModel.list().some((folder) => folder.hevy_id === routineFolderId)
  ) {
    errors.push(
      'La carpeta de rutinas seleccionada ya no existe. Sincroniza las rutinas de Hevy y vuelve a elegirla.'
    );
  }

  if (form.equipment.length > 300) {
    errors.push('El equipamiento no puede superar los 300 caracteres.');
  }
  if (form.limitations.length > 1000) {
    errors.push('Las limitaciones no pueden superar los 1000 caracteres.');
  }
  if (form.notes.length > 1000) {
    errors.push('Las notas no pueden superar los 1000 caracteres.');
  }

  return {
    form,
    errors,
    values: {
      birthYear,
      heightCm,
      sex: form.sex || null,
      experience: form.experience || null,
      primaryGoal: goal?.key || 'sarcopenia_fat_loss',
      targetWeightKg,
      targetWaistCm,
      targetBodyFatPct,
      targetSessionsPerWeek,
      sessionMinutes,
      trainingDays: trainingDays.length > 0 ? JSON.stringify(trainingDays) : null,
      hikingDays: JSON.stringify(hikingDays),
      routineFolderId,
      equipment: form.equipment || null,
      limitations: form.limitations || null,
      notes: form.notes || null
    }
  };
}

function checkinToForm(checkin, date) {
  if (!checkin) {
    return {
      checkin_date: date,
      weight_kg: '',
      sleep_score: '',
      energy_score: '',
      stress_score: '',
      soreness_score: '',
      pain_zones: [],
      pain_notes: '',
      notes: ''
    };
  }

  return {
    checkin_date: checkin.checkin_date,
    weight_kg: toDisplay(checkin.weight_kg),
    sleep_score: toDisplay(checkin.sleep_score),
    energy_score: toDisplay(checkin.energy_score),
    stress_score: toDisplay(checkin.stress_score),
    soreness_score: toDisplay(checkin.soreness_score),
    pain_zones: parseStoredZones(checkin.pain_zones),
    pain_notes: toDisplay(checkin.pain_notes),
    notes: toDisplay(checkin.notes)
  };
}

function parseCheckinForm(req) {
  const body = req.body || {};
  const today = dates.today();
  const form = {
    checkin_date: rawValue(body, 'checkin_date'),
    weight_kg: rawValue(body, 'weight_kg'),
    sleep_score: rawValue(body, 'sleep_score'),
    energy_score: rawValue(body, 'energy_score'),
    stress_score: rawValue(body, 'stress_score'),
    soreness_score: rawValue(body, 'soreness_score'),
    pain_zones: Array.isArray(body.pain_zones)
      ? body.pain_zones.map(String)
      : body.pain_zones
        ? [String(body.pain_zones)]
        : [],
    pain_notes: rawValue(body, 'pain_notes'),
    notes: rawValue(body, 'notes')
  };
  const errors = [];

  if (!dates.isValidDateString(form.checkin_date)) {
    errors.push('La fecha del check-in no es válida.');
  } else if (form.checkin_date > today) {
    errors.push('El check-in no puede tener una fecha futura.');
  }

  const weightKg = parseOptionalNumber(form.weight_kg, {
    min: 20,
    max: 400,
    label: 'El peso',
    errors
  });

  const scores = {};
  for (const field of ['sleep_score', 'energy_score', 'stress_score', 'soreness_score']) {
    scores[field] = parseOptionalInteger(form[field], {
      min: 1,
      max: 5,
      label: 'Las puntuaciones',
      errors
    });
  }

  const painZoneKeys = new Set(coachConfig.PAIN_ZONES.map((zone) => zone.key));
  const painZones = [...new Set(form.pain_zones)].filter((key) => painZoneKeys.has(key));
  if (form.pain_zones.some((key) => !painZoneKeys.has(key))) {
    errors.push('Alguna zona de molestia no es válida.');
  }

  if (form.pain_notes.length > 1000) {
    errors.push('Las notas de dolor no pueden superar los 1000 caracteres.');
  }
  if (form.notes.length > 1000) {
    errors.push('Las notas no pueden superar los 1000 caracteres.');
  }

  return {
    form,
    errors,
    values: {
      checkinDate: form.checkin_date,
      weightKg,
      sleepScore: scores.sleep_score,
      energyScore: scores.energy_score,
      stressScore: scores.stress_score,
      sorenessScore: scores.soreness_score,
      painZones: painZones.length > 0 ? JSON.stringify(painZones) : null,
      painNotes: form.pain_notes || null,
      notes: form.notes || null
    }
  };
}

function syncWeightMeasurement(date, weightKg) {
  const existing = measurementModel.findByDateAndParameter('weight', date);

  if (existing) {
    measurementModel.updateValue(existing.id, weightKg);
    return;
  }

  measurementModel.create({
    measurementDate: date,
    parameter: 'weight',
    value: weightKg,
    unit: 'kg',
    notes: 'Registrado desde el check-in semanal'
  });
}

function getCoachIndex(req, res, next) {
  try {
    const profile = athleteProfileModel.get();
    const goal =
      coachConfig.GOAL_BY_KEY.get(profile?.primary_goal) ||
      coachConfig.GOALS.find((item) => item.key === 'sarcopenia_fat_loss');
    const currentYear = Number(dates.today().slice(0, 4));
    const age =
      profile?.birth_year && profile.birth_year > 1900 ? currentYear - profile.birth_year : null;
    const latestReport = coachReportModel.getLatest();
    const summary = latestReport ? coachReportService.parseSummary(latestReport) : null;
    const latestCheckin = checkinModel.getLatest();
    const daysSinceCheckin = latestCheckin
      ? dates.daysBetween(latestCheckin.checkin_date, dates.today())
      : null;
    const totalWorkouts = statsModel.getSummary().total_workout_count;
    const latestPainZones = latestCheckin
      ? parseStoredZones(latestCheckin.pain_zones)
          .map((key) => coachConfig.PAIN_ZONE_BY_KEY.get(key)?.label)
          .filter(Boolean)
      : [];

    res.renderPage('coach/index', {
      activeNav: 'coach',
      pageTitle: 'Entrenador',
      pageSubtitle: 'Revisión de progreso orientada a fuerza, músculo y grasa',
      breadcrumbs: [{ label: 'Entrenador' }],
      profile,
      goal,
      age,
      latestReport,
      summary,
      reportStale: latestReport ? coachReportService.isStale(latestReport) : false,
      latestCheckin,
      latestPainZones,
      daysSinceCheckin,
      totalWorkouts,
      llmConfigured: coachLlmService.isConfigured(),
      statusMessage: getStatusMessage(req)
    });
  } catch (error) {
    next(error);
  }
}

function getProfile(req, res, next) {
  try {
    const profile = athleteProfileModel.get();
    const currentYear = Number(dates.today().slice(0, 4));
    const age =
      profile?.birth_year && profile.birth_year > 1900 ? currentYear - profile.birth_year : null;

    res.renderPage('coach/profile', {
      activeNav: 'coach-profile',
      pageTitle: 'Perfil y objetivo',
      pageSubtitle: 'Los datos que el entrenador usa para interpretar tu progreso',
      breadcrumbs: [{ label: 'Entrenador', href: '/coach' }, { label: 'Perfil' }],
      form: profileToForm(profile || {}),
      profile,
      age,
      goals: coachConfig.GOALS,
      experienceLevels: coachConfig.EXPERIENCE_LEVELS,
      sexOptions: coachConfig.SEX_OPTIONS,
      weekdays: coachConfig.WEEKDAYS,
      routineFolders: hevyRoutineFolderModel.list(),
      errors: [],
      statusMessage: getStatusMessage(req)
    });
  } catch (error) {
    next(error);
  }
}

function postProfile(req, res, next) {
  try {
    const parsed = parseProfileForm(req);

    if (parsed.errors.length > 0) {
      return res.status(422).renderPage('coach/profile', {
        activeNav: 'coach-profile',
        pageTitle: 'Perfil y objetivo',
        pageSubtitle: 'Los datos que el entrenador usa para interpretar tu progreso',
        breadcrumbs: [{ label: 'Entrenador', href: '/coach' }, { label: 'Perfil' }],
        form: parsed.form,
        profile: athleteProfileModel.get(),
        age: null,
        goals: coachConfig.GOALS,
        experienceLevels: coachConfig.EXPERIENCE_LEVELS,
        sexOptions: coachConfig.SEX_OPTIONS,
        weekdays: coachConfig.WEEKDAYS,
        routineFolders: hevyRoutineFolderModel.list(),
        errors: parsed.errors,
        statusMessage: null
      });
    }

    athleteProfileModel.update(parsed.values);
    return res.redirect('/coach/profile?status=profile-saved');
  } catch (error) {
    return next(error);
  }
}

function getCheckin(req, res, next) {
  try {
    const requestedDate = dates.isValidDateString(req.query.date)
      ? req.query.date
      : dates.today();
    const existing = checkinModel.findByDate(requestedDate);

    res.renderPage('coach/checkin', {
      activeNav: 'coach-checkin',
      pageTitle: 'Check-in semanal',
      pageSubtitle: 'Sueño, energía, estrés y molestias: el contexto que Hevy no registra',
      breadcrumbs: [{ label: 'Entrenador', href: '/coach' }, { label: 'Check-in' }],
      form: checkinToForm(existing, requestedDate),
      isEdit: Boolean(existing),
      recent: checkinModel.list({ limit: 10 }),
      errors: [],
      statusMessage: getStatusMessage(req),
      today: dates.today(),
      painZoneOptions: coachConfig.PAIN_ZONES
    });
  } catch (error) {
    next(error);
  }
}

function postCheckin(req, res, next) {
  try {
    const parsed = parseCheckinForm(req);

    if (parsed.errors.length > 0) {
      return res.status(422).renderPage('coach/checkin', {
        activeNav: 'coach-checkin',
        pageTitle: 'Check-in semanal',
        pageSubtitle: 'Sueño, energía, estrés y molestias: el contexto que Hevy no registra',
        breadcrumbs: [{ label: 'Entrenador', href: '/coach' }, { label: 'Check-in' }],
        form: parsed.form,
        isEdit: Boolean(checkinModel.findByDate(parsed.form.checkin_date)),
        recent: checkinModel.list({ limit: 10 }),
        errors: parsed.errors,
        statusMessage: null,
        today: dates.today(),
        painZoneOptions: coachConfig.PAIN_ZONES
      });
    }

    checkinModel.upsert(parsed.values);

    if (parsed.values.weightKg !== null) {
      syncWeightMeasurement(parsed.values.checkinDate, parsed.values.weightKg);
    }

    return res.redirect('/coach/checkin?status=checkin-saved');
  } catch (error) {
    return next(error);
  }
}

function postDeleteCheckin(req, res, next) {
  try {
    const id = parsePositiveInteger(req.params.id, 0);
    const checkin = id ? checkinModel.findById(id) : null;

    if (!checkin) {
      return next(createHttpError(404, 'Check-in no encontrado'));
    }

    checkinModel.remove(id);
    return res.redirect('/coach/checkin?status=checkin-deleted');
  } catch (error) {
    return next(error);
  }
}

function getDeleteCheckin(req, res, next) {
  try {
    const id = parsePositiveInteger(req.params.id, 0);
    const checkin = id ? checkinModel.findById(id) : null;

    if (!checkin) {
      return next(createHttpError(404, 'Check-in no encontrado'));
    }

    res.renderPage('coach/checkin-delete', {
      activeNav: 'coach-checkin',
      pageTitle: 'Eliminar check-in',
      pageSubtitle: 'Confirma antes de borrar el registro',
      breadcrumbs: [
        { label: 'Entrenador', href: '/coach' },
        { label: 'Check-in', href: '/coach/checkin' },
        { label: 'Eliminar' }
      ],
      checkin
    });
  } catch (error) {
    next(error);
  }
}

const PHOTO_DIR = path.join(settings.projectRoot, 'data', 'photos');
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
const PHOTO_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

function isValidImageBuffer(buffer, mimeType) {
  if (mimeType === 'image/jpeg') {
    return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return (
      buffer.length > 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }
  if (mimeType === 'image/webp') {
    return (
      buffer.length > 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    );
  }
  return false;
}

function getPhotos(req, res, next) {
  try {
    res.renderPage('coach/photos', {
      activeNav: 'coach-photos',
      pageTitle: 'Fotos de progreso',
      pageSubtitle: 'Cambios que la báscula no cuenta',
      breadcrumbs: [{ label: 'Entrenador', href: '/coach' }, { label: 'Fotos' }],
      photos: progressPhotoModel.list({ limit: 60 }),
      today: dates.today(),
      statusMessage: getStatusMessage(req),
      pageScripts: ['/js/photos.js']
    });
  } catch (error) {
    next(error);
  }
}

function postPhoto(req, res, next) {
  try {
    const body = req.body || {};
    const errors = [];
    const photoDate = typeof body.photo_date === 'string' ? body.photo_date.trim() : '';
    const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
    const weightKg = parseOptionalNumber(
      typeof body.weight_kg === 'string' ? body.weight_kg.trim() : '',
      { min: 20, max: 400, label: 'El peso', errors }
    );

    if (!dates.isValidDateString(photoDate) || photoDate > dates.today()) {
      errors.push('La fecha de la foto no es válida o es futura.');
    }
    if (notes.length > 1000) {
      errors.push('Las notas no pueden superar los 1000 caracteres.');
    }

    const imageData = typeof body.imageData === 'string' ? body.imageData : '';
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(imageData);

    if (!match) {
      errors.push('La imagen no tiene un formato válido.');
    }

    let buffer = null;
    if (match) {
      buffer = Buffer.from(match[2], 'base64');
      if (buffer.length === 0 || buffer.length > MAX_PHOTO_BYTES) {
        errors.push('La imagen debe ocupar como máximo 6 MB.');
      } else if (!isValidImageBuffer(buffer, match[1])) {
        errors.push('El contenido de la imagen no coincide con su formato.');
      }
    }

    if (errors.length > 0) {
      return res.status(422).json({ ok: false, errors });
    }

    fs.mkdirSync(PHOTO_DIR, { recursive: true });
    const extension = PHOTO_EXTENSIONS[match[1]];
    const fileName = `${crypto.randomUUID()}.${extension}`;
    fs.writeFileSync(path.join(PHOTO_DIR, fileName), buffer);

    progressPhotoModel.create({
      photoDate,
      fileName,
      mimeType: match[1],
      sizeBytes: buffer.length,
      weightKg,
      notes: notes || null
    });

    return res.json({ ok: true, redirect: '/coach/photos?status=photo-saved' });
  } catch (error) {
    return next(error);
  }
}

function getPhotoFile(req, res, next) {
  try {
    const id = parsePositiveInteger(req.params.id, 0);
    const photo = id ? progressPhotoModel.findById(id) : null;

    if (!photo) {
      return next(createHttpError(404, 'Foto no encontrada'));
    }

    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.type(photo.mime_type);
    return res.sendFile(photo.file_name, { root: PHOTO_DIR }, (error) => {
      if (error) {
        next(error);
      }
    });
  } catch (error) {
    return next(error);
  }
}

function getDeletePhoto(req, res, next) {
  try {
    const id = parsePositiveInteger(req.params.id, 0);
    const photo = id ? progressPhotoModel.findById(id) : null;

    if (!photo) {
      return next(createHttpError(404, 'Foto no encontrada'));
    }

    res.renderPage('coach/photos-delete', {
      activeNav: 'coach-photos',
      pageTitle: 'Eliminar foto',
      pageSubtitle: 'Confirma antes de borrar la imagen',
      breadcrumbs: [
        { label: 'Entrenador', href: '/coach' },
        { label: 'Fotos', href: '/coach/photos' },
        { label: 'Eliminar' }
      ],
      photo
    });
  } catch (error) {
    next(error);
  }
}

function postDeletePhoto(req, res, next) {
  try {
    const id = parsePositiveInteger(req.params.id, 0);
    const photo = id ? progressPhotoModel.findById(id) : null;

    if (!photo) {
      return next(createHttpError(404, 'Foto no encontrada'));
    }

    try {
      fs.unlinkSync(path.join(PHOTO_DIR, photo.file_name));
    } catch (error) {
      // Si el fichero ya no existe, se elimina igualmente el registro.
    }

    progressPhotoModel.remove(id);
    return res.redirect('/coach/photos?status=photo-deleted');
  } catch (error) {
    return next(error);
  }
}

function getExerciseSettings(req, res, next) {
  try {
    res.renderPage('coach/exercises', {
      activeNav: 'coach-exercises',
      pageTitle: 'Ajustes de ejercicios',
      pageSubtitle: 'Indica qué ejercicios registran la carga de un solo lado',
      breadcrumbs: [{ label: 'Entrenador', href: '/coach' }, { label: 'Ejercicios' }],
      exercises: exerciseModel.listForSettings(),
      statusMessage: getStatusMessage(req),
      pageScripts: ['/js/exercise-settings.js']
    });
  } catch (error) {
    next(error);
  }
}

function postExerciseSettings(req, res, next) {
  try {
    const raw = req.body?.unilateral;
    const checked = new Set(
      (Array.isArray(raw) ? raw : raw ? [raw] : []).map((value) => String(value))
    );

    for (const exercise of exerciseModel.listForSettings()) {
      exerciseModel.setUnilateral(exercise.id, checked.has(String(exercise.id)));
    }

    return res.redirect('/coach/exercises?status=exercises-saved');
  } catch (error) {
    return next(error);
  }
}

function hikingSummary(rows) {
  return {
    sessions: rows.length,
    minutes: rows.reduce((total, row) => total + (row.duration_minutes || 0), 0),
    elevation: rows.reduce((total, row) => total + (row.elevation_gain_m || 0), 0)
  };
}

function hikingToForm(session) {
  return {
    session_date: session.session_date,
    duration_minutes: toDisplay(session.duration_minutes),
    elevation_gain_m: toDisplay(session.elevation_gain_m),
    distance_km: toDisplay(session.distance_km),
    effort_score: toDisplay(session.effort_score),
    notes: toDisplay(session.notes)
  };
}

function renderHikingPage(
  req,
  res,
  { status = 200, form, errors = [], isEdit = false, session = null, duplicate = null }
) {
  const today = dates.today();
  const recentPeriod = hikingModel.listSince(dates.addDays(today, -27));

  return res.status(status).renderPage('coach/hiking', {
    activeNav: 'coach-hiking',
    pageTitle: isEdit ? 'Editar salida' : 'Montaña',
    pageSubtitle: isEdit
      ? 'Corrige los datos de la salida'
      : 'Senderismo y montañismo: carga real que Hevy no registra',
    breadcrumbs: [
      { label: 'Entrenador', href: '/coach' },
      { label: 'Montaña', href: isEdit ? '/coach/hiking' : null },
      { label: isEdit ? 'Editar' : null }
    ].filter((item) => item.label),
    form,
    recent: hikingModel.list({ limit: 15 }),
    summary: hikingSummary(recentPeriod),
    errors,
    duplicate,
    isEdit,
    session,
    statusMessage: status === 200 ? getStatusMessage(req) : null,
    today,
    pageScripts: ['/js/hiking.js']
  });
}

function getHiking(req, res, next) {
  try {
    renderHikingPage(req, res, {
      form: {
        session_date: dates.today(),
        duration_minutes: '',
        elevation_gain_m: '',
        distance_km: '',
        effort_score: '',
        notes: ''
      }
    });
  } catch (error) {
    next(error);
  }
}

function getEditHiking(req, res, next) {
  try {
    const id = parsePositiveInteger(req.params.id, 0);
    const session = id ? hikingModel.findById(id) : null;

    if (!session) {
      return next(createHttpError(404, 'Salida no encontrada'));
    }

    return renderHikingPage(req, res, {
      form: hikingToForm(session),
      isEdit: true,
      session
    });
  } catch (error) {
    return next(error);
  }
}

function parseHikingForm(req) {
  const body = req.body || {};
  const form = {
    session_date: rawValue(body, 'session_date'),
    duration_minutes: rawValue(body, 'duration_minutes'),
    elevation_gain_m: rawValue(body, 'elevation_gain_m'),
    distance_km: rawValue(body, 'distance_km'),
    effort_score: rawValue(body, 'effort_score'),
    notes: rawValue(body, 'notes')
  };
  const errors = [];
  const today = dates.today();

  if (!dates.isValidDateString(form.session_date)) {
    errors.push('La fecha de la salida no es válida.');
  } else if (form.session_date > today) {
    errors.push('La salida no puede tener una fecha futura.');
  }

  const durationMinutes = parseOptionalInteger(form.duration_minutes, {
    min: 10,
    max: 1440,
    label: 'La duración',
    errors
  });
  const elevationGainM = parseOptionalInteger(form.elevation_gain_m, {
    min: 0,
    max: 5000,
    label: 'El desnivel',
    errors
  });
  const distanceKm = parseOptionalNumber(form.distance_km, {
    min: 0,
    max: 200,
    label: 'La distancia',
    errors
  });
  const effortScore = parseOptionalInteger(form.effort_score, {
    min: 1,
    max: 5,
    label: 'El esfuerzo',
    errors
  });

  if (form.notes.length > 1000) {
    errors.push('Las notas no pueden superar los 1000 caracteres.');
  }
  if (durationMinutes === null && elevationGainM === null && distanceKm === null) {
    errors.push('Indica al menos duración, desnivel o distancia.');
  }

  return {
    form,
    errors,
    values: {
      sessionDate: form.session_date,
      durationMinutes,
      elevationGainM,
      distanceKm,
      effortScore,
      notes: form.notes || null
    },
    force: rawValue(req.body, 'force') === '1'
  };
}

function postHiking(req, res, next) {
  try {
    const parsed = parseHikingForm(req);

    if (parsed.errors.length > 0) {
      return renderHikingPage(req, res, {
        status: 422,
        form: parsed.form,
        errors: parsed.errors
      });
    }

    const duplicate = hikingModel.findSimilar(parsed.values);
    if (duplicate && !parsed.force) {
      return renderHikingPage(req, res, {
        status: 409,
        form: parsed.form,
        duplicate
      });
    }

    hikingModel.create(parsed.values);
    return res.redirect('/coach/hiking?status=hiking-saved');
  } catch (error) {
    return next(error);
  }
}

function postEditHiking(req, res, next) {
  try {
    const id = parsePositiveInteger(req.params.id, 0);
    const session = id ? hikingModel.findById(id) : null;

    if (!session) {
      return next(createHttpError(404, 'Salida no encontrada'));
    }

    const parsed = parseHikingForm(req);

    if (parsed.errors.length > 0) {
      return renderHikingPage(req, res, {
        status: 422,
        form: parsed.form,
        errors: parsed.errors,
        isEdit: true,
        session
      });
    }

    const duplicate = hikingModel.findSimilar({ ...parsed.values, excludeId: id });
    if (duplicate && !parsed.force) {
      return renderHikingPage(req, res, {
        status: 409,
        form: parsed.form,
        duplicate,
        isEdit: true,
        session
      });
    }

    hikingModel.update(id, parsed.values);
    return res.redirect('/coach/hiking?status=hiking-updated');
  } catch (error) {
    return next(error);
  }
}

function getDeleteHiking(req, res, next) {
  try {
    const id = parsePositiveInteger(req.params.id, 0);
    const session = id ? hikingModel.findById(id) : null;

    if (!session) {
      return next(createHttpError(404, 'Salida no encontrada'));
    }

    res.renderPage('coach/hiking-delete', {
      activeNav: 'coach-hiking',
      pageTitle: 'Eliminar salida',
      pageSubtitle: 'Confirma antes de borrar el registro',
      breadcrumbs: [
        { label: 'Entrenador', href: '/coach' },
        { label: 'Montaña', href: '/coach/hiking' },
        { label: 'Eliminar' }
      ],
      session
    });
  } catch (error) {
    next(error);
  }
}

function postDeleteHiking(req, res, next) {
  try {
    const id = parsePositiveInteger(req.params.id, 0);
    const session = id ? hikingModel.findById(id) : null;

    if (!session) {
      return next(createHttpError(404, 'Salida no encontrada'));
    }

    hikingModel.remove(id);
    return res.redirect('/coach/hiking?status=hiking-deleted');
  } catch (error) {
    next(error);
  }
}

function getRoutine(req, res, next) {
  try {
    const routine = hevyRoutineModel.findDetailedByHevyId(req.params.id);

    if (!routine) {
      return next(createHttpError(404, 'Rutina no encontrada'));
    }

    const folder =
      hevyRoutineFolderModel.list().find((item) => item.hevy_id === routine.folderId) || null;
    const groupByTemplate = new Map();
    const catalogByTemplate = new Map();
    const catalog = exerciseModel.listCatalog();
    const nameByTemplate = exerciseNames.buildNameMap(catalog);

    for (const item of catalog) {
      if (item.hevy_exercise_id) {
        catalogByTemplate.set(item.hevy_exercise_id, item);
      }

      const group = coachConfig.resolveMuscleGroup(item.muscle_group);
      if (item.hevy_exercise_id && group) {
        groupByTemplate.set(item.hevy_exercise_id, group);
      }
    }

    const exercises = routine.exercises.map((exercise) => {
      const group = groupByTemplate.get(exercise.templateId) || null;
      const catalogItem = catalogByTemplate.get(exercise.templateId) || null;
      const workingSets = exercise.sets.filter(
        (set) => String(set.type || 'normal').toLowerCase() !== 'warmup'
      );

      return {
        ...exercise,
        displayName: exerciseNames.resolveExerciseName(exercise, nameByTemplate),
        group,
        groupLabel: group ? coachConfig.MUSCLE_GROUP_BY_KEY.get(group)?.label || group : null,
        isUnilateral: Boolean(catalogItem?.is_unilateral),
        workingSetCount: workingSets.length,
        warmupSetCount: exercise.sets.length - workingSets.length,
        sets: exercise.sets.map((set, index) => ({ ...set, index: index + 1 }))
      };
    });
    const totalSets = exercises.reduce((total, exercise) => total + exercise.sets.length, 0);

    return res.renderPage('coach/routine', {
      activeNav: 'coach-routines',
      pageTitle: routine.title,
      pageSubtitle: 'Contenido de la rutina sincronizada desde Hevy',
      breadcrumbs: [
        { label: 'Entrenador', href: '/coach' },
        { label: 'Rutinas', href: '/coach/routines' },
        { label: routine.title }
      ],
      routine,
      folder,
      exercises,
      totalSets,
      hevyConfigured: settings.hevy.isConfigured,
      statusMessage: getStatusMessage(req)
    });
  } catch (error) {
    next(error);
  }
}

function getRoutines(req, res, next) {
  try {
    res.renderPage('coach/routines', {
      activeNav: 'coach-routines',
      pageTitle: 'Rutinas de Hevy',
      pageSubtitle: 'Copia de solo lectura de tus rutinas',
      breadcrumbs: [{ label: 'Entrenador', href: '/coach' }, { label: 'Rutinas' }],
      routines: hevyRoutineModel.list(),
      routineFolders: hevyRoutineFolderModel.list(),
      latestSync: syncHistoryModel.getLatest('hevy-routines'),
      hevyConfigured: settings.hevy.isConfigured,
      statusMessage: getStatusMessage(req),
      error: typeof req.query.error === 'string' ? req.query.error.slice(0, 300) : null
    });
  } catch (error) {
    next(error);
  }
}

async function postSyncRoutines(req, res, next) {
  try {
    const result = await hevyRoutinesService.syncRoutines();
    const query = new URLSearchParams({ status: 'routines-synced' });

    if (result.itemsRemoved > 0) {
      query.set('removed', String(result.itemsRemoved));
    }
    if (result.foldersRemoved > 0) {
      query.set('foldersRemoved', String(result.foldersRemoved));
    }

    return res.redirect(`/coach/routines?${query.toString()}`);
  } catch (error) {
    if (error.code) {
      return res.redirect(`/coach/routines?error=${encodeURIComponent(error.message)}`);
    }
    return next(error);
  }
}

function getPlan(req, res, next) {
  try {
    const metrics = coachMetricsService.build();

    res.renderPage('coach/plan', {
      activeNav: 'coach-plan',
      pageTitle: 'Plan semanal',
      pageSubtitle: 'Fuerza, montaña y descanso organizados para esta semana',
      breadcrumbs: [{ label: 'Entrenador', href: '/coach' }, { label: 'Plan semanal' }],
      metrics,
      weeklyPlan: metrics.weeklyPlan,
      statusMessage: getStatusMessage(req)
    });
  } catch (error) {
    next(error);
  }
}

function getPlanRoutineUpdates(req, res, next) {
  try {
    const metrics = coachMetricsService.build();

    res.renderPage('coach/plan-routines', {
      activeNav: 'coach-plan',
      pageTitle: 'Actualizar rutinas en Hevy',
      pageSubtitle: 'Revisa los cambios que el plan propone en tus rutinas',
      breadcrumbs: [
        { label: 'Entrenador', href: '/coach' },
        { label: 'Plan semanal', href: '/coach/plan' },
        { label: 'Actualizar rutinas' }
      ],
      weeklyPlan: metrics.weeklyPlan,
      hevyConfigured: settings.hevy.isConfigured,
      statusMessage: getStatusMessage(req),
      error: typeof req.query.error === 'string' ? req.query.error.slice(0, 300) : null
    });
  } catch (error) {
    next(error);
  }
}

async function postApplyPlanRoutineUpdates(req, res, next) {
  try {
    if (!settings.hevy.isConfigured) {
      return res.redirect(
        `/coach/plan/routines?error=${encodeURIComponent(
          'La API Key de Hevy no está configurada. Añádela en .env y reinicia el servidor.'
        )}`
      );
    }

    // Refrescar antes de escribir evita pisar una rutina que haya cambiado en Hevy.
    await hevyRoutinesService.syncRoutines();
    const metrics = coachMetricsService.build();
    const routineUpdates = metrics.weeklyPlan.routineUpdates || [];

    if (routineUpdates.length === 0) {
      return res.redirect('/coach/plan?status=routines-no-changes');
    }

    const result = await hevyRoutinesService.applyPlanChanges({ routineUpdates });

    if (result.failed.length > 0) {
      const message = `${result.updated} rutina(s) actualizadas; ${result.failed.length} con error: ${result.failed
        .map((failure) => `${failure.title}: ${failure.message}`)
        .join(' | ')}`;
      return res.redirect(
        `/coach/plan/routines?error=${encodeURIComponent(message.slice(0, 300))}`
      );
    }

    return res.redirect('/coach/plan?status=routines-updated');
  } catch (error) {
    if (error.code) {
      return res.redirect(
        `/coach/plan/routines?error=${encodeURIComponent(error.message.slice(0, 300))}`
      );
    }

    return next(error);
  }
}

function getProgress(req, res, next) {
  try {
    const periodDays = [28, 56, 84].includes(Number(req.query.period))
      ? Number(req.query.period)
      : 28;
    const metrics = coachMetricsService.build({ periodDays });
    const exercises = coachMetricsService.listWeightedExercises();

    let selectedId = parsePositiveInteger(req.query.exerciseId, 0);
    if (!exercises.some((exercise) => exercise.id === selectedId)) {
      selectedId = exercises[0]?.id || 0;
    }
    const selected = exercises.find((exercise) => exercise.id === selectedId) || null;
    const series = selectedId
      ? coachMetricsService.getExerciseSeries(selectedId)
      : { id: 0, points: [] };

    const weightChart =
      metrics.body.weight.series.length > 0
        ? {
            labels: metrics.body.weight.series.map((point) => format.date(point.date)),
            values: metrics.body.weight.series.map((point) => point.value),
            movingAverage: metrics.body.weight.movingAverage.map((point) => point.value)
          }
        : null;

    const muscleChart = {
      labels: metrics.muscles.weekly.map((week) => format.date(week.weekStart)),
      groups: coachConfig.MUSCLE_GROUPS.map((group) => ({
        key: group.key,
        label: group.label,
        values: metrics.muscles.weekly.map((week) => week.values[group.key] || 0)
      }))
    };

    const exerciseChart =
      series.points.length > 0
        ? {
            labels: series.points.map((point) => format.date(point.date)),
            values: series.points.map((point) => point.e1rm),
            name: selected
              ? `${selected.name}${selected.isUnilateral ? ' (por lado)' : ''}`
              : ''
          }
        : null;

    const chartsJson = JSON.stringify({
      weight: weightChart,
      muscles: muscleChart,
      exercise: exerciseChart
    }).replace(/</g, '\\u003c');

    res.renderPage('coach/progress', {
      activeNav: 'coach-progress',
      pageTitle: 'Progreso',
      pageSubtitle: 'Datos que alimentan al entrenador',
      breadcrumbs: [{ label: 'Entrenador', href: '/coach' }, { label: 'Progreso' }],
      metrics,
      exercises,
      selected,
      selectedId,
      periodDays,
      periodOptions: [
        { days: 28, label: '4 semanas' },
        { days: 56, label: '8 semanas' },
        { days: 84, label: '12 semanas' }
      ],
      muscleGroups: coachConfig.MUSCLE_GROUPS,
      chartsJson,
      hasExerciseSeries: series.points.length > 0,
      pageScripts: ['/vendor/chartjs/chart.umd.min.js', '/js/coach.js']
    });
  } catch (error) {
    next(error);
  }
}

function postGenerateReport(req, res, next) {
  try {
    const result = coachReportService.generate({ periodDays: 28 });
    return res.redirect(`/coach/reports/${result.id}?status=report-created`);
  } catch (error) {
    return next(error);
  }
}

function getReport(req, res, next) {
  try {
    const id = parsePositiveInteger(req.params.id, 0);
    const report = id ? coachReportModel.findById(id) : null;

    if (!report) {
      return next(createHttpError(404, 'Informe no encontrado'));
    }

    const summary = coachReportService.parseSummary(report);
    const aiError =
      typeof req.query.aiError === 'string' ? req.query.aiError.slice(0, 300) : null;

    res.renderPage('coach/report', {
      activeNav: 'coach-report',
      pageTitle: 'Informe del entrenador',
      pageSubtitle: `Periodo ${format.date(report.period_start)} – ${format.date(report.period_end)}`,
      breadcrumbs: [
        { label: 'Entrenador', href: '/coach' },
        { label: 'Historial', href: '/coach/history' },
        { label: `Informe #${report.id}` }
      ],
      report,
      summary,
      aiError,
      llmConfigured: coachLlmService.isConfigured(),
      statusMessage: getStatusMessage(req)
    });
  } catch (error) {
    next(error);
  }
}

function getHistory(req, res, next) {
  try {
    res.renderPage('coach/history', {
      activeNav: 'coach-history',
      pageTitle: 'Historial de informes',
      pageSubtitle: 'Revisiones guardadas del entrenador',
      breadcrumbs: [{ label: 'Entrenador', href: '/coach' }, { label: 'Historial' }],
      reports: coachReportModel.list(30)
    });
  } catch (error) {
    next(error);
  }
}

async function postReportAi(req, res, next) {
  const id = parsePositiveInteger(req.params.id, 0);

  try {
    const report = id ? coachReportModel.findById(id) : null;

    if (!report) {
      return next(createHttpError(404, 'Informe no encontrado'));
    }

    const summary = coachReportService.parseSummary(report);
    if (!summary) {
      return next(createHttpError(500, 'El informe guardado no se puede interpretar.'));
    }

    if (!coachLlmService.isConfigured()) {
      return res.redirect(
        `/coach/reports/${id}?aiError=${encodeURIComponent(
          'La redacción con IA no está configurada en .env.'
        )}`
      );
    }

    const result = await coachLlmService.writeReport({ summary });
    coachReportModel.updateAi(id, result);

    return res.redirect(`/coach/reports/${id}?status=report-ai`);
  } catch (error) {
    if (error.code && String(error.code).startsWith('COACH_LLM')) {
      return res.redirect(
        `/coach/reports/${id}?aiError=${encodeURIComponent(error.message)}`
      );
    }

    return next(error);
  }
}

module.exports = {
  getCoachIndex,
  getProfile,
  postProfile,
  getCheckin,
  postCheckin,
  getDeleteCheckin,
  postDeleteCheckin,
  getExerciseSettings,
  postExerciseSettings,
  getHiking,
  postHiking,
  getEditHiking,
  postEditHiking,
  getDeleteHiking,
  postDeleteHiking,
  getPhotos,
  postPhoto,
  getPhotoFile,
  getDeletePhoto,
  postDeletePhoto,
  getRoutine,
  getRoutines,
  postSyncRoutines,
  getProgress,
  getPlan,
  getPlanRoutineUpdates,
  postApplyPlanRoutineUpdates,
  postGenerateReport,
  getReport,
  getHistory,
  postReportAi
};
