const express = require('express');
const controller = require('../controllers/question.controller');
const validate = require('../middleware/validate');
const { createQuestionSchema, updateQuestionSchema, questionQuerySchema } = require('../validators/questionValidators');
const { authenticate } = require('../middleware/auth');
const authorize = require('../middleware/authorize');

const router = express.Router();

const CONTENT_ROLES = ['content_manager', 'org_admin', 'super_admin'];
const REVIEW_ROLES = ['reviewer', 'org_admin', 'super_admin'];

router.use(authenticate);

router.get('/', validate(questionQuerySchema, 'query'), controller.list);
router.get('/:id', controller.getById);

router.post('/', authorize(...CONTENT_ROLES), validate(createQuestionSchema), controller.create);
router.patch('/:id', authorize(...CONTENT_ROLES), validate(updateQuestionSchema), controller.update);
router.delete('/:id', authorize(...CONTENT_ROLES), controller.remove);

router.post('/:id/submit-for-review', authorize(...CONTENT_ROLES), controller.submitForReview);
router.post('/:id/approve', authorize(...REVIEW_ROLES), controller.approve);
router.post('/:id/reject', authorize(...REVIEW_ROLES), controller.reject);

module.exports = router;
