const express = require('express');
const router = express.Router();

// Lazy-loaded ES module controllers
let AgencyCtrl, ExamCtrl, TestSeriesCtrl;
async function load() {
  if (!AgencyCtrl) AgencyCtrl = await import('../controllers/AgencyController.js');
  if (!ExamCtrl) ExamCtrl = await import('../controllers/ExamController.js');
  if (!TestSeriesCtrl) TestSeriesCtrl = await import('../controllers/TestSeriesController.js');
}

// --- Agencies ---
router.get('/agencies', async (req, res, next) => {
  try { await load(); await AgencyCtrl.listAgencies(req, res, next); } catch (e) { next(e); }
});
router.get('/agencies/:id', async (req, res, next) => {
  try { await load(); await AgencyCtrl.getAgencyById(req, res, next); } catch (e) { next(e); }
});

// --- Exams ---
router.get('/exams', async (req, res, next) => {
  try { await load(); await ExamCtrl.listExams(req, res, next); } catch (e) { next(e); }
});
router.get('/exams/:id', async (req, res, next) => {
  try { await load(); await ExamCtrl.getExamById(req, res, next); } catch (e) { next(e); }
});

// --- Test Series ---
router.get('/test-series', async (req, res, next) => {
  try { await load(); await TestSeriesCtrl.listTestSeries(req, res, next); } catch (e) { next(e); }
});
router.get('/test-series/:id', async (req, res, next) => {
  try { await load(); await TestSeriesCtrl.getTestSeriesById(req, res, next); } catch (e) { next(e); }
});

module.exports = router;
