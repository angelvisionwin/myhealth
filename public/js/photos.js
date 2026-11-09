(function () {
  'use strict';

  var form = document.getElementById('photo-form');
  var fileInput = document.getElementById('photo-file');
  var preview = document.getElementById('photo-preview');
  var previewWrap = document.getElementById('photo-preview-wrap');
  var message = document.getElementById('photo-message');
  var submit = document.getElementById('photo-submit');

  if (!form || !fileInput || !preview || !previewWrap || !message || !submit) {
    return;
  }

  var imageData = null;
  var MAX_SOURCE_BYTES = 12 * 1024 * 1024;
  var MAX_SIZE = 1600;

  function showError(text) {
    message.textContent = text;
    message.classList.remove('d-none');
  }

  function clearError() {
    message.textContent = '';
    message.classList.add('d-none');
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var image = new Image();

      image.onload = function () {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('No se pudo leer la imagen.'));
      };
      image.src = url;
    });
  }

  function compress(file) {
    return loadImage(file).then(function (image) {
      var scale = Math.min(1, MAX_SIZE / Math.max(image.width, image.height));
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));

      var context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      // El canvas vuelve a codificar en JPEG y descarta los metadatos EXIF.
      return canvas.toDataURL('image/jpeg', 0.85);
    });
  }

  fileInput.addEventListener('change', function () {
    clearError();
    imageData = null;

    var file = fileInput.files && fileInput.files[0];
    if (!file) {
      previewWrap.classList.add('d-none');
      return;
    }

    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      showError('Formato no admitido. Usa JPEG, PNG o WebP.');
      fileInput.value = '';
      previewWrap.classList.add('d-none');
      return;
    }

    if (file.size > MAX_SOURCE_BYTES) {
      showError('La imagen original supera los 12 MB.');
      fileInput.value = '';
      previewWrap.classList.add('d-none');
      return;
    }

    compress(file)
      .then(function (dataUrl) {
        imageData = dataUrl;
        preview.src = dataUrl;
        previewWrap.classList.remove('d-none');
      })
      .catch(function () {
        showError('No se pudo procesar la imagen.');
      });
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    clearError();

    if (!imageData) {
      showError('Selecciona una imagen primero.');
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Guardando…';

    fetch('/coach/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        photo_date: form.querySelector('#photo-date').value,
        weight_kg: form.querySelector('#photo-weight').value,
        notes: form.querySelector('#photo-notes').value,
        imageData: imageData
      })
    })
      .then(function (response) {
        return response.json().then(function (data) {
          return { ok: response.ok, data: data };
        });
      })
      .then(function (result) {
        if (result.ok && result.data.ok) {
          window.location.href = result.data.redirect;
          return;
        }

        var errors = result.data && result.data.errors ? result.data.errors : ['No se pudo guardar la foto.'];
        showError(errors.join(' '));
        submit.disabled = false;
        submit.textContent = 'Guardar foto';
      })
      .catch(function () {
        showError('No se pudo conectar con el servidor.');
        submit.disabled = false;
        submit.textContent = 'Guardar foto';
      });
  });
})();
