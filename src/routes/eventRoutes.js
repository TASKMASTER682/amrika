import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
} from '../controllers/EventController.js';

const router = Router();

router.use(protect);

router.get('/', listEvents);
router.post('/', createEvent);
router.put('/:id', updateEvent);
router.delete('/:id', deleteEvent);

export default router;
