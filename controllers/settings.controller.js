'use strict';

const settings = require('../config/settings');
const syncHistoryModel = require('../models/sync-history.model');

function getHevySettings(req, res, next) {
  try {
    const lastSync = syncHistoryModel.getLatest('hevy');

    res.renderPage('settings/hevy', {
      activeNav: 'settings',
      pageTitle: 'Integración con Hevy',
      pageSubtitle: 'Estado de la configuración local',
      breadcrumbs: [
        { label: 'Configuración' },
        { label: 'Integración Hevy' }
      ],
      apiKeyConfigured: settings.hevy.isConfigured,
      lastSync
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getHevySettings
};
