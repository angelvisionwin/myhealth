'use strict';

const db = require('../config/database');

function getLatest(provider = 'hevy') {
  return (
    db
      .prepare(`
        SELECT *
        FROM sync_history
        WHERE provider = ?
        ORDER BY started_at DESC, id DESC
        LIMIT 1
      `)
      .get(provider) || null
  );
}

function listRecent(provider = 'hevy', limit = 10) {
  return db
    .prepare(`
      SELECT *
      FROM sync_history
      WHERE provider = ?
      ORDER BY started_at DESC, id DESC
      LIMIT ?
    `)
    .all(provider, limit);
}

function start(provider = 'hevy') {
  const startedAt = new Date().toISOString();
  const result = db
    .prepare(`
      INSERT INTO sync_history (provider, started_at, status)
      VALUES (?, ?, 'running')
    `)
    .run(provider, startedAt);

  return {
    id: result.lastInsertRowid,
    startedAt
  };
}

function finish(id, data) {
  db.prepare(`
    UPDATE sync_history SET
      finished_at = @finishedAt,
      status = @status,
      items_read = @itemsRead,
      items_created = @itemsCreated,
      items_updated = @itemsUpdated,
      error_message = @errorMessage
    WHERE id = @id
  `).run({
    id,
    finishedAt: data.finishedAt || new Date().toISOString(),
    status: data.status,
    itemsRead: data.itemsRead ?? 0,
    itemsCreated: data.itemsCreated ?? 0,
    itemsUpdated: data.itemsUpdated ?? 0,
    errorMessage: data.errorMessage ?? null
  });
}

function failInterrupted(provider = 'hevy') {
  const result = db
    .prepare(`
      UPDATE sync_history SET
        finished_at = @finishedAt,
        status = 'error',
        error_message = COALESCE(error_message, 'Sincronización interrumpida antes de finalizar.')
      WHERE provider = @provider
        AND status = 'running'
    `)
    .run({
      provider,
      finishedAt: new Date().toISOString()
    });

  return result.changes;
}

module.exports = {
  getLatest,
  listRecent,
  start,
  finish,
  failInterrupted
};
