'use strict';

const db = require('../config/database');

const PROFILE_ID = 1;

function ensure() {
  db.prepare(`
    INSERT OR IGNORE INTO athlete_profile (id, created_at, updated_at)
    VALUES (@id, @now, @now)
  `).run({ id: PROFILE_ID, now: new Date().toISOString() });
}

function get() {
  ensure();
  return db.prepare('SELECT * FROM athlete_profile WHERE id = ?').get(PROFILE_ID) || null;
}

function update(data) {
  ensure();

  db.prepare(`
    UPDATE athlete_profile SET
      birth_year = @birthYear,
      height_cm = @heightCm,
      sex = @sex,
      experience = @experience,
      primary_goal = @primaryGoal,
      target_weight_kg = @targetWeightKg,
      target_waist_cm = @targetWaistCm,
      target_body_fat_pct = @targetBodyFatPct,
      target_sessions_per_week = @targetSessionsPerWeek,
      session_minutes = @sessionMinutes,
      training_days = @trainingDays,
      hiking_days = @hikingDays,
      routine_folder_id = @routineFolderId,
      equipment = @equipment,
      limitations = @limitations,
      notes = @notes,
      updated_at = @updatedAt
    WHERE id = @id
  `).run({
    id: PROFILE_ID,
    birthYear: data.birthYear ?? null,
    heightCm: data.heightCm ?? null,
    sex: data.sex ?? null,
    experience: data.experience ?? null,
    primaryGoal: data.primaryGoal,
    targetWeightKg: data.targetWeightKg ?? null,
    targetWaistCm: data.targetWaistCm ?? null,
    targetBodyFatPct: data.targetBodyFatPct ?? null,
    targetSessionsPerWeek: data.targetSessionsPerWeek ?? null,
    sessionMinutes: data.sessionMinutes ?? null,
    trainingDays: data.trainingDays ?? null,
    hikingDays: data.hikingDays ?? null,
    routineFolderId: data.routineFolderId ?? null,
    equipment: data.equipment ?? null,
    limitations: data.limitations ?? null,
    notes: data.notes ?? null,
    updatedAt: new Date().toISOString()
  });

  return get();
}

function clearRoutineFolderId() {
  ensure();

  return db.prepare(`
    UPDATE athlete_profile SET
      routine_folder_id = NULL,
      updated_at = @now
    WHERE id = @id AND routine_folder_id IS NOT NULL
  `).run({ id: PROFILE_ID, now: new Date().toISOString() }).changes;
}

module.exports = {
  clearRoutineFolderId,
  get,
  update
};
