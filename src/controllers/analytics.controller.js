const TestAttempt = require('../models/TestAttempt');
const { RevisionQueue } = require('../models/Engagement');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { computeTopicStats, computeOverallSummary, generateRecommendations } = require('../utils/ruleEngine');

/** Full analytics breakdown for a single completed attempt. */
const getAttemptAnalytics = asyncHandler(async (req, res) => {
  const attempt = await TestAttempt.findOne({ _id: req.params.attemptId, student: req.user.id }).populate({
    path: 'answers.question',
    select: 'topic subject difficulty avgSolvingTimeSec',
    populate: { path: 'topic', select: 'name' },
  });
  if (!attempt) throw ApiError.notFound('Attempt not found');
  if (attempt.status === 'in_progress') throw ApiError.badRequest('Attempt is not yet submitted');

  const rows = attempt.answers.map((a) => ({
    topic: a.question?.topic?.name || 'Unknown',
    isCorrect: !!a.isCorrect,
    isAttempted: a.status === 'answered' || a.status === 'answered_marked',
    timeTakenSec: a.timeTakenSec,
    avgSolvingTimeSec: a.question?.avgSolvingTimeSec || 60,
  }));

  const topicStats = computeTopicStats(rows);
  const overall = computeOverallSummary(rows);
  const recommendations = generateRecommendations(topicStats);

  new ApiResponse(200, {
    result: attempt.result,
    overall,
    topicStats,
    recommendations,
    timePerQuestion: attempt.answers.map((a) => a.timeTakenSec),
  }).send(res);
});

/**
 * Trend across a student's last N attempts on a given exam — powers the
 * "Performance Trend" and "Previous Attempt Comparison" screens without
 * re-deriving everything from raw answers each time (result is denormalized).
 */
const getPerformanceTrend = asyncHandler(async (req, res) => {
  const { exam } = req.query;
  const filter = { student: req.user.id, status: { $in: ['submitted', 'auto_submitted'] } };

  const attempts = await TestAttempt.find(filter)
    .populate({ path: 'test', select: 'title exam', match: exam ? { exam } : {} })
    .sort({ submittedAt: -1 })
    .limit(20)
    .lean();

  const trend = attempts
    .filter((a) => a.test) // drop attempts whose test didn't match the exam filter
    .map((a) => ({
      attemptId: a._id,
      testTitle: a.test.title,
      submittedAt: a.submittedAt,
      accuracy: a.result.accuracy,
      obtainedMarks: a.result.obtainedMarks,
      totalMarks: a.result.totalMarks,
    }))
    .reverse();

  new ApiResponse(200, { trend }).send(res);
});

/** Aggregates the handful of numbers the student dashboard needs into one call. */
const getDashboardSummary = asyncHandler(async (req, res) => {
  const studentId = req.user.id;

  const [recentAttempts, dueRevisionCount] = await Promise.all([
    TestAttempt.find({ student: studentId, status: { $in: ['submitted', 'auto_submitted'] } })
      .sort({ submittedAt: -1 })
      .limit(10)
      .select('result submittedAt test')
      .populate('test', 'title'),
    RevisionQueue.countDocuments({ student: studentId, status: { $in: ['pending', 'due'] }, dueAt: { $lte: new Date() } }),
  ]);

  const avgAccuracy = recentAttempts.length
    ? Math.round(
        (recentAttempts.reduce((sum, a) => sum + a.result.accuracy, 0) / recentAttempts.length) * 10
      ) / 10
    : 0;

  new ApiResponse(200, {
    testsCompleted: recentAttempts.length,
    averageAccuracy: avgAccuracy,
    pendingRevisionCount: dueRevisionCount,
    recentAttempts,
  }).send(res);
});

module.exports = { getAttemptAnalytics, getPerformanceTrend, getDashboardSummary };
