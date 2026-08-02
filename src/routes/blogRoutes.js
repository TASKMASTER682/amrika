import express from 'express';
import * as BlogController from '../controllers/BlogController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();
const staffRoles = ['Super Admin', 'Content Manager', 'Support'];

// Public/published reads (any authenticated user)
router.get('/published', protect, BlogController.listPublished);
router.get('/slug/:slug', protect, BlogController.getBlogBySlug);

router.use(protect);

// Staff CRUD + management
router.get('/', BlogController.listBlogs);
router.get('/:id', BlogController.getBlogById);
router.post('/', authorize(...staffRoles), BlogController.createBlog);
router.put('/:id', authorize(...staffRoles), BlogController.updateBlog);
router.delete('/:id', authorize(...staffRoles), BlogController.deleteBlog);

export default router;
