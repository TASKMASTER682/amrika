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
export const getWeakAreas = async (req, res, next) => {
  try {
    const attempts = await TestAttempt.find({
      studentId: req.user._id,
      status: 'Submitted',
    }).populate('answers.questionId', 'subject topic').lean();

    const topicStats = {};
    attempts.forEach(a => {
      (a.answers || []).forEach(ans => {
        const q = ans.questionId;
        if (!q) return;
        if (!topicStats[q.topic]) topicStats[q.topic] = { topic: q.topic, subject: q.subject, total: 0, attempted: 0, correct: 0 };
        topicStats[q.topic].total++;
        if (ans.selectedAnswer && ans.selectedAnswer.length > 0) {
          topicStats[q.topic].attempted++;
          if (ans.isCorrect) topicStats[q.topic].correct++;
        }
      });
    });

    const weak = Object.values(topicStats)
      .map(t => ({ ...t, accuracy: t.attempted > 0 ? (t.correct / t.attempted) * 100 : 0 }))
      .filter(t => t.attempted > 0 && t.accuracy < 50)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 10);

    res.json({ success: true, data: weak });
  } catch (error) {
    next(error);
  }
};

// Daily stats: today's attempts/questions, streak, avg score.
export const getDailyStats = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attempts = await TestAttempt.find({
      studentId: req.user._id,
      status: 'Submitted',
    }).sort({ submittedAt: -1 });

    const todayAttempts = attempts.filter(a => a.submittedAt && new Date(a.submittedAt) >= today);
    const questionsToday = todayAttempts.reduce((s, a) => s + (a.answers?.length || 0), 0);
    const timeSpentToday = todayAttempts.reduce((s, a) => s + (a.answers?.reduce((x, y) => x + (y.timeSpent || 0), 0) || 0), 0);
    const scoreAvg = attempts.length > 0
      ? Math.round(attempts.reduce((s, a) => s + a.score, 0) / attempts.length)
      : 0;

    // Streak: consecutive distinct days with a submitted attempt.
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
