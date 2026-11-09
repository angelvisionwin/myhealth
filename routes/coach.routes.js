'use strict';

const express = require('express');
const coachController = require('../controllers/coach.controller');
const coachExportController = require('../controllers/coach-export.controller');

const router = express.Router();

router.get('/coach', coachController.getCoachIndex);
router.get('/coach/progress', coachController.getProgress);
router.get('/coach/plan', coachController.getPlan);
router.get('/coach/plan/routines', coachController.getPlanRoutineUpdates);
router.post('/coach/plan/routines', coachController.postApplyPlanRoutineUpdates);
router.get('/coach/profile', coachController.getProfile);
router.post('/coach/profile', coachController.postProfile);
router.get('/coach/checkin', coachController.getCheckin);
router.post('/coach/checkin', coachController.postCheckin);
router.get('/coach/checkin/:id/delete', coachController.getDeleteCheckin);
router.post('/coach/checkin/:id/delete', coachController.postDeleteCheckin);
router.get('/coach/exercises', coachController.getExerciseSettings);
router.post('/coach/exercises', coachController.postExerciseSettings);
router.get('/coach/hiking', coachController.getHiking);
router.post('/coach/hiking', coachController.postHiking);
router.get('/coach/hiking/:id/edit', coachController.getEditHiking);
router.post('/coach/hiking/:id/edit', coachController.postEditHiking);
router.get('/coach/hiking/:id/delete', coachController.getDeleteHiking);
router.post('/coach/hiking/:id/delete', coachController.postDeleteHiking);
router.get('/coach/photos', coachController.getPhotos);
router.post('/coach/photos', coachController.postPhoto);
router.get('/coach/photos/:id/file', coachController.getPhotoFile);
router.get('/coach/photos/:id/delete', coachController.getDeletePhoto);
router.post('/coach/photos/:id/delete', coachController.postDeletePhoto);
router.get('/coach/routines', coachController.getRoutines);
router.get('/coach/routines/:id', coachController.getRoutine);
router.post('/coach/routines/sync', coachController.postSyncRoutines);
router.get('/coach/history', coachController.getHistory);
router.post('/coach/reports', coachController.postGenerateReport);
router.get('/coach/reports/:id', coachController.getReport);
router.post('/coach/reports/:id/ai', coachController.postReportAi);

router.get('/coach/export', coachExportController.getExport);
router.get('/coach/export.json', coachExportController.getExportJson);
router.get('/coach/export.csv', coachExportController.getExportCsv);
router.post('/coach/backup', coachExportController.postBackup);
router.get('/coach/backup/:file', coachExportController.getBackupFile);

module.exports = router;
