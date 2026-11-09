'use strict';

const db = require('../config/database');

function list({ limit = 15 } = {}) {
  return db
    .prepare(`
      SELECT *
      FROM hiking_sessions
      ORDER BY session_date DESC, id DESC
      LIMIT ?
    `)
    .all(limit);
}

function listSince(date) {
  return db
    .prepare(`
      SELECT *
      FROM hiking_sessions
      WHERE session_date >= ?
      ORDER BY session_date ASC, id ASC
    `)
    .all(date);
}

function findById(id) {
  return db.prepare('SELECT * FROM hiking_sessions WHERE id = ?').get(id) || null;
}

function create(data) {
  const now = new Date().toISOString();
  const result = db
    .prepare(`
      INSERT INTO hiking_sessions
        (session_date, duration_minutes, elevation_gain_m, distance_km, effort_score,
         notes, created_at, updated_at)
      VALUES
        (@sessionDate, @durationMinutes, @elevationGainM, @distanceKm, @effortScore,
         @notes, @now, @now)
    `)
    .run({
      sessionDate: data.sessionDate,
      durationMinutes: data.durationMinutes ?? null,
      elevationGainM: data.elevationGainM ?? null,
      distanceKm: data.distanceKm ?? null,
      effortScore: data.effortScore ?? null,
      notes: data.notes ?? null,
      now
    });

  return Number(result.lastInsertRowid);
}

function update(id, data) {
  const now = new Date().toISOString();
  return db
    .prepare(`
      UPDATE hiking_sessions SET
        session_date = @sessionDate,
        duration_minutes = @durationMinutes,
        elevation_gain_m = @elevationGainM,
        distance_km = @distanceKm,
        effort_score = @effortScore,
        notes = @notes,
        updated_at = @now
      WHERE id = @id
    `)
    .run({
      id,
      sessionDate: data.sessionDate,
      durationMinutes: data.durationMinutes ?? null,
      elevationGainM: data.elevationGainM ?? null,
      distanceKm: data.distanceKm ?? null,
      effortScore: data.effortScore ?? null,
      notes: data.notes ?? null,
      now
    }).changes;
}

// Aviso de posible duplicado: misma fecha y duración, desnivel o distancia parecidos.
function findSimilar({ sessionDate, durationMinutes, elevationGainM, distanceKm, excludeId = 0 }) {
  return (
    db
      .prepare(`
        SELECT *
        FROM hiking_sessions
        WHERE session_date = @sessionDate
          AND id != @excludeId
          AND (
            (@durationMinutes IS NOT NULL
              AND duration_minutes IS NOT NULL
              AND ABS(duration_minutes - @durationMinutes) <= 10)
            OR (@elevationGainM IS NOT NULL
              AND elevation_gain_m IS NOT NULL
              AND ABS(elevation_gain_m - @elevationGainM) <= 50)
            OR (@distanceKm IS NOT NULL
              AND distance_km IS NOT NULL
              AND ABS(distance_km - @distanceKm) <= 0.5)
          )
        ORDER BY id DESC
        LIMIT 1
      `)
      .get({
        sessionDate,
        durationMinutes: durationMinutes ?? null,
        elevationGainM: elevationGainM ?? null,
        distanceKm: distanceKm ?? null,
        excludeId
      }) || null
  );
}

function remove(id) {
  return db.prepare('DELETE FROM hiking_sessions WHERE id = ?').run(id).changes;
}

module.exports = {
  list,
  listSince,
  findById,
  findSimilar,
  create,
  update,
  remove
};
