'use strict';

const fs = require('node:fs');
const path = require('node:path');

const db = require('../config/database');
const settings = require('../config/settings');
const createHttpError = require('../utils/http-error');

const BACKUP_DIR = path.join(settings.projectRoot, 'data', 'backups');
const BACKUP_PATTERN = /^myhealth-\d{8}-\d{6}\.db$/;

const EXPORT_TABLES = [
  { name: 'athlete_profile', label: 'Perfil' },
  { name: 'checkins', label: 'Check-ins' },
  { name: 'measurements', label: 'Medidas' },
  { name: 'hiking_sessions', label: 'Montaña' },
  { name: 'progress_photos', label: 'Fotos (metadatos)' },
  { name: 'coach_reports', label: 'Informes' },
  { name: 'exercises', label: 'Ejercicios' },
  { name: 'workouts', label: 'Entrenamientos' },
  { name: 'workout_sets', label: 'Series' },
  { name: 'hevy_routines', label: 'Rutinas Hevy' },
  { name: 'sync_history', label: 'Sincronizaciones' },
  { name: 'settings', label: 'Ajustes' }
];

const STATUS_MESSAGES = {
  'backup-created': {
    type: 'success',
    title: 'Copia de seguridad creada',
    message: 'La base de datos se ha copiado de forma consistente en data/backups.'
  }
};

function getStatusMessage(req) {
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  return STATUS_MESSAGES[status] || null;
}

function tableCount(name) {
  try {
    return db.prepare(`SELECT COUNT(*) AS count FROM ${name}`).get().count;
  } catch (error) {
    return 0;
  }
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) {
    return [];
  }

  return fs
    .readdirSync(BACKUP_DIR)
    .filter((file) => BACKUP_PATTERN.test(file))
    .map((file) => {
      const stats = fs.statSync(path.join(BACKUP_DIR, file));
      return {
        file,
        sizeBytes: stats.size,
        createdAt: stats.mtime.toISOString()
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function getExport(req, res, next) {
  try {
    res.renderPage('coach/export', {
      activeNav: 'coach-export',
      pageTitle: 'Datos y copias',
      pageSubtitle: 'Exporta tus datos o guarda una copia consistente de la base',
      breadcrumbs: [{ label: 'Entrenador', href: '/coach' }, { label: 'Datos y copias' }],
      tables: EXPORT_TABLES.map((table) => ({ ...table, count: tableCount(table.name) })),
      backups: listBackups(),
      statusMessage: getStatusMessage(req)
    });
  } catch (error) {
    next(error);
  }
}

function getExportJson(req, res, next) {
  try {
    const data = {
      app: 'MyHealth',
      exportedAt: new Date().toISOString(),
      tables: {}
    };

    for (const table of EXPORT_TABLES) {
      data.tables[table.name] = db.prepare(`SELECT * FROM ${table.name}`).all();
    }

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="myhealth-${stamp}.json"`);
    res.setHeader('Cache-Control', 'no-store');
    res.type('application/json');
    return res.send(JSON.stringify(data, null, 2));
  } catch (error) {
    return next(error);
  }
}

function escapeCsv(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function sendCsv(res, filename, columns, rows) {
  const lines = [
    columns.map((column) => column.label).join(';'),
    ...rows.map((row) =>
      columns.map((column) => escapeCsv(row[column.key])).join(';')
    )
  ];

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.type('text/csv; charset=utf-8');
  return res.send(`\uFEFF${lines.join('\r\n')}`);
}

const CSV_EXPORTS = {
  measurements: {
    filename: 'myhealth-medidas.csv',
    query: 'SELECT * FROM measurements ORDER BY measurement_date ASC, parameter ASC',
    columns: [
      { key: 'measurement_date', label: 'Fecha' },
      { key: 'parameter', label: 'Parámetro' },
      { key: 'value', label: 'Valor' },
      { key: 'unit', label: 'Unidad' },
      { key: 'notes', label: 'Notas' }
    ]
  },
  checkins: {
    filename: 'myhealth-checkins.csv',
    query: 'SELECT * FROM checkins ORDER BY checkin_date ASC',
    columns: [
      { key: 'checkin_date', label: 'Fecha' },
      { key: 'weight_kg', label: 'Peso (kg)' },
      { key: 'sleep_score', label: 'Sueño (1-5)' },
      { key: 'energy_score', label: 'Energía (1-5)' },
      { key: 'stress_score', label: 'Estrés (1-5)' },
      { key: 'soreness_score', label: 'Agujetas (1-5)' },
      { key: 'pain_zones', label: 'Zonas de molestia' },
      { key: 'pain_notes', label: 'Notas de dolor' },
      { key: 'notes', label: 'Notas' }
    ]
  },
  hiking: {
    filename: 'myhealth-montana.csv',
    query: 'SELECT * FROM hiking_sessions ORDER BY session_date ASC, id ASC',
    columns: [
      { key: 'session_date', label: 'Fecha' },
      { key: 'duration_minutes', label: 'Duración (min)' },
      { key: 'elevation_gain_m', label: 'Desnivel (m)' },
      { key: 'distance_km', label: 'Distancia (km)' },
      { key: 'effort_score', label: 'Esfuerzo (1-5)' },
      { key: 'notes', label: 'Notas' }
    ]
  }
};

function getExportCsv(req, res, next) {
  try {
    const type = typeof req.query.type === 'string' ? req.query.type : '';
    const config = CSV_EXPORTS[type];

    if (!config) {
      return next(createHttpError(404, 'Exportación no encontrada'));
    }

    const rows = db.prepare(config.query).all();
    return sendCsv(res, config.filename, config.columns, rows);
  } catch (error) {
    return next(error);
  }
}

async function postBackup(req, res, next) {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate()
    ).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(
      now.getMinutes()
    ).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const fileName = `myhealth-${stamp}.db`;

    await db.backup(path.join(BACKUP_DIR, fileName));
    return res.redirect('/coach/export?status=backup-created');
  } catch (error) {
    return next(error);
  }
}

function getBackupFile(req, res, next) {
  try {
    const file = String(req.params.file || '');
    if (!BACKUP_PATTERN.test(file)) {
      return next(createHttpError(404, 'Copia no encontrada'));
    }

    const filePath = path.join(BACKUP_DIR, file);
    if (!fs.existsSync(filePath)) {
      return next(createHttpError(404, 'Copia no encontrada'));
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.download(filePath, file);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getExport,
  getExportJson,
  getExportCsv,
  postBackup,
  getBackupFile
};
