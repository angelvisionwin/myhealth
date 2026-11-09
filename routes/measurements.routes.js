'use strict';

const express = require('express');
const measurementsController = require('../controllers/measurements.controller');

const router = express.Router();

router.get('/measurements', measurementsController.listMeasurements);
router.get('/measurements/new', measurementsController.getNewMeasurementPage);
router.post('/measurements/new', measurementsController.createMeasurement);
router.get('/measurements/:id/edit', measurementsController.getEditMeasurementPage);
router.post('/measurements/:id/edit', measurementsController.updateMeasurement);
router.get('/measurements/:id/delete', measurementsController.getDeleteMeasurementPage);
router.post('/measurements/:id/delete', measurementsController.deleteMeasurement);

module.exports = router;
