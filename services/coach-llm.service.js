'use strict';

const settings = require('../config/settings');

const REQUEST_TIMEOUT_MS = 60000;
const MAX_REPORT_LENGTH = 12000;

function createLlmError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function buildCompactPayload(summary) {
  const { metrics } = summary;

  return {
    profile: {
      age: metrics.profile.age,
      heightCm: metrics.profile.heightCm,
      sex: metrics.profile.sex,
      experience: metrics.profile.experience,
      goal: metrics.profile.goalLabel,
      targetWeightKg: metrics.profile.targetWeightKg,
      targetWaistCm: metrics.profile.targetWaistCm,
      targetSessionsPerWeek: metrics.profile.targetSessionsPerWeek,
      limitations: metrics.profile.limitations,
      equipment: metrics.profile.equipment
    },
    period: metrics.period,
    training: {
      sessions: metrics.training.sessionsPeriod,
      sessionsPerWeek: metrics.training.sessionsPerWeek,
      targetSessionsPerWeek: metrics.training.targetSessionsPerWeek,
      lastSessionDate: metrics.training.lastSessionDate,
      daysSinceLastSession: metrics.training.daysSinceLastSession,
      completionPct: metrics.training.completionPct,
      warmupShare: metrics.training.warmupShare
    },
    volume: metrics.volume,
    hiking: metrics.hiking,
    weeklyPlan: metrics.weeklyPlan,
    muscles: metrics.muscles.perGroup,
    balance: {
      pushPull: metrics.muscles.pushPull,
      quadsHams: metrics.muscles.quadsHams
    },
    strength: {
      improvedCount: metrics.strength.improvedCount,
      declinedCount: metrics.strength.declinedCount,
      stagnatingCount: metrics.strength.stagnatingCount,
      prCount: metrics.strength.prCount,
      exercises: metrics.strength.exercises.slice(0, 12)
    },
    body: {
      weight: {
        latest: metrics.body.weight.latest,
        latestDate: metrics.body.weight.latestDate,
        trendPctPerWeek: metrics.body.weight.trendPctPerWeek,
        changePeriod: metrics.body.weight.changePeriod
      },
      waist: {
        latest: metrics.body.waist.latest,
        latestDate: metrics.body.waist.latestDate,
        changePeriod: metrics.body.waist.changePeriod
      },
      bodyFat: {
        latest: metrics.body.bodyFat.latest,
        changePeriod: metrics.body.bodyFat.changePeriod
      }
    },
    recovery: {
      daysSinceCheckin: metrics.recovery.daysSinceCheckin,
      avgSleep: metrics.recovery.avgSleep,
      avgEnergy: metrics.recovery.avgEnergy,
      avgStress: metrics.recovery.avgStress,
      avgSoreness: metrics.recovery.avgSoreness,
      painZones: metrics.recovery.painZones || [],
      negativeMarkers: metrics.recovery.negativeMarkers
    },
    findings: summary.findings,
    plan: summary.plan,
    nextSession: metrics.nextSession
  };
}

const SYSTEM_PROMPT = [
  'Eres un entrenador de fuerza y acondicionamiento físico que asesora a una persona adulta.',
  'Su objetivo actual, edad y contexto aparecen en el JSON del informe.',
  'Redactas informes claros, accionables y basados solo en los datos disponibles.',
  '',
  'Reglas obligatorias:',
  '- Usa exclusivamente los datos del informe. No inventes cifras, ejercicios ni mediciones.',
  '- No des diagnósticos médicos ni recetes fármacos, suplementos o dietas extremas.',
  '- No prometas resultados ni plazos garantizados.',
  '- Si hay dolor, lesión o un dato preocupante, recomienda consultar a un profesional sanitario.',
  '- Tono cercano, directo y respetuoso, sin paternalismo. Español de España.',
  '- Entre 350 y 500 palabras.',
  '',
  'Estructura exacta:',
  '1. Resumen (2-3 frases).',
  '2. Lo que va bien (2-4 puntos).',
  '3. A vigilar (2-4 puntos).',
  '4. Plan de la semana (3-5 acciones concretas, con series, repeticiones o cargas cuando los datos lo permitan).',
  '5. Nota de seguridad (1-2 frases).'
].join('\n');

async function writeReport({ summary }) {
  const config = settings.coach.llm;

  if (!config.isConfigured) {
    throw createLlmError(
      'COACH_LLM_NOT_CONFIGURED',
      'La redacción con IA no está configurada. Define COACH_LLM_ENABLED, COACH_LLM_API_KEY y COACH_LLM_MODEL.'
    );
  }

  const payload = buildCompactPayload(summary);
  const userPrompt = [
    'Redacta el informe semanal del entrenador a partir de este JSON.',
    'No repitas el JSON literalmente: interpreta los datos y prioriza lo importante.',
    '',
    JSON.stringify(payload, null, 2)
  ].join('\n');

  let response;

  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.3,
        max_tokens: 1200,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ]
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    const isTimeout = error.name === 'TimeoutError' || error.name === 'AbortError';
    throw createLlmError(
      isTimeout ? 'COACH_LLM_TIMEOUT' : 'COACH_LLM_NETWORK',
      isTimeout
        ? 'La IA tardó demasiado en responder. Inténtalo de nuevo.'
        : 'No se pudo conectar con el proveedor de IA. Revisa la configuración de red.'
    );
  }

  if (!response.ok) {
    throw createLlmError(
      'COACH_LLM_HTTP',
      `El proveedor de IA respondió con un error HTTP ${response.status}. Revisa la clave y el modelo configurados.`
    );
  }

  let data;

  try {
    data = await response.json();
  } catch (error) {
    throw createLlmError('COACH_LLM_RESPONSE', 'El proveedor de IA devolvió una respuesta ilegible.');
  }

  const content = data?.choices?.[0]?.message?.content;

  if (typeof content !== 'string' || content.trim().length === 0) {
    throw createLlmError('COACH_LLM_RESPONSE', 'El proveedor de IA no devolvió ningún texto.');
  }

  return {
    text: content.trim().slice(0, MAX_REPORT_LENGTH),
    model: config.model
  };
}

module.exports = {
  writeReport,
  isConfigured: () => settings.coach.llm.isConfigured
};
