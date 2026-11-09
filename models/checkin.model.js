'use strict';

const db = require('../config/database');

function list({ limit = 12, from = null } = {}) {
  if (from) {
    return db
      .prepare(`
        SELECT *
        FROM checkins
        WHERE checkin_date >= @from
        ORDER BY checkin_date DESC
        LIMIT @limit
      `)
      .all({ from, limit });
  }

  return db
    .prepare(`
      SELECT *
      FROM checkins
      ORDER BY checkin_date DESC
      LIMIT @limit
    `)
    .all({ limit });
}

function listSince(date) {
  return db
    .prepare(`
      SELECT *
      FROM checkins
      WHERE checkin_date >= ?
      ORDER BY checkin_date ASC
    `)
    .all(date);
}

function findByDate(date) {
  return db.prepare('SELECT * FROM checkins WHERE checkin_date = ?').get(date) || null;
}

function findById(id) {
  return db.prepare('SELECT * FROM checkins WHERE id = ?').get(id) || null;
}

function upsert(data) {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO checkins
      (checkin_date, weight_kg, sleep_score, energy_score, stress_score, soreness_score,
       pain_zones, pain_notes, notes, created_at, updated_at)
    VALUES
      (@checkinDate, @weightKg, @sleepScore, @energyScore, @stressScore, @sorenessScore,
       @painZones, @painNotes, @notes, @now, @now)
    ON CONFLICT(checkin_date) DO UPDATE SET
      weight_kg = excluded.weight_kg,
      sleep_score = excluded.sleep_score,
      energy_score = excluded.energy_score,
      stress_score = excluded.stress_score,
      soreness_score = excluded.soreness_score,
      pain_zones = excluded.pain_zones,
      pain_notes = excluded.pain_notes,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `).run({
    checkinDate: data.checkinDate,
    weightKg: data.weightKg ?? null,
    sleepScore: data.sleepScore ?? null,
    energyScore: data.energyScore ?? null,
    stressScore: data.stressScore ?? null,
    sorenessScore: data.sorenessScore ?? null,
    painZones: data.painZones ?? null,
    painNotes: data.painNotes ?? null,
    notes: data.notes ?? null,
    now
  });

  return findByDate(data.checkinDate);
}

function remove(id) {
  return db.prepare('DELETE FROM checkins WHERE id = ?').run(id).changes;
}

function getLatest() {
  return db.prepare('SELECT * FROM checkins ORDER BY checkin_date DESC LIMIT 1').get() || null;
}

module.exports = {
  list,
  listSince,
  findByDate,
  findById,
  upsert,
  remove,
  getLatest
};
