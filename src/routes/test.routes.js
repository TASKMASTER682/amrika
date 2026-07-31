const express = require('express');
const controller = require('../controllers/test.controller');
const validate = require('../middleware/validate');
const { createTestSchema, updateTestSchema } = require('../validators/testValidators');
const { authenticate } = require('../middleware/auth');
const authorize = require('../middleware/authorize');

const router = express.Router();

const ADMIN_ROLES = ['content_manager', 'org_admin', 'super_admin'];

router.use(authenticate);

router.get('/', controller.list);
router.get('/:id', controller.getById);

router.post('/', authorize(...ADMIN_ROLES), validate(createTestSchema), controller.create);
router.patch('/:id', authorize(...ADMIN_ROLES), validate(updateTestSchema), controller.update);
router.delete('/:id', authorize(...ADMIN_ROLES), controller.remove);

router.post('/:id/publish', authorize(...ADMIN_ROLES), controller.publish);
router.post('/:id/unpublish', authorize(...ADMIN_ROLES), controller.unpublish);
router.post('/:id/clone', authorize(...ADMIN_ROLES), controller.clone);

module.exports = router;
