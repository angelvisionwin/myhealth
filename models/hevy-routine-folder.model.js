'use strict';

const db = require('../config/database');

function list() {
  return db
    .prepare(`
      SELECT id, hevy_id, title, folder_index, synced_at
      FROM hevy_routine_folders
      ORDER BY folder_index ASC, title COLLATE NOCASE ASC
    `)
    .all();
}

function removeMissing(hevyIds) {
  const keep = new Set(
    (Array.isArray(hevyIds) ? hevyIds : []).filter(
      (hevyId) => Number.isInteger(hevyId)
    )
  );
  const rows = db.prepare('SELECT id, hevy_id FROM hevy_routine_folders').all();
  const removed = rows.filter((row) => !keep.has(row.hevy_id));

  if (removed.length === 0) {
    return [];
  }

  const remove = db.prepare('DELETE FROM hevy_routine_folders WHERE id = ?');
  const run = db.transaction(() => {
    for (const row of removed) {
      remove.run(row.id);
    }
  });

  run();
  return removed.map((row) => row.hevy_id);
}

function upsertMany(folders) {
  const now = new Date().toISOString();
  const find = db.prepare('SELECT id FROM hevy_routine_folders WHERE hevy_id = ?');
  const insert = db.prepare(`
    INSERT INTO hevy_routine_folders (hevy_id, title, folder_index, synced_at)
    VALUES (@hevyId, @title, @folderIndex, @syncedAt)
  `);
  const update = db.prepare(`
    UPDATE hevy_routine_folders SET
      title = @title,
      folder_index = @folderIndex,
      synced_at = @syncedAt
    WHERE id = @id
  `);

  let created = 0;
  let updated = 0;

  const run = db.transaction((items) => {
    for (const folder of items) {
      if (!folder || !Number.isInteger(folder.id) || !folder.title) {
        continue;
      }

      const values = {
        hevyId: folder.id,
        title: String(folder.title).slice(0, 120),
        folderIndex: Number.isInteger(folder.index) ? folder.index : null,
        syncedAt: now
      };
      const existing = find.get(values.hevyId);

      if (existing) {
        update.run({ ...values, id: existing.id });
        updated += 1;
      } else {
        insert.run(values);
        created += 1;
      }
    }
  });

  run(folders);

  return { created, updated };
}

module.exports = {
  list,
  removeMissing,
  upsertMany
};
