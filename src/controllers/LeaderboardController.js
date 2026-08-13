import TestAttempt from '../models/TestAttempt.js';
import Test from '../models/Test.js';
import TestSeries from '../models/TestSeries.js';
import Enrollment from '../models/Enrollment.js';

export const getTestLeaderboard = async (req, res, next) => {
  try {
    const { testId } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const test = await Test.findById(testId).select('title testSeriesId');
    if (!test) return res.status(404).json({ success: false, message: 'Test not found.' });

    const attempts = await TestAttempt.find({ testId, status: 'Submitted' })
      .sort({ score: -1, submittedAt: 1 })
      .limit(limit)
      .populate('studentId', 'name');

    const entries = attempts.map((a, i) => ({
      rank: i + 1,
      studentId: a.studentId?._id,
      studentName: a.studentId?.name || 'Anonymous',
      isMe: a.studentId?._id && String(a.studentId._id) === String(req.user._id),
      score: a.score,
      accuracy: a.accuracy,
      percentile: a.percentile,
      attemptPercentage: a.attemptPercentage,
      submittedAt: a.submittedAt,
      attemptId: a._id,
    }));

    // Current user's position
    const myAttempt = await TestAttempt.findOne({
      testId,
      status: 'Submitted',
      studentId: req.user._id,
    }).sort({ score: -1, submittedAt: 1 });

    let myEntry = null;
    if (myAttempt) {
      const betterCount = await TestAttempt.countDocuments({
        testId,
        status: 'Submitted',
        $or: [
          { score: { $gt: myAttempt.score } },
          { score: myAttempt.score, submittedAt: { $lt: myAttempt.submittedAt } },
        ],
      });
      myEntry = {
        rank: betterCount + 1,
        score: myAttempt.score,
        accuracy: myAttempt.accuracy,
        percentile: myAttempt.percentile,
        submittedAt: myAttempt.submittedAt,
      };
    }

    res.json({
      success: true,
      data: {
        test: { _id: test._id, title: test.title, testSeriesId: test.testSeriesId },
        entries,
        myEntry,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getTestSeriesLeaderboard = async (req, res, next) => {
  try {
    const { testSeriesId } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const series = await TestSeries.findById(testSeriesId).select('title');
    if (!series) return res.status(404).json({ success: false, message: 'Test series not found.' });

    const tests = await Test.find({ testSeriesId, status: 'published' }).select('_id title');
    const testIds = tests.map(t => t._id);

    if (testIds.length === 0) {
      return res.json({ success: true, data: { series, tests: [], entries: [], myEntry: null } });
    }

    // Aggregate best score per student across all tests in the series
    const aggregated = await TestAttempt.aggregate([
      { $match: { testId: { $in: testIds }, status: 'Submitted' } },
      { $sort: { score: -1, submittedAt: 1 } },
      {
        $group: {
          _id: '$studentId',
          bestScore: { $first: '$score' },
          bestAccuracy: { $first: '$accuracy' },
          testsAttempted: { $sum: 1 },
          lastSubmittedAt: { $max: '$submittedAt' },
        },
      },
      { $sort: { bestScore: -1, lastSubmittedAt: 1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'student',
        },
      },
      { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          studentId: '$_id',
          studentName: { $ifNull: ['$student.name', 'Anonymous'] },
          bestScore: 1,
          bestAccuracy: 1,
          testsAttempted: 1,
          lastSubmittedAt: 1,
        },
      },
    ]);

    const entries = aggregated.map((e, i) => ({
      rank: i + 1,
      isMe: String(e.studentId) === String(req.user._id),
      ...e,
    }));

    // Current user's position in the series
    let myEntry = null;
    const myAgg = await TestAttempt.aggregate([
      {
        $match: {
          testId: { $in: testIds },
          status: 'Submitted',
          studentId: req.user._id,
        },
      },
      { $sort: { score: -1 } },
      { $group: { _id: '$studentId', bestScore: { $first: '$score' } } },
    ]);

    if (myAgg.length > 0) {
      const myBest = myAgg[0].bestScore;
      const betterCount = await TestAttempt.aggregate([
        { $match: { testId: { $in: testIds }, status: 'Submitted' } },
        { $sort: { score: -1, submittedAt: 1 } },
        { $group: { _id: '$studentId', bestScore: { $first: '$score' } } },
        { $match: { bestScore: { $gt: myBest } } },
        { $count: 'total' },
      ]);
      const rank = (betterCount[0]?.total || 0) + 1;
      const total = await TestAttempt.distinct('studentId', {
        testId: { $in: testIds },
        status: 'Submitted',
      });
      const percentile = total.length > 1 ? ((total.length - rank) / (total.length - 1)) * 100 : 100;
      myEntry = {
        rank,
        bestScore: myBest,
        percentile: Math.round(percentile * 100) / 100,
      };
    }

    res.json({
      success: true,
      data: { series, tests, entries, myEntry },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Leaderboard landing data: every test series the current user is enrolled in,
 * plus their standing (best rank / best score / attempts) inside each series.
 */
export const getMySeriesLeaderboards = async (req, res, next) => {
  try {
    const enrollments = await Enrollment.find({ userId: req.user._id })
      .populate({ path: 'testSeriesId', populate: { path: 'examId', select: 'name' } })
      .sort({ enrolledAt: -1 });

    const data = await Promise.all(
      enrollments.map(async (enrollment) => {
        const series = enrollment.testSeriesId;
        if (!series) return null;

        const tests = await Test.find({ testSeriesId: series._id, status: 'published' }).select('_id');
        const testIds = tests.map((t) => t._id);

        let myBestScore = null;
        let myRank = null;
        let testsAttempted = 0;
        let totalParticipants = 0;

        if (testIds.length > 0) {
          const aggregated = await TestAttempt.aggregate([
            { $match: { testId: { $in: testIds }, status: 'Submitted' } },
            { $sort: { score: -1, submittedAt: 1 } },
            { $group: { _id: '$studentId', bestScore: { $first: '$score' }, attempts: { $sum: 1 } } },
          ]);
          const ranked = [...aggregated].sort((a, b) => b.bestScore - a.bestScore);
          totalParticipants = ranked.length;
          for (let i = 0; i < ranked.length; i += 1) {
            if (String(ranked[i]._id) === String(req.user._id)) {
              myBestScore = Number(ranked[i].bestScore);
              myRank = i + 1;
              testsAttempted = ranked[i].attempts;
              break;
            }
          }
        }

        return {
          testSeriesId: series._id,
          title: series.title,
          examName: series.examId?.name || 'General',
          testsCount: testIds.length,
          testsAttempted,
          totalParticipants,
          myBestScore,
          myRank,
          hasAttempted: myRank != null,
        };
      })
    );

    res.json({ success: true, data: data.filter(Boolean) });
  } catch (error) {
    next(error);
  }
};
