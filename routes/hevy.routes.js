'use strict';

const express = require('express');
const hevyController = require('../controllers/hevy.controller');

const router = express.Router();

router.get('/workouts', hevyController.listWorkouts);
router.get('/workouts/sync', hevyController.getSyncPage);
router.post('/workouts/sync', hevyController.syncWorkouts);
router.get('/workouts/:id', hevyController.showWorkout);

module.exports = router;
