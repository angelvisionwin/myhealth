'use strict';

const workoutModel = require('../models/workout.model');
const measurementModel = require('../models/measurement.model');
const syncHistoryModel = require('../models/sync-history.model');
const coachReportModel = require('../models/coach-report.model');
const coachReportService = require('../services/coach-report.service');
const format = require('../utils/format');

function getDashboard(req, res, next) {
  try {
    const monthly = workoutModel.getMonthlySummary();
    const recentWorkouts = workoutModel.getRecent(5);
    const latestWeight = measurementModel.getLatestByParameter('weight');
    const previousWeight = latestWeight ? measurementModel.getPreviousByParameter('weight') : null;
    const weightDifference =
      latestWeight && previousWeight ? latestWeight.value - previousWeight.value : null;
    const weightSeries = measurementModel.getSeries('weight', { days: 90 });
    const weightChartData =
      weightSeries.length > 0
        ? {
            labels: weightSeries.map((row) => format.formatDate(row.measurement_date)),
            values: weightSeries.map((row) => row.value),
            unit: 'kg',
            label: 'Peso'
          }
        : null;
    const lastSync = syncHistoryModel.getLatest('hevy');

    const hasWorkouts = monthly.workout_count > 0 || recentWorkouts.length > 0;
    const hasMeasurements = Boolean(latestWeight);
    const hasAnyData = hasWorkouts || hasMeasurements || Boolean(lastSync);

    const latestCoachReport = coachReportModel.getLatest();
    let coachHighlight = null;

    if (latestCoachReport) {
      const summary = coachReportService.parseSummary(latestCoachReport);

      if (summary) {
        const findings = Array.isArray(summary.findings) ? summary.findings : [];
        const priorityFinding =
          findings.find((finding) => finding.severity === 'alert') ||
          findings.find((finding) => finding.severity === 'warning') ||
          findings.find((finding) => finding.severity === 'positive') ||
          findings[0];

        coachHighlight = {
          id: latestCoachReport.id,
          generatedAt: latestCoachReport.generated_at,
          stale: coachReportService.isStale(latestCoachReport),
          severity: priorityFinding?.severity || 'info',
          title: priorityFinding?.title || 'Informe disponible',
          detail: priorityFinding?.detail || ''
        };
      }
    }

    res.renderPage('dashboard/index', {
      activeNav: 'dashboard',
      pageTitle: 'Dashboard',
      pageSubtitle: 'Resumen de tu actividad y tus medidas',
      breadcrumbs: [],
      monthly,
      recentWorkouts,
      latestWeight,
      previousWeight,
      weightDifference,
      weightSeries,
      weightChartData,
      weightChartJson: weightChartData
        ? JSON.stringify(weightChartData).replace(/</g, '\\u003c')
        : null,
      lastSync,
      hasWorkouts,
      hasMeasurements,
      hasAnyData,
      coachHighlight,
      pageScripts: weightChartData
        ? ['/vendor/chartjs/chart.umd.min.js', '/js/dashboard.js']
        : []
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getDashboard
};
