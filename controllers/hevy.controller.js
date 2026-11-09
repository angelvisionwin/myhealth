'use strict';

const settings = require('../config/settings');
const workoutModel = require('../models/workout.model');
const syncHistoryModel = require('../models/sync-history.model');
const syncService = require('../services/hevy-sync.service');
const createHttpError = require('../utils/http-error');
const { parseDateFilter, parsePositiveInteger, parseSearch } = require('../utils/query');

const PAGE_SIZE = 20;

const SYNC_RESULTS = {
  success: {
    type: 'success',
    title: 'Sincronización completada',
    message: 'Los entrenamientos de Hevy se han importado o actualizado correctamente.'
  },
  partial: {
    type: 'warning',
    title: 'Sincronización completada parcialmente',
    message:
      'Algunos entrenamientos no se pudieron guardar. Los datos ya importados se conservan; revisa el historial.'
  },
  error: {
    type: 'danger',
    title: 'La sincronización ha fallado',
    message:
      'No se pudo completar la operación. Los datos ya importados se conservan y puedes reintentarlo.'
  },
  'not-configured': {
    type: 'warning',
    title: 'API Key pendiente',
    message: 'Configura HEVY_API_KEY en el fichero .env y reinicia el servidor.'
  },
  'in-progress': {
    type: 'info',
    title: 'Sincronización en curso',
    message: 'Ya hay una sincronización con Hevy ejecutándose.'
  }
};

function listWorkouts(req, res, next) {
  try {
    const page = parsePositiveInteger(req.query.page);
    const from = parseDateFilter(req.query.from);
    const to = parseDateFilter(req.query.to);
    const search = parseSearch(req.query.search);
    const filterErrors = [];

    if (req.query.from && !from) {
      filterErrors.push('La fecha «desde» no es válida.');
    }
    if (req.query.to && !to) {
      filterErrors.push('La fecha «hasta» no es válida.');
    }
    if (from && to && from > to) {
      filterErrors.push('La fecha «desde» no puede ser posterior a la fecha «hasta».');
    }

    const filters = { from, to, search };
    const firstResult = workoutModel.list({
      ...filters,
      limit: PAGE_SIZE,
      offset: 0
    });
    const totalPages = Math.max(1, Math.ceil(firstResult.total / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const result =
      currentPage === 1
        ? firstResult
        : workoutModel.list({
            ...filters,
            limit: PAGE_SIZE,
            offset: (currentPage - 1) * PAGE_SIZE
          });

    const queryParams = new URLSearchParams();
    if (from) queryParams.set('from', from);
    if (to) queryParams.set('to', to);
    if (search) queryParams.set('search', search);
    const queryPrefix = queryParams.toString() ? `${queryParams.toString()}&` : '';

    res.renderPage('workouts/index', {
      activeNav: 'workouts',
      pageTitle: 'Histórico de entrenamientos',
      pageSubtitle: 'Sesiones guardadas en la base de datos local',
      breadcrumbs: [
        { label: 'Entrenamientos' },
        { label: 'Histórico' }
      ],
      workouts: result.rows,
      total: result.total,
      page: currentPage,
      totalPages,
      queryPrefix,
      filters,
      filterErrors
    });
  } catch (error) {
    next(error);
  }
}

function showWorkout(req, res, next) {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return next(createHttpError(404, 'Entrenamiento no encontrado'));
    }

    const workout = workoutModel.findById(id);
    if (!workout) {
      return next(createHttpError(404, 'Entrenamiento no encontrado'));
    }

    res.renderPage('workouts/show', {
      activeNav: 'workouts',
      pageTitle: workout.title || 'Detalle del entrenamiento',
      pageSubtitle: 'Sesión importada de Hevy',
      breadcrumbs: [
        { label: 'Entrenamientos', href: '/workouts' },
        { label: 'Detalle' }
      ],
      workout
    });
  } catch (error) {
    next(error);
  }
}

function getSyncPage(req, res, next) {
  try {
    const lastSync = syncHistoryModel.getLatest('hevy');
    const recentSyncs = syncHistoryModel.listRecent('hevy', 10);
    const syncCode = typeof req.query.sync === 'string' ? req.query.sync : '';
    const syncResult = Object.prototype.hasOwnProperty.call(SYNC_RESULTS, syncCode)
      ? SYNC_RESULTS[syncCode]
      : null;

    res.renderPage('workouts/sync', {
      activeNav: 'sync',
      pageTitle: 'Sincronizar Hevy',
      pageSubtitle: 'Importación manual de entrenamientos desde la API de Hevy',
      breadcrumbs: [
        { label: 'Entrenamientos', href: '/workouts' },
        { label: 'Sincronizar Hevy' }
      ],
      apiKeyConfigured: settings.hevy.isConfigured,
      lastSync,
      recentSyncs,
      syncResult
    });
  } catch (error) {
    next(error);
  }
}

async function syncWorkouts(req, res) {
  if (!settings.hevy.isConfigured) {
    return res.redirect('/workouts/sync?sync=not-configured');
  }

  try {
    const result = await syncService.syncAll();
    return res.redirect(`/workouts/sync?sync=${result.status}`);
  } catch (error) {
    if (error.code !== 'SYNC_IN_PROGRESS') {
      console.error(`[hevy] Error de sincronización: ${error.message}`);
      console.error(error);
    }

    const resultCode = error.code === 'SYNC_IN_PROGRESS' ? 'in-progress' : 'error';
    return res.redirect(`/workouts/sync?sync=${resultCode}`);
  }
}

module.exports = {
  listWorkouts,
  showWorkout,
  getSyncPage,
  syncWorkouts
};
