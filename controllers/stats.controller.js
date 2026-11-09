'use strict';

const statsModel = require('../models/stats.model');
const format = require('../utils/format');
const { parsePositiveInteger } = require('../utils/query');

function getStats(req, res, next) {
  try {
    const summary = statsModel.getSummary();
    const weekly = statsModel.getWeeklyStats(12);
    const monthly = statsModel.getMonthlyStats(12);
    const exerciseOptions = statsModel.listExercisesWithData();

    let selectedId = parsePositiveInteger(req.query.exerciseId, 0);
    if (selectedId && !exerciseOptions.some((exercise) => exercise.id === selectedId)) {
      selectedId = 0;
    }
    if (!selectedId) {
      selectedId = exerciseOptions[0]?.id || 0;
    }

    const selectedExercise = selectedId
      ? exerciseOptions.find((exercise) => exercise.id === selectedId) ||
        statsModel.findExerciseById(selectedId)
      : null;
    const exerciseEvolution = selectedId
      ? statsModel.getExerciseEvolution(selectedId)
      : [];
    const personalRecords = statsModel.getPersonalRecords();
    const hasWeightData = exerciseEvolution.some(
      (row) => row.max_weight !== null && row.max_weight !== undefined
    );
    const exerciseMaxWeight = exerciseEvolution.reduce(
      (maximum, row) =>
        row.max_weight !== null && row.max_weight !== undefined && row.max_weight > maximum
          ? row.max_weight
          : maximum,
      null
    );
    const exerciseTotalSets = exerciseEvolution.reduce(
      (total, row) => total + row.set_count,
      0
    );

    const chartData = {
      weekly: {
        labels: weekly.map((week) => format.formatDate(week.weekStart)),
        workoutCounts: weekly.map((week) => week.workoutCount),
        volumes: weekly.map((week) => week.volume)
      },
      exercise: {
        labels: exerciseEvolution.map((row) => format.formatDate(row.start_time)),
        maxWeights: exerciseEvolution.map((row) => row.max_weight),
        totalReps: exerciseEvolution.map((row) => row.total_reps)
      }
    };

    res.renderPage('stats/index', {
      activeNav: 'stats',
      pageTitle: 'Estadísticas',
      pageSubtitle: 'Actividad, volumen de carga y récords personales',
      breadcrumbs: [
        { label: 'Entrenamientos', href: '/workouts' },
        { label: 'Estadísticas' }
      ],
      summary,
      weekly,
      monthly,
      exerciseOptions,
      selectedExercise,
      exerciseEvolution,
      personalRecords,
      exerciseMaxWeight,
      exerciseTotalSets,
      hasWeightData,
      statsJson: JSON.stringify(chartData).replace(/</g, '\\u003c'),
      pageScripts: ['/vendor/chartjs/chart.umd.min.js', '/js/stats.js']
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getStats
};
