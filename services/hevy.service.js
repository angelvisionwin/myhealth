'use strict';

const settings = require('../config/settings');

const BASE_URL = 'https://api.hevyapp.com';
const REQUEST_TIMEOUT_MS = 20000;
const MAX_ATTEMPTS = 3;
const MAX_WORKOUT_PAGE_SIZE = 10;
const MAX_TEMPLATE_PAGE_SIZE = 100;
const MAX_FOLDER_PAGE_SIZE = 10;
const MAX_PAGES_SAFETY_LIMIT = 10000;

class HevyApiError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'HevyApiError';
    this.code = code;
    this.status = options.status ?? null;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.retryable = options.retryable ?? false;
  }
}

function ensureConfigured() {
  if (!settings.hevy.isConfigured) {
    throw new HevyApiError(
      'HEVY_NOT_CONFIGURED',
      'La API Key de Hevy no está configurada. Añade HEVY_API_KEY al fichero .env.'
    );
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseRetryAfter(response) {
  const value = response.headers.get('retry-after');
  if (!value) {
    return null;
  }

  const seconds = Number.parseInt(value, 10);
  if (Number.isInteger(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

function errorForStatus(status, retryAfterMs) {
  if (status === 401 || status === 403) {
    return new HevyApiError(
      'INVALID_API_KEY',
      'La API Key de Hevy no es válida o no tiene permisos para este recurso.',
      { status }
    );
  }

  if (status === 404) {
    return new HevyApiError('HEVY_NOT_FOUND', 'El recurso solicitado no existe en Hevy.', {
      status
    });
  }

  if (status === 429) {
    return new HevyApiError(
      'RATE_LIMITED',
      'Hevy ha limitado temporalmente las peticiones. Se reintentará la operación.',
      { status, retryAfterMs, retryable: true }
    );
  }

  if ([502, 503, 504].includes(status)) {
    return new HevyApiError(
      'HEVY_UNAVAILABLE',
      'Hevy no está disponible en este momento. Se reintentará la operación.',
      { status, retryable: true }
    );
  }

  return new HevyApiError('HEVY_HTTP_ERROR', `Hevy respondió con el código HTTP ${status}.`, {
    status
  });
}

async function requestJson(path, { method = 'GET', body = null } = {}) {
  ensureConfigured();

  let url;
  try {
    url = new URL(path, BASE_URL);
  } catch (error) {
    throw new HevyApiError('INVALID_REQUEST', 'La ruta solicitada a Hevy no es válida.', {
      cause: error
    });
  }

  const headers = {
    accept: 'application/json',
    'api-key': settings.hevy.apiKey,
    'user-agent': 'MyHealth/0.1 (local)'
  };

  if (body !== null && body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response;

    try {
      response = await fetch(url, {
        method,
        headers,
        body: body === null || body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch (error) {
      const isTimeout = error.name === 'TimeoutError' || error.name === 'AbortError';
      throw new HevyApiError(
        isTimeout ? 'HEVY_TIMEOUT' : 'HEVY_NETWORK_ERROR',
        isTimeout
          ? 'Hevy no respondió dentro del tiempo máximo de espera.'
          : 'No se pudo conectar con la API de Hevy. Comprueba la conexión a Internet.',
        { cause: error }
      );
    }

    if (!response.ok) {
      const retryAfterMs = parseRetryAfter(response);
      await response.text().catch(() => '');
      const error = errorForStatus(response.status, retryAfterMs);

      if (error.retryable && attempt < MAX_ATTEMPTS) {
        const delay = Math.min(retryAfterMs ?? 1000 * attempt, 10000);
        await sleep(delay);
        continue;
      }

      throw error;
    }

    const text = await response.text();
    let data;

    try {
      data = text ? JSON.parse(text) : null;
    } catch (error) {
      throw new HevyApiError('INVALID_RESPONSE', 'Hevy devolvió una respuesta que no es JSON.', {
        cause: error
      });
    }

    if (!data || typeof data !== 'object') {
      throw new HevyApiError('INVALID_RESPONSE', 'Hevy devolvió una respuesta vacía o inesperada.');
    }

    return data;
  }

  throw new HevyApiError('HEVY_HTTP_ERROR', 'No se pudo completar la petición a Hevy.');
}

async function fetchPage(path, collectionKey, page, pageSize, maxPageSize) {
  if (!Number.isInteger(page) || page < 1) {
    throw new RangeError('La página debe ser un entero mayor o igual que 1.');
  }

  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > maxPageSize) {
    throw new RangeError(`El tamaño de página debe estar entre 1 y ${maxPageSize}.`);
  }

  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize)
  });
  const data = await requestJson(`${path}?${query.toString()}`);

  if (
    !Number.isInteger(data.page) ||
    !Number.isInteger(data.page_count) ||
    !Array.isArray(data[collectionKey])
  ) {
    throw new HevyApiError(
      'INVALID_RESPONSE',
      `La respuesta paginada de Hevy no contiene "${collectionKey}", "page" o "page_count".`
    );
  }

  return {
    page: data.page,
    pageCount: data.page_count,
    items: data[collectionKey]
  };
}

async function fetchAllPages(path, collectionKey, pageSize, onPage) {
  let page = 1;
  let pagesFetched = 0;
  let itemsRead = 0;

  while (true) {
    const result = await fetchPage(path, collectionKey, page, pageSize, pageSize);
    pagesFetched += 1;
    itemsRead += result.items.length;

    if (typeof onPage === 'function') {
      await onPage(result);
    }

    if (result.items.length === 0 || result.page >= result.pageCount) {
      break;
    }

    page += 1;

    if (page > MAX_PAGES_SAFETY_LIMIT) {
      throw new HevyApiError(
        'PAGINATION_LIMIT',
        'La paginación de Hevy superó el límite de seguridad configurado.'
      );
    }
  }

  return { pagesFetched, itemsRead };
}

function fetchWorkoutsPage(page, pageSize = MAX_WORKOUT_PAGE_SIZE) {
  return fetchPage('/v1/workouts', 'workouts', page, pageSize, MAX_WORKOUT_PAGE_SIZE);
}

function fetchAllWorkouts(onPage) {
  return fetchAllPages('/v1/workouts', 'workouts', MAX_WORKOUT_PAGE_SIZE, onPage);
}

function fetchExerciseTemplatesPage(page, pageSize = MAX_TEMPLATE_PAGE_SIZE) {
  return fetchPage(
    '/v1/exercise_templates',
    'exercise_templates',
    page,
    pageSize,
    MAX_TEMPLATE_PAGE_SIZE
  );
}

async function fetchAllExerciseTemplates() {
  const templates = [];
  await fetchAllPages('/v1/exercise_templates', 'exercise_templates', MAX_TEMPLATE_PAGE_SIZE, (result) => {
    templates.push(...result.items);
  });
  return templates;
}

async function fetchAllRoutines() {
  const routines = [];
  await fetchAllPages('/v1/routines', 'routines', 10, (result) => {
    routines.push(...result.items);
  });
  return routines;
}

async function fetchAllRoutineFolders() {
  const folders = [];
  await fetchAllPages('/v1/routine_folders', 'routine_folders', MAX_FOLDER_PAGE_SIZE, (result) => {
    folders.push(...result.items);
  });
  return folders;
}

async function updateRoutine(routineId, routine) {
  if (typeof routineId !== 'string' || routineId.length === 0) {
    throw new HevyApiError('INVALID_REQUEST', 'La rutina no tiene un identificador válido.');
  }

  const data = await requestJson(`/v1/routines/${encodeURIComponent(routineId)}`, {
    method: 'PUT',
    body: { routine }
  });

  if (!data?.routine || typeof data.routine !== 'object') {
    throw new HevyApiError(
      'INVALID_RESPONSE',
      'Hevy no devolvió la rutina actualizada después de guardarla.'
    );
  }

  return data.routine;
}

async function getUserInfo() {
  return requestJson('/v1/user/info');
}

async function getWorkoutCount() {
  const data = await requestJson('/v1/workouts/count');
  if (!Number.isInteger(data.workout_count)) {
    throw new HevyApiError('INVALID_RESPONSE', 'Hevy no devolvió un contador de entrenamientos válido.');
  }
  return data.workout_count;
}

module.exports = {
  HevyApiError,
  fetchWorkoutsPage,
  fetchAllWorkouts,
  fetchExerciseTemplatesPage,
  fetchAllExerciseTemplates,
  fetchAllRoutines,
  fetchAllRoutineFolders,
  updateRoutine,
  getUserInfo,
  getWorkoutCount
};
