'use strict';

const db = require('../config/database');

function create(data) {
  const result = db
    .prepare(`
      INSERT INTO coach_reports
        (period_start, period_end, period_days, rules_version, summary_json,
         report_text, generated_at)
      VALUES
        (@periodStart, @periodEnd, @periodDays, @rulesVersion, @summaryJson,
         @reportText, @generatedAt)
    `)
    .run({
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      periodDays: data.periodDays,
      rulesVersion: data.rulesVersion,
      summaryJson: data.summaryJson,
      reportText: data.reportText,
      generatedAt: data.generatedAt || new Date().toISOString()
    });

  return Number(result.lastInsertRowid);
}

function findById(id) {
  return db.prepare('SELECT * FROM coach_reports WHERE id = ?').get(id) || null;
}

function getLatest() {
  return (
    db.prepare('SELECT * FROM coach_reports ORDER BY generated_at DESC, id DESC LIMIT 1').get() ||
    null
  );
}

function list(limit = 20) {
  return db
    .prepare(`
      SELECT id, period_start, period_end, period_days, rules_version, ai_text, ai_model,
             generated_at
      FROM coach_reports
      ORDER BY generated_at DESC, id DESC
      LIMIT ?
    `)
    .all(limit);
}

function updateAi(id, { text, model }) {
  return db
    .prepare('UPDATE coach_reports SET ai_text = @text, ai_model = @model WHERE id = @id')
    .run({ id, text, model }).changes;
}

module.exports = {
  create,
  findById,
  getLatest,
  list,
  updateAi
};
