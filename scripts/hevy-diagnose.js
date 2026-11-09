'use strict';

const settings = require('../config/settings');
const hevyService = require('../services/hevy.service');

function showKeys(label, value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    console.log(`  ${label}: ${Object.keys(value).join(', ')}`);
  }
}

async function main() {
  if (!settings.hevy.isConfigured) {
    console.error('[hevy:diagnose] HEVY_API_KEY no está configurada.');
    process.exitCode = 1;
    return;
  }

  const user = await hevyService.getUserInfo();
  console.log('GET /v1/user/info -> HTTP 200');
  showKeys('claves de respuesta', user);
  showKeys('claves de data', user.data);

  const workoutCount = await hevyService.getWorkoutCount();
  console.log('GET /v1/workouts/count -> HTTP 200');
  console.log(`  workout_count: ${workoutCount}`);

  const workoutsPage = await hevyService.fetchWorkoutsPage(1, 1);
  console.log('GET /v1/workouts?page=1&pageSize=1 -> HTTP 200');
  console.log(`  page=${workoutsPage.page} page_count=${workoutsPage.pageCount}`);
  console.log(`  workouts=${workoutsPage.items.length}`);
  const workout = workoutsPage.items[0];
  showKeys('claves de workout', workout);
  showKeys('claves de exercise', workout?.exercises?.[0]);
  showKeys('claves de set', workout?.exercises?.[0]?.sets?.[0]);

  const templatesPage = await hevyService.fetchExerciseTemplatesPage(1, 1);
  console.log('GET /v1/exercise_templates?page=1&pageSize=1 -> HTTP 200');
  console.log(`  page=${templatesPage.page} page_count=${templatesPage.pageCount}`);
  console.log(`  templates=${templatesPage.items.length}`);
  showKeys('claves de template', templatesPage.items[0]);
}

main().catch((error) => {
  console.error(`[hevy:diagnose] ${error.code || error.name || 'Error'}: ${error.message}`);
  process.exitCode = 1;
});
