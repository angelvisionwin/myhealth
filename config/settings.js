'use strict';

const path = require('node:path');
const dotenv = require('dotenv');

const projectRoot = path.join(__dirname, '..');

dotenv.config({ path: path.join(projectRoot, '.env'), quiet: true });

function readPort(value) {
  const port = Number.parseInt(value, 10);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : 3000;
}

function readBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

const port = readPort(process.env.PORT);
const host = process.env.HOST || '127.0.0.1';
const timeZone = process.env.APP_TIMEZONE || 'Europe/Madrid';
const databasePath = path.resolve(projectRoot, process.env.DATABASE_PATH || path.join('data', 'myhealth.db'));
const hevyApiKey = (process.env.HEVY_API_KEY || '').trim();

// Capa opcional de redacción con IA. Desactivada por defecto: el entrenador funciona con reglas.
const coachLlmApiKey = (process.env.COACH_LLM_API_KEY || '').trim();
const coachLlmModel = (process.env.COACH_LLM_MODEL || '').trim();
const coachLlmEnabled = readBoolean(process.env.COACH_LLM_ENABLED);

module.exports = {
  appName: 'MyHealth',
  environment: process.env.NODE_ENV || 'development',
  port,
  host,
  timeZone,
  databasePath,
  projectRoot,
  hevy: {
    isConfigured: hevyApiKey.length > 0,
    // La clave no debe salir nunca de este módulo ni mostrarse en las vistas.
    apiKey: hevyApiKey
  },
  coach: {
    llm: {
      enabled: coachLlmEnabled,
      isConfigured: coachLlmEnabled && coachLlmApiKey.length > 0 && coachLlmModel.length > 0,
      // Endpoint compatible con la API de Chat Completions.
      baseUrl: (process.env.COACH_LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
      apiKey: coachLlmApiKey,
      model: coachLlmModel
    }
  }
};
