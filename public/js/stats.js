(function () {
  'use strict';

  var dataElement = document.getElementById('stats-data');

  if (!dataElement || typeof window.Chart === 'undefined') {
    return;
  }

  var data;

  try {
    data = JSON.parse(dataElement.textContent);
  } catch (error) {
    return;
  }

  var colors = {
    primary: '#206bc4',
    green: '#2fb344',
    text: '#8a97a8',
    grid: 'rgba(138, 151, 168, 0.2)'
  };

  var numberFormatter = new Intl.NumberFormat('es-ES', {
    maximumFractionDigits: 2
  });

  function formatNumber(value) {
    return value === null || value === undefined ? '—' : numberFormatter.format(value);
  }

  function baseOptions(extraScales) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          labels: {
            color: colors.text,
            boxWidth: 12,
            boxHeight: 12
          }
        }
      },
      scales: Object.assign(
        {
          x: {
            ticks: {
              color: colors.text,
              maxRotation: 0,
              autoSkip: true
            },
            grid: {
              display: false
            },
            border: {
              color: colors.grid
            }
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: colors.text
            },
            grid: {
              color: colors.grid
            },
            border: {
              display: false
            }
          }
        },
        extraScales || {}
      )
    };
  }

  function createWeeklyWorkoutsChart() {
    var canvas = document.getElementById('weekly-workouts-chart');
    if (!canvas) {
      return;
    }

    var options = baseOptions();
    options.scales.y.ticks.precision = 0;

    new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.weekly.labels,
        datasets: [
          {
            label: 'Entrenamientos',
            data: data.weekly.workoutCounts,
            backgroundColor: 'rgba(32, 107, 196, 0.65)',
            borderColor: colors.primary,
            borderWidth: 1,
            borderRadius: 4,
            maxBarThickness: 32
          }
        ]
      },
      options: options
    });
  }

  function createWeeklyVolumeChart() {
    var canvas = document.getElementById('weekly-volume-chart');
    if (!canvas) {
      return;
    }

    var options = baseOptions();
    options.plugins.tooltip = {
      callbacks: {
        label: function (context) {
          return 'Volumen: ' + formatNumber(context.parsed.y) + ' kg·rep';
        }
      }
    };

    new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.weekly.labels,
        datasets: [
          {
            label: 'Volumen de carga',
            data: data.weekly.volumes,
            backgroundColor: 'rgba(47, 179, 68, 0.55)',
            borderColor: colors.green,
            borderWidth: 1,
            borderRadius: 4,
            maxBarThickness: 32
          }
        ]
      },
      options: options
    });
  }

  function createExerciseChart() {
    var canvas = document.getElementById('exercise-chart');
    if (!canvas || !Array.isArray(data.exercise.labels) || data.exercise.labels.length === 0) {
      return;
    }

    var hasWeightData = data.exercise.maxWeights.some(
      function (value) {
        return value !== null && value !== undefined;
      }
    );

    var datasets = [];

    if (hasWeightData) {
      datasets.push({
        label: 'Peso máximo (kg)',
        data: data.exercise.maxWeights,
        borderColor: colors.primary,
        backgroundColor: 'rgba(32, 107, 196, 0.15)',
        yAxisID: 'y',
        tension: 0.3,
        spanGaps: true,
        pointRadius: 3,
        pointHoverRadius: 5
      });
    }

    datasets.push({
      label: 'Repeticiones totales',
      data: data.exercise.totalReps,
      borderColor: colors.green,
      backgroundColor: 'rgba(47, 179, 68, 0.12)',
      yAxisID: hasWeightData ? 'y1' : 'y',
      tension: 0.3,
      spanGaps: true,
      pointRadius: 3,
      pointHoverRadius: 5
    });

    var scales = {};

    if (hasWeightData) {
      scales.y = {
        beginAtZero: true,
        position: 'left',
        title: {
          display: true,
          text: 'Peso (kg)',
          color: colors.text
        },
        ticks: {
          color: colors.text
        },
        grid: {
          color: colors.grid
        },
        border: {
          display: false
        }
      };
      scales.y1 = {
        beginAtZero: true,
        position: 'right',
        title: {
          display: true,
          text: 'Repeticiones',
          color: colors.text
        },
        ticks: {
          color: colors.text,
          precision: 0
        },
        grid: {
          drawOnChartArea: false
        },
        border: {
          display: false
        }
      };
    }

    if (!hasWeightData) {
      scales.y = scales.y || {};
      scales.y.ticks = Object.assign({}, scales.y.ticks, { precision: 0 });
    }

    var options = baseOptions(scales);
    options.plugins.tooltip = {
      callbacks: {
        label: function (context) {
          var suffix = context.dataset.yAxisID === 'y' && hasWeightData ? ' kg' : ' reps';
          return context.dataset.label + ': ' + formatNumber(context.parsed.y) + suffix;
        }
      }
    };

    new Chart(canvas, {
      type: 'line',
      data: {
        labels: data.exercise.labels,
        datasets: datasets
      },
      options: options
    });
  }

  createWeeklyWorkoutsChart();
  createWeeklyVolumeChart();
  createExerciseChart();
})();
