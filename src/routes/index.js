const express = require('express');

const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/questions', require('./question.routes'));
router.use('/tests', require('./test.routes'));
router.use('/attempts', require('./testAttempt.routes'));
router.use('/analytics', require('./analytics.routes'));
router.use('/bookmarks', require('./bookmark.routes'));
router.use(require('./public.routes'));

router.get('/health', (req, res) => res.json({ success: true, message: 'ExamOS API is healthy' }));

module.exports = router;
