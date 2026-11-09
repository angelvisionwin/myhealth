'use strict';

const express = require('express');
const settingsController = require('../controllers/settings.controller');

const router = express.Router();

router.get('/settings/hevy', settingsController.getHevySettings);

module.exports = router;
