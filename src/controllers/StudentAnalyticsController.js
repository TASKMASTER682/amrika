import TestAttempt from '../models/TestAttempt.js';
import Question from '../models/Question.js';
import { getGamification } from '../services/GamificationService.js';

export const getMyGamification = async (req, res, next) => {
  try {
    const data = await getGamification(req.user._id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// Weak areas: topics where the student's accuracy is below 50% across all submitted attempts.
// Uses MongoDB aggregation pipeline for performance instead of loading all attempts into memory.
export const getWeakAreas = async (req, res, next) => {
  try {
    const weak = await TestAttempt.aggregate([
      { $match: { studentId: req.user._id, status: 'Submitted' } },
      { $unwind: '$answers' },
      { $match: { 'answers.selectedAnswer': { $exists: true, $ne: [], $ne: null } } },
      {
        $lookup: {
          from: 'questions',
          localField: 'answers.questionId',
          foreignField: '_id',
          as: 'question',
        },
      },
      { $unwind: { path: '$question', preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: '$question.topic',
          subject: { $first: '$question.subject' },
          total: { $sum: 1 },
          correct: { $sum: { $cond: ['$answers.isCorrect', 1, 0] } },
        },
      },
      {
        $addFields: {
          accuracy: { $cond: [{ $gt: ['$total', 0] }, { $multiply: [{ $divide: ['$correct', '$total'] }, 100] }, 0] },
        },
      },
      { $match: { accuracy: { $lt: 50 }, total: { $gte: 1 } } },
      { $sort: { accuracy: 1 } },
      { $limit: 10 },
      {
        $project: {
          _id: 0,
          topic: '$_id',
          subject: 1,
          total: 1,
          correct: 1,
          accuracy: 1,
        },
      },
    ]);

    res.json({ success: true, data: weak });
  } catch (error) {
    next(error);
  }
};

// Daily stats: today's attempts/questions, streak, avg score.
// Optimized to avoid loading all attempts into memory.
export const getDailyStats = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get today's attempts (only need today's data for daily stats)
    const todayAttempts = await TestAttempt.find({
      studentId: req.user._id,
      status: 'Submitted',
      submittedAt: { $gte: today },
    }).select('answers.timeSpent submittedAt').lean();

    const questionsToday = todayAttempts.reduce((s, a) => s + (a.answers?.length || 0), 0);
    const timeSpentToday = todayAttempts.reduce((s, a) => s + (a.answers?.reduce((x, y) => x + (y.timeSpent || 0), 0) || 0), 0);

    // For avg score and streak, we need all attempts but use lean + minimal fields
    const attempts = await TestAttempt.find({
      studentId: req.user._id,
      status: 'Submitted',
    }).populate('testId', 'sections').select('score submittedAt testId').lean();

    // Average score as a percentage of each test's maximum marks
    const pctScores = attempts
      .filter(a => a.testId && Array.isArray(a.testId.sections))
      .map(a => {
        const maxMarks = a.testId.sections.reduce(
          (s, sec) => s + ((sec.questions?.length || 0) * (sec.marksPerQuestion || 1)),
          0
        );
        return maxMarks > 0 ? (a.score / maxMarks) * 100 : null;
      })
      .filter(v => v !== null);
    const scoreAvg = pctScores.length > 0
      ? Math.round(pctScores.reduce((s, v) => s + v, 0) / pctScores.length)
      : 0;

    // Streak: consecutive distinct days with a submitted attempt
    let streak = 0;
    if (attempts.length > 0) {
      const days = new Set(attempts.map(a => new Date(a.submittedAt || a.createdAt).toDateString()));
      const cursor = new Date();
      cursor.setHours(0, 0, 0, 0);
      while (days.has(cursor.toDateString())) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      }
    }

    res.json({
      success: true,
      data: {
        streak,
        questionsToday,
        timeSpentToday,
        scoreAvg,
        testsToday: todayAttempts.length,
        totalTests: attempts.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Performance trend over the last N months (grouped by month).
export const getPerformanceTrend = async (req, res, next) => {
  try {
    const months = Math.min(parseInt(req.query.months, 10) || 6, 24);

    const attempts = await TestAttempt.find({
      studentId: req.user._id,
      status: 'Submitted',
      submittedAt: { $ne: null },
    })
      .populate('testId', 'title')
      .sort({ submittedAt: 1 });

    const buckets = {};
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      buckets[key] = { month: key, label: d.toLocaleString('en', { month: 'short', year: '2-digit' }), tests: 0, scoreSum: 0, accuracySum: 0, bestScore: null, avgScore: 0, avgAccuracy: 0 };
    }

    attempts.forEach(a => {
      const d = new Date(a.submittedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!buckets[key]) return;
      const b = buckets[key];
      b.tests++;
      b.scoreSum += a.score;
      b.accuracySum += a.accuracy || 0;
      if (b.bestScore === null || a.score > b.bestScore) b.bestScore = a.score;
    });

    const trend = Object.values(buckets).map(b => ({
      month: b.month,
      label: b.label,
      tests: b.tests,
      bestScore: b.bestScore,
      avgScore: b.tests > 0 ? Math.round(b.scoreSum / b.tests) : 0,
      avgAccuracy: b.tests > 0 ? Math.round(b.accuracySum / b.tests) : 0,
    }));

    res.json({ success: true, data: trend });
  } catch (error) {
    next(error);
  }
};
