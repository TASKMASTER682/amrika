import Flashcard from '../models/Flashcard.js';
import FlashcardSession from '../models/FlashcardSession.js';
import * as FlashcardService from '../services/FlashcardService.js';

export const generateFlashcards = async (req, res, next) => {
  try {
    const { attemptId } = req.body;
    if (!attemptId) {
      return res.status(400).json({ success: false, message: 'attemptId is required' });
    }

    const result = await FlashcardService.generateFromAttempt(req.user._id, attemptId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const getDeck = async (req, res, next) => {
  try {
    const { status = 'active', subject, dueOnly } = req.query;
    const filter = { userId: req.user._id };

    if (status) filter.status = status;
    if (subject) filter.subject = subject;
    if (dueOnly === 'true') {
      filter.nextReview = { $lte: new Date() };
    }

    const flashcards = await Flashcard.find(filter)
      .sort({ nextReview: 1 })
      .limit(100)
      .populate('attemptId', 'testId');

    res.json({ success: true, data: flashcards });
  } catch (error) {
    next(error);
  }
};

export const getDueCards = async (req, res, next) => {
  try {
    const { subject, limit = 20 } = req.query;
    const filter = {
      userId: req.user._id,
      status: 'active',
      nextReview: { $lte: new Date() },
    };
    if (subject) filter.subject = subject;

    const flashcards = await Flashcard.find(filter)
      .sort({ nextReview: 1 })
      .limit(parseInt(limit));

    res.json({ success: true, data: flashcards });
  } catch (error) {
    next(error);
  }
};

export const reviewCard = async (req, res, next) => {
  try {
    const { quality } = req.body;
    if (!quality || quality < 1 || quality > 5) {
      return res.status(400).json({ success: false, message: 'quality must be 1-5' });
    }

    const card = await FlashcardService.processReview(req.params.id, req.user._id, quality);
    res.json({ success: true, data: card });
  } catch (error) {
    next(error);
  }
};

export const reviewBatch = async (req, res, next) => {
  try {
    const { reviews } = req.body;
    if (!reviews || !Array.isArray(reviews) || reviews.length === 0) {
      return res.status(400).json({ success: false, message: 'reviews array required' });
    }

    const results = [];
    for (const r of reviews) {
      try {
        const card = await FlashcardService.processReview(r.cardId, req.user._id, r.quality);
        results.push({ cardId: r.cardId, success: true, card });
      } catch (err) {
        results.push({ cardId: r.cardId, success: false, error: err.message });
      }
    }

    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
};

export const getStats = async (req, res, next) => {
  try {
    const stats = await FlashcardService.getDeckStats(req.user._id);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
};

export const getSubjects = async (req, res, next) => {
  try {
    const subjects = await Flashcard.distinct('subject', { userId: req.user._id, status: 'active' });
    const subjectCounts = await Flashcard.aggregate([
      { $match: { userId: req.user._id, status: 'active' } },
      { $group: { _id: '$subject', total: { $sum: 1 }, due: { $sum: { $cond: [{ $lte: ['$nextReview', new Date()] }, 1, 0] } } } },
      { $sort: { due: -1 } },
    ]);
    res.json({ success: true, data: subjectCounts.map((s) => ({ subject: s._id || 'General', total: s.total, due: s.due })) });
  } catch (error) {
    next(error);
  }
};

export const deleteCard = async (req, res, next) => {
  try {
    const card = await Flashcard.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!card) return res.status(404).json({ success: false, message: 'Card not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (error) {
    next(error);
  }
};

export const deleteByAttempt = async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const result = await Flashcard.deleteMany({ userId: req.user._id, attemptId });
    res.json({ success: true, message: `Deleted ${result.deletedCount} cards`, data: { deletedCount: result.deletedCount } });
  } catch (error) {
    next(error);
  }
};

export const saveSession = async (req, res, next) => {
  try {
    const { cardsReviewed, correctCount, duration, subject } = req.body;
    const session = await FlashcardSession.create({
      userId: req.user._id,
      cardsReviewed: cardsReviewed || 0,
      correctCount: correctCount || 0,
      duration: duration || 0,
      subject: subject || '',
    });
    res.json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
};
