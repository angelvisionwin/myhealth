(function () {
  'use strict';

  var dataElement = document.getElementById('dashboard-weight-data');
  var canvas = document.getElementById('dashboard-weight-chart');

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
          display: false
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
