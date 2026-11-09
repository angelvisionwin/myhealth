(function () {
  'use strict';

  var dataElement = document.getElementById('coach-charts');

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
    text: '#8a97a8',
    grid: 'rgba(138, 151, 168, 0.2)',
    primary: '#206bc4',
    muted: '#6c7a91'
  };

  var musclePalette = {
    chest: '#206bc4',
    back: '#4299e1',
    shoulders: '#2fb344',
    biceps: '#74b816',
    triceps: '#f59f00',
    quads: '#d63939',
    hams: '#ae3ec9',
    glutes: '#f76707',
    calves: '#0ca678',
    abs: '#6c7a91'
  };

  var numberFormatter = new Intl.NumberFormat('es-ES', {
    maximumFractionDigits: 2
  });

  function formatNumber(value) {
    return value === null || value === undefined ? '—' : numberFormatter.format(value);
  }

  function baseOptions(extra) {
    var options = {
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
      scales: {
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
      }
    };

    return Object.assign(options, extra || {});
  }

  function createWeightChart() {
    var canvas = document.getElementById('coach-weight-chart');
    var weight = data.weight;

    if (!canvas || !weight || weight.labels.length === 0) {
      return;
    }

    new Chart(canvas, {
      type: 'line',
      data: {
        labels: weight.labels,
        datasets: [
          {
            label: 'Peso (kg)',
            data: weight.values,
            borderColor: colors.primary,
            backgroundColor: 'rgba(32, 107, 196, 0.12)',
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointHoverRadius: 5
          },
          {
            label: 'Media 7 días',
            data: weight.movingAverage,
            borderColor: '#d63939',
            borderDash: [5, 4],
            borderWidth: 2,
            fill: false,
            tension: 0.3,
            pointRadius: 0
          }
        ]
      },
      options: baseOptions({
        plugins: {
          legend: {
            labels: { color: colors.text, boxWidth: 12, boxHeight: 12 }
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                return context.dataset.label + ': ' + formatNumber(context.parsed.y) + ' kg';
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { color: colors.text, maxRotation: 0, autoSkip: true },
            grid: { display: false },
            border: { color: colors.grid }
          },
          y: {
            beginAtZero: false,
            grace: '5%',
            ticks: { color: colors.text },
            grid: { color: colors.grid },
            border: { display: false }
          }
        }
      })
    });
  }

  function createExerciseChart() {
    var canvas = document.getElementById('coach-exercise-chart');
    var exercise = data.exercise;

    if (!canvas || !exercise || exercise.labels.length === 0) {
      return;
    }

    new Chart(canvas, {
      type: 'line',
      data: {
        labels: exercise.labels,
        datasets: [
          {
            label: 'e1RM (kg) · ' + exercise.name,
            data: exercise.values,
            borderColor: '#2fb344',
            backgroundColor: 'rgba(47, 179, 68, 0.12)',
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointHoverRadius: 5
          }
        ]
      },
      options: baseOptions({
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                return 'e1RM: ' + formatNumber(context.parsed.y) + ' kg';
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { color: colors.text, maxRotation: 0, autoSkip: true },
            grid: { display: false },
            border: { color: colors.grid }
          },
          y: {
            beginAtZero: false,
            grace: '5%',
            ticks: { color: colors.text },
            grid: { color: colors.grid },
            border: { display: false }
          }
        }
      })
    });
  }

  function createMuscleChart() {
    var canvas = document.getElementById('coach-muscle-chart');
    var muscles = data.muscles;

    if (!canvas || !muscles || muscles.labels.length === 0) {
      return;
    }

    var datasets = muscles.groups.map(function (group) {
      var color = musclePalette[group.key] || colors.muted;

      return {
        label: group.label,
        data: group.values,
        backgroundColor: color,
        borderColor: color,
        borderWidth: 1,
        borderRadius: 2,
        maxBarThickness: 26
      };
    });

    new Chart(canvas, {
      type: 'bar',
      data: {
        labels: muscles.labels,
        datasets: datasets
      },
      options: baseOptions({
        scales: {
          x: {
            stacked: true,
            ticks: { color: colors.text, maxRotation: 0, autoSkip: true },
            grid: { display: false },
            border: { color: colors.grid }
          },
          y: {
            stacked: true,
            beginAtZero: true,
            title: {
              display: true,
              text: 'Series de trabajo',
              color: colors.text
            },
            ticks: { color: colors.text, precision: 0 },
            grid: { color: colors.grid },
            border: { display: false }
          }
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: colors.text, boxWidth: 12, boxHeight: 12 }
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                return context.dataset.label + ': ' + formatNumber(context.parsed.y) + ' series';
              }
            }
          }
        }
      })
    });
  }

  createWeightChart();
  createExerciseChart();
  createMuscleChart();
})();
