import express from 'express';
import * as BlogController from '../controllers/BlogController.js';
import { protect, optionalProtect, authorize } from '../middleware/auth.js';
import { validate, createBlogSchema, updateBlogSchema } from '../middleware/validate.js';

const router = express.Router();
const staffRoles = ['Super Admin', 'Content Manager', 'Support'];

// Public reads — published blogs are viewable without login (SEO / sharing).
router.get('/published', BlogController.listPublished);
router.get('/slug/:slug', BlogController.getBlogBySlug);
// Detail: anonymous users see published blogs; staff with a valid token also see drafts.
router.get('/:id', optionalProtect, BlogController.getBlogById);

// Staff CRUD + management
router.use(protect);
router.get('/', BlogController.listBlogs);
router.post('/', authorize(...staffRoles), validate(createBlogSchema), BlogController.createBlog);
router.put('/:id', authorize(...staffRoles), validate(updateBlogSchema), BlogController.updateBlog);
router.delete('/:id', authorize(...staffRoles), BlogController.deleteBlog);

export default router;