import express from 'express';
import * as BookmarkController from '../controllers/BookmarkController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.post('/', BookmarkController.createBookmark);
router.delete('/:questionId', BookmarkController.deleteBookmark);
router.get('/', BookmarkController.getBookmarks);
router.get('/folders', BookmarkController.getFolders);

export default router;
