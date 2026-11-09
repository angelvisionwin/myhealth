'use strict';

const express = require('express');
const dashboardController = require('../controllers/dashboard.controller');

const router = express.Router();

router.get('/dashboard', dashboardController.getDashboard);

module.exports = router;
