'use strict';

const db = require('../config/database');

function list({ limit = 60 } = {}) {
  return db
    .prepare(`
      SELECT *
      FROM progress_photos
      ORDER BY photo_date DESC, id DESC
      LIMIT ?
    `)
    .all(limit);
}

function findById(id) {
  return db.prepare('SELECT * FROM progress_photos WHERE id = ?').get(id) || null;
}

function create(data) {
  const result = db
    .prepare(`
      INSERT INTO progress_photos
        (photo_date, file_name, mime_type, size_bytes, weight_kg, notes, created_at)
      VALUES
        (@photoDate, @fileName, @mimeType, @sizeBytes, @weightKg, @notes, @createdAt)
    `)
    .run({
      photoDate: data.photoDate,
      fileName: data.fileName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      weightKg: data.weightKg ?? null,
      notes: data.notes ?? null,
      createdAt: new Date().toISOString()
    });

  return Number(result.lastInsertRowid);
}

function remove(id) {
  return db.prepare('DELETE FROM progress_photos WHERE id = ?').run(id).changes;
}

module.exports = {
  list,
  findById,
  create,
  remove
};
