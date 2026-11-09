'use strict';

const createHttpError = require('../utils/http-error');

function notFoundHandler(req, res, next) {
  next(createHttpError(404, 'Página no encontrada'));
}

function errorHandler(error, req, res, next) {
  const status =
    Number.isInteger(error.status) && error.status >= 400 && error.status < 600
      ? error.status
      : 500;

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`);
    console.error(error);
  }

  if (res.headersSent) {
    return next(error);
  }

  const isNotFound = status === 404;
  const view = isNotFound ? 'errors/404' : 'errors/500';

  if (typeof res.renderPage === 'function') {
    return res.status(status).renderPage(view, {
      activeNav: '',
      pageTitle: isNotFound ? 'Página no encontrada' : 'No se pudo completar la solicitud',
      pageSubtitle: '',
      breadcrumbs: [],
      statusCode: status
    });
  }

  return res.status(status).type('text/plain').send('Error interno');
}

module.exports = {
  notFoundHandler,
  errorHandler
};
