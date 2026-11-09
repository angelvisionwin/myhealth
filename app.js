'use strict';

const path = require('node:path');
const express = require('express');

const settings = require('./config/settings');
require('./config/database');

const format = require('./utils/format');
const measurementParameters = require('./config/measurement-parameters');
const renderPage = require('./middleware/render-page');
const { notFoundHandler, errorHandler } = require('./middleware/error-handler');

const dashboardRoutes = require('./routes/dashboard.routes');
const hevyRoutes = require('./routes/hevy.routes');
const measurementsRoutes = require('./routes/measurements.routes');
const settingsRoutes = require('./routes/settings.routes');
const statsRoutes = require('./routes/stats.routes');
const coachRoutes = require('./routes/coach.routes');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(express.urlencoded({ extended: false, limit: '100kb' }));
// La subida de fotos comprimidas viaja como JSON; el resto de la app mantiene un límite pequeño.
app.use('/coach/photos', express.json({ limit: '8mb' }));
app.use(express.json({ limit: '100kb' }));

app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: settings.environment === 'production' ? '1d' : 0,
    setHeaders(res, filePath) {
      // El manifest y el service worker deben revalidarse para recibir cambios.
      if (filePath.endsWith(`${path.sep}sw.js`) || filePath.endsWith('.webmanifest')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  })
);

app.use((req, res, next) => {
  res.locals.appName = settings.appName;
  res.locals.currentPath = req.path;
  res.locals.currentYear = new Date().getFullYear();
  res.locals.environment = settings.environment;
  res.locals.fmt = format;
  res.locals.measurementParameters = measurementParameters.parameters;
  next();
});

app.use(renderPage);

app.get('/', (req, res) => res.redirect('/dashboard'));

app.use('/', dashboardRoutes);
app.use('/', hevyRoutes);
app.use('/', measurementsRoutes);
app.use('/', settingsRoutes);
app.use('/', statsRoutes);
app.use('/', coachRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

if (require.main === module) {
  const server = app.listen(settings.port, settings.host, () => {
    console.log(`[myhealth] Servidor iniciado en http://${settings.host}:${settings.port}`);
    console.log(`[myhealth] Base de datos: ${settings.databasePath}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(
        `[myhealth] El puerto ${settings.port} está ocupado. Cambia PORT en el fichero .env.`
      );
    } else {
      console.error('[myhealth] No se pudo iniciar el servidor:', error);
    }
    process.exitCode = 1;
  });
}

module.exports = app;
