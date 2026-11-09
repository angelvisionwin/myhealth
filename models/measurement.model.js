'use strict';

const db = require('../config/database');
const { isValidParameter } = require('../config/measurement-parameters');

function list(filters = {}) {
  const clauses = [];
  const params = {};

  if (filters.parameter && isValidParameter(filters.parameter)) {
    clauses.push('m.parameter = @parameter');
    params.parameter = filters.parameter;
  }

  if (filters.from) {
    clauses.push('m.measurement_date >= @from');
    params.from = filters.from;
  }

  if (filters.to) {
    clauses.push('m.measurement_date <= @to');
    params.to = filters.to;
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = filters.limit || 20;
  const offset = filters.offset || 0;

  const total = db
    .prepare(`SELECT COUNT(*) AS count FROM measurements m ${where}`)
    .get(params).count;

  const rows = db
    .prepare(`
      SELECT m.*
      FROM measurements m
      ${where}
      ORDER BY m.measurement_date DESC, m.id DESC
      LIMIT @limit OFFSET @offset
    `)
    .all({ ...params, limit, offset });

  return { rows, total };
}

function getLatestByParameter(parameter) {
  if (!isValidParameter(parameter)) {
    return null;
  }

  return (
    db
      .prepare(`
        SELECT *
        FROM measurements
        WHERE parameter = ?
        ORDER BY measurement_date DESC, id DESC
        LIMIT 1
      `)
      .get(parameter) || null
  );
}

function getPreviousByParameter(parameter) {
  if (!isValidParameter(parameter)) {
    return null;
  }

  return (
    db
      .prepare(`
        SELECT *
        FROM measurements
        WHERE parameter = ?
        ORDER BY measurement_date DESC, id DESC
        LIMIT 1 OFFSET 1
      `)
      .get(parameter) || null
  );
}

function findById(id) {
  return db.prepare('SELECT * FROM measurements WHERE id = ?').get(id) || null;
}

function create(data) {
  const result = db
    .prepare(`
      INSERT INTO measurements
        (measurement_date, parameter, value, unit, notes, created_at)
      VALUES
        (@measurementDate, @parameter, @value, @unit, @notes, @createdAt)
    `)
    .run({
      measurementDate: data.measurementDate,
      parameter: data.parameter,
      value: data.value,
      unit: data.unit,
      notes: data.notes ?? null,
      createdAt: new Date().toISOString()
    });

  return result.lastInsertRowid;
}

function update(id, data) {
  return db
    .prepare(`
      UPDATE measurements SET
        measurement_date = @measurementDate,
        parameter = @parameter,
        value = @value,
        unit = @unit,
        notes = @notes
      WHERE id = @id
    `)
    .run({
      id,
      measurementDate: data.measurementDate,
      parameter: data.parameter,
      value: data.value,
      unit: data.unit,
      notes: data.notes ?? null
    }).changes;
}

function remove(id) {
  return db.prepare('DELETE FROM measurements WHERE id = ?').run(id).changes;
}

function getSeries(parameter, options = {}) {
  if (!isValidParameter(parameter)) {
    return [];
  }

  const clauses = ['parameter = @parameter'];
  const params = { parameter };

  if (options.from) {
    clauses.push('measurement_date >= @from');
    params.from = options.from;
  }

  if (options.to) {
    clauses.push('measurement_date <= @to');
    params.to = options.to;
  }

  if (options.days && !options.from && !options.to) {
    clauses.push("measurement_date >= date('now', 'localtime', @daysModifier)");
    params.daysModifier = `-${Math.max(1, Math.floor(options.days))} days`;
  }

  return db
    .prepare(`
      SELECT measurement_date, value, unit
      FROM measurements
      WHERE ${clauses.join(' AND ')}
      ORDER BY measurement_date ASC, id ASC
    `)
    .all(params);
}

function findByDateAndParameter(parameter, measurementDate) {
  if (!isValidParameter(parameter) || !measurementDate) {
    return null;
  }

  return (
    db
      .prepare(`
        SELECT *
        FROM measurements
        WHERE parameter = ? AND measurement_date = ?
        ORDER BY id DESC
        LIMIT 1
      `)
      .get(parameter, measurementDate) || null
  );
}

function updateValue(id, value) {
  return db.prepare('UPDATE measurements SET value = ? WHERE id = ?').run(value, id).changes;
}

module.exports = {
  list,
  getLatestByParameter,
  getPreviousByParameter,
  findById,
  create,
  update,
  remove,
  getSeries,
  findByDateAndParameter,
  updateValue
};
