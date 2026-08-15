import Question from '../models/Question.js';
import Test from '../models/Test.js';
import Enrollment from '../models/Enrollment.js';
import * as RecommendationService from '../services/RecommendationService.js';

/**
 * Subjects available for the Infinite Practice module — restricted to the
 * questions belonging to the user's ENROLLED test series. Unenrolled users get
 * an empty list (they should enroll in a series first).
 */
export const getPracticeSubjects = async (req, res, next) => {
  try {
    const enrollments = await Enrollment.find({ userId: req.user._id }).select('testSeriesId').lean();
    const seriesIds = enrollments.map((e) => e.testSeriesId);
    if (seriesIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const tests = await Test.find({ testSeriesId: { $in: seriesIds } }).select('sections').lean();
    const questionIds = new Set();
    for (const t of tests) {
      for (const section of t.sections || []) {
        for (const qid of section.questions || []) questionIds.add(String(qid));
      }
    }
    if (questionIds.size === 0) {
      return res.json({ success: true, data: [] });
    }

    const subjects = await Question.distinct('subject', {
      _id: { $in: [...questionIds] },
      active: true,
      approvalStatus: 'Approved',
      subject: { $ne: '' },
    });
    res.json({ success: true, data: subjects });
  } catch (error) {
    next(error);
  }
};

export const generatePracticeSet = async (req, res, next) => {
  try {
    const { subject, topic, difficulty, limit = 10 } = req.query;

    const filter = { active: true, approvalStatus: 'Approved' };
    if (subject) filter.subject = subject;
    if (topic) filter.topic = topic;
    if (difficulty) filter.difficulty = difficulty;

    // Use MongoDB aggregation to randomly select questions matching filter
    const questions = await Question.aggregate([
      { $match: filter },
      { $sample: { size: Number(limit) } }
    ]);

    res.json({
      success: true,
      data: questions,
    });
  } catch (error) {
    next(error);
  }
};

export const getRecommendations = async (req, res, next) => {
  try {
    const list = await RecommendationService.generateRecommendations(req.user._id);
    res.json({
      success: true,
      data: list,
    });
  } catch (error) {
    next(error);
  }
};
