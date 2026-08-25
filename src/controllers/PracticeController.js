import Question from '../models/Question.js';
import Test from '../models/Test.js';
import TestAttempt from '../models/TestAttempt.js';
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

    // If user has enrolled series, return subjects from those only
    if (seriesIds.length > 0) {
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
      return res.json({ success: true, data: subjects });
    }

    // Free users (no enrollment): return all subjects from active question bank
    const subjects = await Question.distinct('subject', {
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
    const { subject, topic, difficulty, limit: rawLimit = 10, questionIds } = req.query;

    // If specific question IDs are provided (e.g. wrong/slow questions from past attempts),
    // fetch those directly instead of random sampling.
    if (questionIds) {
      const ids = questionIds.split(',').filter(Boolean);
      if (ids.length === 0) {
        return res.json({ success: true, data: [] });
      }
      const questions = await Question.find({
        _id: { $in: ids },
        active: true,
        approvalStatus: 'Approved',
      }).select(
        'body options correctAnswer explanation type subject topic subtopic difficulty language statements matchPairs subQ context imageUrl marks negativeMarks tags avgSolvingTime year'
      );
      return res.json({ success: true, data: questions });
    }

    // Check if user is a free user (no active subscription AND no enrolled test series)
    const enrollments = await Enrollment.find({ userId: req.user._id }).select('testSeriesId').lean();
    const hasEnrollments = enrollments.length > 0;
    const hasActiveSub = req.user.subscription?.status === 'active' &&
      (!req.user.subscription?.expiresAt || new Date(req.user.subscription.expiresAt) > new Date());

    // Free users (no subscription, no enrolled series) are capped at 5 questions
    const limit = (!hasActiveSub && !hasEnrollments) ? Math.min(Number(rawLimit), 5) : Number(rawLimit);

    // Build the question pool: enrolled series questions for paid users, full bank for free users
    let filter = { active: true, approvalStatus: 'Approved' };

    if (hasEnrollments) {
      const seriesIds = enrollments.map((e) => e.testSeriesId);
      const tests = await Test.find({ testSeriesId: { $in: seriesIds } }).select('sections').lean();
      const enrolledQuestionIds = new Set();
      for (const t of tests) {
        for (const section of t.sections || []) {
          for (const qid of section.questions || []) enrolledQuestionIds.add(String(qid));
        }
      }
      if (enrolledQuestionIds.size > 0) {
        filter._id = { $in: [...enrolledQuestionIds] };
      }
    }
    // Free users: no _id filter → samples from entire active question bank
    if (subject) filter.subject = subject;
    if (topic) filter.topic = topic;
    if (difficulty) filter.difficulty = difficulty;

    const questions = await Question.aggregate([
      { $match: filter },
      { $sample: { size: Number(limit) } },
      {
        $project: {
          body: 1, options: 1, correctAnswer: 1, explanation: 1, type: 1,
          subject: 1, topic: 1, subtopic: 1,
          difficulty: 1, language: 1, statements: 1, matchPairs: 1, subQ: 1,
          context: 1, imageUrl: 1, marks: 1, negativeMarks: 1, tags: 1,
          avgSolvingTime: 1, year: 1,
        },
      },
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

/**
 * Fetch question IDs that the student got WRONG, optionally filtered by topic.
 * Returns the actual question objects so the practice page can use them directly.
 */
export const getWeakQuestions = async (req, res, next) => {
  try {
    const { topic, subject, limit = 10 } = req.query;

    const matchStage = {
      studentId: req.user._id,
      status: 'Submitted',
    };

    const pipeline = [
      { $match: matchStage },
      { $unwind: '$answers' },
      {
        $match: {
          'answers.isCorrect': false,
          'answers.selectedAnswer': { $exists: true, $ne: [], $ne: null },
        },
      },
      {
        $lookup: {
          from: 'questions',
          localField: 'answers.questionId',
          foreignField: '_id',
          as: 'question',
        },
      },
      { $unwind: { path: '$question', preserveNullAndEmptyArrays: false } },
      { $match: { 'question.active': true, 'question.approvalStatus': 'Approved' } },
    ];

    if (topic) pipeline.push({ $match: { 'question.topic': topic } });
    if (subject) pipeline.push({ $match: { 'question.subject': subject } });

    pipeline.push(
      { $group: { _id: '$answers.questionId' } },
      { $limit: Number(limit) },
      {
        $lookup: {
          from: 'questions',
          localField: '_id',
          foreignField: '_id',
          as: 'questionData',
        },
      },
      { $unwind: '$questionData' },
      {
        $project: {
          _id: 0,
          questionId: '$_id',
          body: '$questionData.body',
          options: '$questionData.options',
          correctAnswer: '$questionData.correctAnswer',
          explanation: '$questionData.explanation',
          type: '$questionData.type',
          subject: '$questionData.subject',
          topic: '$questionData.topic',
          subtopic: '$questionData.subtopic',
          difficulty: '$questionData.difficulty',
          language: '$questionData.language',
          statements: '$questionData.statements',
          matchPairs: '$questionData.matchPairs',
          subQ: '$questionData.subQ',
          context: '$questionData.context',
          imageUrl: '$questionData.imageUrl',
          marks: '$questionData.marks',
          negativeMarks: '$questionData.negativeMarks',
          tags: '$questionData.tags',
          avgSolvingTime: '$questionData.avgSolvingTime',
          year: '$questionData.year',
        },
      }
    );

    const questions = await TestAttempt.aggregate(pipeline);
    res.json({ success: true, data: questions });
  } catch (error) {
    next(error);
  }
};

/**
 * Fetch question IDs where the student spent too much time, optionally filtered by topic.
 * Threshold: avgSolvingTime * 1.5 or 90 seconds, whichever is higher.
 */
export const getSlowQuestions = async (req, res, next) => {
  try {
    const { topic, subject, limit = 10 } = req.query;

    const pipeline = [
      { $match: { studentId: req.user._id, status: 'Submitted' } },
      { $unwind: '$answers' },
      {
        $match: {
          'answers.selectedAnswer': { $exists: true, $ne: [], $ne: null },
          'answers.timeSpent': { $gt: 0 },
        },
      },
      {
        $lookup: {
          from: 'questions',
          localField: 'answers.questionId',
          foreignField: '_id',
          as: 'question',
        },
      },
      { $unwind: { path: '$question', preserveNullAndEmptyArrays: false } },
      { $match: { 'question.active': true, 'question.approvalStatus': 'Approved' } },
    ];

    if (topic) pipeline.push({ $match: { 'question.topic': topic } });
    if (subject) pipeline.push({ $match: { 'question.subject': subject } });

    pipeline.push(
      {
        $group: {
          _id: '$answers.questionId',
          avgTime: { $avg: '$answers.timeSpent' },
          questionData: { $first: '$question' },
        },
      },
      {
        $match: {
          $expr: {
            $gt: ['$avgTime', { $max: [90, { $multiply: ['$questionData.avgSolvingTime', 1.5] }] }],
          },
        },
      },
      { $sort: { avgTime: -1 } },
      { $limit: Number(limit) },
      {
        $project: {
          _id: 0,
          questionId: '$_id',
          body: '$questionData.body',
          options: '$questionData.options',
          correctAnswer: '$questionData.correctAnswer',
          explanation: '$questionData.explanation',
          type: '$questionData.type',
          subject: '$questionData.subject',
          topic: '$questionData.topic',
          subtopic: '$questionData.subtopic',
          difficulty: '$questionData.difficulty',
          language: '$questionData.language',
          statements: '$questionData.statements',
          matchPairs: '$questionData.matchPairs',
          subQ: '$questionData.subQ',
          context: '$questionData.context',
          imageUrl: '$questionData.imageUrl',
          marks: '$questionData.marks',
          negativeMarks: '$questionData.negativeMarks',
          tags: '$questionData.tags',
          avgSolvingTime: '$questionData.avgSolvingTime',
          year: '$questionData.year',
        },
      }
    );

    const questions = await TestAttempt.aggregate(pipeline);
    res.json({ success: true, data: questions });
  } catch (error) {
    next(error);
  }
};
