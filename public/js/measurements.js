(function () {
  'use strict';

  var parameterSelect = document.getElementById('measurement-parameter');
  var unitElement = document.getElementById('measurement-unit');
  var rangeElement = document.getElementById('measurement-range');

  if (parameterSelect) {
    var updateParameterHint = function () {
      var option = parameterSelect.options[parameterSelect.selectedIndex];
      if (!option) {
        return;
      }

      var unit = option.getAttribute('data-unit') || '—';
      var min = option.getAttribute('data-min');
      var max = option.getAttribute('data-max');

      if (unitElement) {
        unitElement.textContent = unit;
      }

      if (rangeElement) {
        rangeElement.textContent =
          'Rango orientativo: ' +
          min +
          '–' +
          max +
          ' ' +
          unit +
          '. Un valor fuera de este rango no se bloquea: se pedirá confirmación.';
      }
    };

    parameterSelect.addEventListener('change', updateParameterHint);
    updateParameterHint();
  }

  var dataElement = document.getElementById('measurements-chart-data');
  var canvas = document.getElementById('measurements-chart');

  if (!dataElement || !canvas || typeof window.Chart === 'undefined') {
    return;
  }

  var data;

  try {
    data = JSON.parse(dataElement.textContent);
  } catch (error) {
    return;
  }

  if (!Array.isArray(data.labels) || data.labels.length === 0) {
    return;
  }

  var numberFormatter = new Intl.NumberFormat('es-ES', {
    maximumFractionDigits: 2
  });

  new Chart(canvas, {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: [
        {
          label: data.label,
          data: data.values,
          borderColor: '#206bc4',
          backgroundColor: 'rgba(32, 107, 196, 0.15)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          labels: {
            color: '#8a97a8',
            boxWidth: 12,
            boxHeight: 12
          }
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              return data.label + ': ' + numberFormatter.format(context.parsed.y) + ' ' + data.unit;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#8a97a8',
            maxRotation: 0,
            autoSkip: true
          },
          grid: {
            display: false
          },
          border: {
            color: 'rgba(138, 151, 168, 0.2)'
          }
        },
        y: {
          beginAtZero: false,
          grace: '5%',
          ticks: {
            color: '#8a97a8'
          },
          grid: {
            color: 'rgba(138, 151, 168, 0.2)'
          },
          border: {
            display: false
          }
        }
      }
    }
  });
})();
