'use strict';

module.exports = function renderPage(req, res, next) {
  res.renderPage = (view, locals = {}) => {
    res.render(view, locals, (renderError, body) => {
      if (renderError) {
        return next(renderError);
      }

      return res.render('layouts/main', { ...locals, body }, (layoutError, html) => {
        if (layoutError) {
          return next(layoutError);
        }

        return res.type('html').send(html);
      });
    });
  };

  next();
};
