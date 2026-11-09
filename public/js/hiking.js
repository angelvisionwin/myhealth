(function () {
  'use strict';

  var input = document.getElementById('gpx-file');
  var message = document.getElementById('gpx-message');
  var form = document.querySelector('form[action^="/coach/hiking"]');

  if (!input || !message || !form) {
    return;
  }

  var dateInput = document.getElementById('session_date');
  var durationInput = document.getElementById('duration_minutes');
  var elevationInput = document.getElementById('elevation_gain_m');
  var distanceInput = document.getElementById('distance_km');
  var notesInput = document.getElementById('notes');

  function showMessage(text, type) {
    message.className = 'small mt-2 text-' + (type || 'secondary');
    message.textContent = text;
  }

  function round(value, decimals) {
    var factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  function localDateFromIso(iso) {
    if (!iso) {
      return null;
    }

    var date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    var local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function haversineKm(a, b) {
    var radius = 6371;
    var toRad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toRad;
    var dLon = (b.lon - a.lon) * toRad;
    var lat1 = a.lat * toRad;
    var lat2 = b.lat * toRad;
    var h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * radius * Math.asin(Math.sqrt(h));
  }

  // Suma desnivel con histéresis: ignora el ruido del GPS y solo cuenta
  // subidas o bajadas sostenidas por encima del umbral.
  function elevationGain(values) {
    var threshold = 4;
    var valid = values.filter(function (value) {
      return Number.isFinite(value);
    });

    if (valid.length < 2) {
      return null;
    }

    var gain = 0;
    var reference = valid[0];

    for (var index = 1; index < valid.length; index += 1) {
      var delta = valid[index] - reference;

      if (delta >= threshold) {
        gain += delta;
        reference = valid[index];
      } else if (delta <= -threshold) {
        reference = valid[index];
      }
    }

    return Math.round(gain);
  }

  function parseGpx(document) {
    var points = Array.prototype.slice
      .call(document.getElementsByTagNameNS('*', 'trkpt'))
      .map(function (point) {
        var elevation = point.getElementsByTagNameNS('*', 'ele')[0];
        var time = point.getElementsByTagNameNS('*', 'time')[0];

        return {
          lat: Number.parseFloat(point.getAttribute('lat')),
          lon: Number.parseFloat(point.getAttribute('lon')),
          ele: elevation ? Number.parseFloat(elevation.textContent) : null,
          time: time ? time.textContent.trim() : null
        };
      })
      .filter(function (point) {
        return Number.isFinite(point.lat) && Number.isFinite(point.lon);
      });

    if (points.length === 0) {
      return null;
    }

    var track = document.getElementsByTagNameNS('*', 'trk')[0];
    var nameElement = track ? track.getElementsByTagNameNS('*', 'name')[0] : null;
    var times = points.map(function (point) {
      return point.time;
    });
    var firstTime = times.find(Boolean) || null;
    var lastTime = times.slice().reverse().find(Boolean) || null;
    var seconds = null;

    if (firstTime && lastTime) {
      var start = Date.parse(firstTime);
      var end = Date.parse(lastTime);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        seconds = Math.round((end - start) / 1000);
      }
    }

    var distanceKm = 0;
    for (var index = 1; index < points.length; index += 1) {
      distanceKm += haversineKm(points[index - 1], points[index]);
    }

    return {
      date: localDateFromIso(firstTime),
      seconds: seconds,
      distanceKm: distanceKm > 0 ? round(distanceKm, 1) : null,
      elevationGain: elevationGain(
        points.map(function (point) {
          return point.ele;
        })
      ),
      name: nameElement ? nameElement.textContent.trim() : null
    };
  }

  function parseTcx(document) {
    var activity = document.getElementsByTagNameNS('*', 'Activity')[0];

    if (!activity) {
      return null;
    }

    var laps = Array.prototype.slice.call(activity.getElementsByTagNameNS('*', 'Lap'));
    var totalSeconds = 0;
    var distanceMeters = 0;

    laps.forEach(function (lap) {
      var time = lap.getElementsByTagNameNS('*', 'TotalTimeSeconds')[0];
      var distance = lap.getElementsByTagNameNS('*', 'DistanceMeters')[0];
      totalSeconds += time ? Number.parseFloat(time.textContent) || 0 : 0;
      distanceMeters += distance ? Number.parseFloat(distance.textContent) || 0 : 0;
    });

    var trackpoints = Array.prototype.slice.call(
      activity.getElementsByTagNameNS('*', 'Trackpoint')
    );
    var times = trackpoints
      .map(function (point) {
        var time = point.getElementsByTagNameNS('*', 'Time')[0];
        return time ? time.textContent.trim() : null;
      })
      .filter(Boolean);
    var firstTime = times[0] || null;

    if (totalSeconds === 0 && times.length > 1) {
      var start = Date.parse(times[0]);
      var end = Date.parse(times[times.length - 1]);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        totalSeconds = Math.round((end - start) / 1000);
      }
    }

    if (distanceMeters === 0) {
      var points = trackpoints
        .map(function (point) {
          var position = point.getElementsByTagNameNS('*', 'Position')[0];
          if (!position) {
            return null;
          }
          var lat = position.getElementsByTagNameNS('*', 'LatitudeDegrees')[0];
          var lon = position.getElementsByTagNameNS('*', 'LongitudeDegrees')[0];
          return lat && lon
            ? {
                lat: Number.parseFloat(lat.textContent),
                lon: Number.parseFloat(lon.textContent)
              }
            : null;
        })
        .filter(Boolean);

      for (var index = 1; index < points.length; index += 1) {
        distanceMeters += haversineKm(points[index - 1], points[index]) * 1000;
      }
    }

    var activityId = activity.getElementsByTagNameNS('*', 'Id')[0];
    var nameElement = activity.getElementsByTagNameNS('*', 'Name')[0];

    return {
      date: localDateFromIso(activityId ? activityId.textContent.trim() : firstTime),
      seconds: totalSeconds > 0 ? totalSeconds : null,
      distanceKm: distanceMeters > 0 ? round(distanceMeters / 1000, 1) : null,
      elevationGain: elevationGain(
        trackpoints.map(function (point) {
          var altitude = point.getElementsByTagNameNS('*', 'AltitudeMeters')[0];
          return altitude ? Number.parseFloat(altitude.textContent) : null;
        })
      ),
      name: nameElement ? nameElement.textContent.trim() : null
    };
  }

  input.addEventListener('change', function () {
    message.textContent = '';
    var file = input.files && input.files[0];

    if (!file) {
      return;
    }

    if (!/\.(gpx|tcx)$/i.test(file.name)) {
      showMessage('Selecciona un archivo GPX o TCX exportado desde COROS.', 'danger');
      input.value = '';
      return;
    }

    file
      .text()
      .then(function (text) {
        var document = new DOMParser().parseFromString(text, 'application/xml');

        if (document.getElementsByTagName('parsererror').length > 0) {
          throw new Error('El archivo no es XML válido.');
        }

        var isTcx = document.documentElement.nodeName.toLowerCase().indexOf('trainingcenter') !== -1;
        var data = isTcx ? parseTcx(document) : parseGpx(document);

        if (!data) {
          throw new Error('No se han encontrado puntos de actividad en el archivo.');
        }

        if (data.date) {
          dateInput.value = data.date;
        }
        if (data.seconds) {
          durationInput.value = Math.max(1, Math.round(data.seconds / 60));
        }
        if (data.elevationGain !== null) {
          elevationInput.value = data.elevationGain;
        }
        if (data.distanceKm !== null) {
          distanceInput.value = data.distanceKm;
        }
        if (data.name && notesInput && !notesInput.value.trim()) {
          notesInput.value = data.name;
        }

        showMessage(
          'Datos importados. Revisa fecha, duración, desnivel y distancia antes de guardar.',
          'success'
        );
      })
      .catch(function (error) {
        showMessage(error.message || 'No se pudo leer el archivo.', 'danger');
        input.value = '';
      });
  });
})();
