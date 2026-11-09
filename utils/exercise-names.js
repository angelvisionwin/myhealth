'use strict';

// Los títulos de las rutinas de Hevy suelen llegar en inglés, mientras que los
// entrenamientos importados guardan el nombre localizado en `exercises.name`.
// Se relacionan por `exercise_template_id` para mostrar el nombre en español.
function buildNameMap(catalog) {
  const map = new Map();

  for (const exercise of catalog) {
    if (exercise.hevy_exercise_id && exercise.name) {
      map.set(exercise.hevy_exercise_id, exercise.name);
    }
  }

  return map;
}

function resolveExerciseName(exercise, nameByTemplate) {
  if (!exercise) {
    return '';
  }

  return nameByTemplate.get(exercise.templateId) || exercise.title || '';
}

module.exports = {
  buildNameMap,
  resolveExerciseName
};
