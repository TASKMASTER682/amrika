const express = require('express');
const controller = require('../controllers/testAttempt.controller');
const validate = require('../middleware/validate');
const { saveAnswerSchema } = require('../validators/testValidators');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.post('/start/:testId', controller.start);
router.get('/:attemptId', controller.getAttempt);
router.patch('/:attemptId/answer', validate(saveAnswerSchema), controller.saveAnswer);
router.post('/:attemptId/submit', controller.submit);

module.exports = router;
