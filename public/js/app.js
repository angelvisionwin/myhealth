(function () {
  'use strict';

  var root = document.documentElement;
  var toggle = document.getElementById('theme-toggle');

  if (toggle) {
    toggle.addEventListener('click', function () {
      var nextTheme = root.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-bs-theme', nextTheme);

      try {
        localStorage.setItem('myhealth-theme', nextTheme);
      } catch (error) {
        // La preferencia no se puede guardar (modo privado); el cambio sigue aplicándose.
      }
    });
  }

  var syncForm = document.getElementById('hevy-sync-form');
  if (syncForm) {
    syncForm.addEventListener('submit', function () {
      var button = document.getElementById('hevy-sync-button');

      if (button) {
        button.disabled = true;
        button.innerHTML =
          '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Sincronizando…';
      }
    });
  }

  registerServiceWorker();

  function registerServiceWorker() {
    // Sin contexto seguro (por ejemplo, HTTP en la red local) el registro no es posible;
    // la aplicación sigue funcionando igual contra el servidor.
    if (!('serviceWorker' in navigator) || !window.isSecureContext) {
      return;
    }

    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {
        // Un fallo al registrar el service worker no debe romper la navegación.
      });
    });
  }
})();
