import TestAttempt from '../models/TestAttempt.js';
import Test from '../models/Test.js';
import { calculateAttemptAnalytics, getAdvancedAnalytics } from '../services/AnalyticsService.js';
import { queueFailedQuestions } from '../services/RevisionService.js';
import { canAttemptTest, getTestAvailability } from '../services/AccessService.js';
import { awardTestSubmission } from '../services/GamificationService.js';

// Server-side time enforcement (frontend timer is only visual).
const MINUTES_TO_MS = 60 * 1000;
const GRACE_MS = 60 * 1000; // buffer for network latency / auto-submit fired at time-0

// Authoritative remaining seconds for a timed test, computed from the server clock.
// Returns null for untimed tests (duration <= 0) — no enforcement.
const getAuthoritativeRemaining = (attempt, test) => {
  const durationSec = (test?.duration || 0) * 60;
  if (durationSec <= 0) return null;
  const started = attempt.startedAt ? new Date(attempt.startedAt).getTime() : Date.now();
  const elapsedSec = Math.max(0, Math.floor((Date.now() - started) / 1000));
  return Math.max(0, durationSec - elapsedSec);
};

// Computes the authoritative per-section remaining time from the server clock.
// Sections are attempted sequentially: each timed section owns a fixed window that
// starts when the previous section's window ends (or at test start for the first).
// Untimed sections (duration 0) consume no window, so the next timed section starts
// from the end of the last timed window.
const getAuthoritativeSectionTimes = (attempt, test) => {
  const sections = test?.sections || [];
  if (sections.length === 0) return [];
  const started = attempt.startedAt ? new Date(attempt.startedAt).getTime() : Date.now();
  const elapsedSec = Math.max(0, Math.floor((Date.now() - started) / 1000));

  // Build the cumulative schedule: windowStart[i] = sum of durations of all
  // timed sections before i.
  const limits = sections.map(sec => Number(sec.duration) > 0 ? Number(sec.duration) * 60 : 0);
  const windowStart = [];
  let acc = 0;
  for (let i = 0; i < limits.length; i++) {
    windowStart.push(acc);
    if (limits[i] > 0) acc += limits[i];
  }

  return limits.map((lim, i) => {
    if (lim <= 0) return 0; // no limit
    const spentInWindow = Math.max(0, elapsedSec - windowStart[i]);
    return Math.max(0, lim - spentInWindow);
  });
};

export const startTest = async (req, res, next) => {
  try {
    const { testId } = req.body;
    const studentId = req.user._id;

    // Check if test attempt limit exceeded
    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ success: false, message: 'Test not found' });
    }

    // Monetization gating (free window → free series → subscription/member → paid order)
    const hasAccess = await canAttemptTest(req.user, test);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        code: 'TEST_LOCKED',
        message: 'This test is locked. Subscribe or purchase it to unlock.',
      });
    }

    // Scheduled/live test window gating
    const availability = getTestAvailability(test);
    if (availability.status === 'scheduled') {
      return res.status(403).json({
        success: false,
        code: 'TEST_SCHEDULED',
        message: `This test opens on ${new Date(availability.opensAt).toLocaleString()}. Please return then.`,
      });
    }
    if (availability.status === 'expired') {
      return res.status(403).json({
        success: false,
        code: 'TEST_EXPIRED',
        message: 'This scheduled test has closed. No more attempts are allowed.',
      });
    }

    // Only count SUBMITTED attempts toward the limit.
    // Stale "In Progress" attempts (from browser crashes / abandoned sessions)
    // must NOT consume the limit — they are cleaned up below.
    const previousAttemptsCount = await TestAttempt.countDocuments({
      studentId,
      testId,
      status: 'Submitted'
    });

    console.log('[TestAttempt] Checking attempt limit:', { testId, studentId, testAttemptLimit: test.attemptLimit });
    console.log('[TestAttempt] Previous attempts count:', previousAttemptsCount);

    if (test.attemptLimit > 0 && previousAttemptsCount >= test.attemptLimit) {
      return res.status(400).json({
        success: false,
        code: 'LIMIT_EXCEEDED',
        message: `You have reached the maximum attempt limit of ${test.attemptLimit} for this test.`,
      });
    }

    // Check if there is an in-progress attempt to resume
    const existingInProgress = await TestAttempt.findOne({
      studentId,
      testId,
      status: 'In Progress',
    }).populate('answers.questionId');

    if (existingInProgress) {
      // Check if the existing attempt has expired (time ran out but was never submitted).
      // This happens when the user closes the browser / loses connection and the auto-submit
      // fails. Without this check the user would be stuck in a zombie session forever.
      const authRemaining = getAuthoritativeRemaining(existingInProgress, test);
      if (authRemaining !== null && authRemaining <= 0) {
        // Auto-submit the expired attempt so it leaves the "In Progress" limbo.
        const expiredId = existingInProgress._id.toString();
        try {
          // Re-fetch a clean document (no populate) to avoid Mongoose version conflicts.
          const fresh = await TestAttempt.findById(expiredId);
          if (fresh && fresh.status === 'In Progress') {
            await calculateAttemptAnalytics(expiredId);
            await queueFailedQuestions(fresh.studentId, fresh.answers);
          }
        } catch (autoErr) {
          console.warn('[startTest] Auto-submit of expired attempt failed:', autoErr.message);
          // If auto-submit fails, force-mark it submitted via findOneAndUpdate (bypasses version check).
          await TestAttempt.findOneAndUpdate(
            { _id: expiredId, status: 'In Progress' },
            { $set: { status: 'Submitted', submittedAt: new Date(), score: 0 } },
          );
        }
        // Fall through — do NOT return the expired attempt; continue to create a fresh one below.
      } else {
        // Attempt is still valid — resume it with authoritative server time.
        if (authRemaining !== null) existingInProgress.remainingSeconds = authRemaining;
        const authSectionTimes = getAuthoritativeSectionTimes(existingInProgress, test);
        if (authSectionTimes.length > 0) existingInProgress.sectionTimeLeft = authSectionTimes;
        return res.json({
          success: true,
          message: 'Resuming active session.',
          data: existingInProgress,
        });
      }
    }

    // Initialize list of questions
    const answers = [];
    test.sections.forEach(sec => {
      // Shuffle questions if enabled
      let questionIds = [...sec.questions];
      if (test.shuffleQuestions) {
        questionIds.sort(() => Math.random() - 0.5);
      }

      questionIds.forEach(qId => {
        answers.push({
          questionId: qId,
          sectionId: sec._id.toString(),
          selectedAnswer: [],
          status: 'Not Visited',
          timeSpent: 0,
        });
      });
    });

    // Per-section time limits (seconds). A section with duration 0 has no limit.
    const sectionTimeLeft = (test.sections || []).map(sec =>
      Number(sec.duration) > 0 ? Number(sec.duration) * 60 : 0
    );

    const attempt = await TestAttempt.create({
      studentId,
      testId,
      testSeriesId: test.testSeriesId || null,
      status: 'In Progress',
      remainingSeconds: test.duration * 60,
      answers,
      activeSectionIndex: 0,
      sectionTimeLeft,
      startedAt: new Date(),
    });

    await attempt.populate('answers.questionId');

    res.status(201).json({
      success: true,
      message: 'Test started successfully.',
      data: attempt,
    });
  } catch (error) {
    next(error);
  }
};

export const saveProgress = async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const { answers, remainingSeconds, activeSectionIndex, sectionTimeLeft } = req.body;

    const attempt = await TestAttempt.findById(attemptId);
    if (!attempt) {
      return res.status(404).json({ success: false, message: 'Test attempt session not found' });
    }

    if (attempt.studentId.toString() !== req.user._id.toString() && req.user.role === 'User') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    if (attempt.status !== 'In Progress') {
      return res.status(400).json({ success: false, message: 'This test attempt has already been submitted.' });
    }

    // Direct delta merge for answer updates to avoid data overwriting issues
    if (answers && Array.isArray(answers)) {
      answers.forEach(newAns => {
        const index = attempt.answers.findIndex(a => a.questionId.toString() === newAns.questionId.toString());
        if (index !== -1) {
          attempt.answers[index].selectedAnswer = newAns.selectedAnswer || [];
          attempt.answers[index].status = newAns.status || 'Not Visited';
          attempt.answers[index].timeSpent = newAns.timeSpent || 0;
        }
      });
    }

    // Clamp the client-supplied remaining time against the server clock so a
    // tampered payload can never extend the test beyond its real deadline.
    const test = await Test.findById(attempt.testId).select('duration sections');
    const authRemaining = getAuthoritativeRemaining(attempt, test);
    if (authRemaining !== null) {
      attempt.remainingSeconds = Math.min(Number(remainingSeconds) || 0, authRemaining);
    } else {
      attempt.remainingSeconds = remainingSeconds;
    }

    // Per-section time enforcement: derive from the server clock, never trust the client.
    const authSectionTimes = getAuthoritativeSectionTimes(attempt, test);
    if (authSectionTimes.length > 0) {
      const hasTimedSection = authSectionTimes.some(t => t > 0) || test?.sections?.some(s => Number(s.duration) > 0);
      // Honor a valid client-provided section index (used to render the active tab),
      // but cap it so it can never exceed the number of sections.
      const clientIdx = Number(activeSectionIndex) || 0;
      const maxIdx = Math.max(0, authSectionTimes.length - 1);
      // Auto-advance past any sections whose window has fully expired.
      let effIdx = Math.min(clientIdx, maxIdx);
      while (effIdx < maxIdx && authSectionTimes[effIdx] === 0 && Number(test.sections[effIdx]?.duration) > 0) {
        effIdx++;
      }
      // Only prevent going backwards when a timed section was active — with a
      // timed window already spent, the user must not slip back into it. Untimed
      // sections stay free to re-enter.
      if (hasTimedSection && effIdx < attempt.activeSectionIndex && Number(test.sections[attempt.activeSectionIndex]?.duration) > 0) {
        effIdx = attempt.activeSectionIndex;
      }
      attempt.activeSectionIndex = effIdx;
      attempt.sectionTimeLeft = authSectionTimes;
    } else {
      attempt.activeSectionIndex = activeSectionIndex;
      attempt.sectionTimeLeft = Array.isArray(sectionTimeLeft) ? sectionTimeLeft : [];
    }
    attempt.lastHeartbeat = new Date();

    await attempt.save();

    res.json({
      success: true,
      message: 'Progress saved successfully.',
      data: {
        activeSectionIndex: attempt.activeSectionIndex,
        sectionTimeLeft: attempt.sectionTimeLeft,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const submitTest = async (req, res, next) => {
  try {
    const { attemptId } = req.params;

    const attempt = await TestAttempt.findById(attemptId);
    if (!attempt) {
      return res.status(404).json({ success: false, message: 'Test attempt session not found' });
    }

    if (attempt.studentId.toString() !== req.user._id.toString() && req.user.role === 'User') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    if (attempt.status !== 'In Progress') {
      return res.status(400).json({ success: false, message: 'This test attempt has already been submitted.' });
    }

    // Server-side deadline enforcement — the frontend timer is only visual.
    const test = await Test.findById(attempt.testId).select('duration');
    const startedAt = attempt.startedAt ? new Date(attempt.startedAt).getTime() : null;
    const durationMs = (test?.duration || 0) * MINUTES_TO_MS;
    const isExpired = !!(startedAt && durationMs > 0 && Date.now() > startedAt + durationMs + GRACE_MS);
    if (isExpired) {
      console.warn('[submitTest] Time expired for attempt', attemptId, '— auto-submitting with current answers.');
    }

    // Call analytics service to score and finalize attempt
    const evaluatedAttempt = await calculateAttemptAnalytics(attemptId);

    // Queue failed questions in revision schedule
    await queueFailedQuestions(attempt.studentId, evaluatedAttempt.answers);

    // Gamification: award XP / streak / badges (non-blocking)
    let gamification = null;
    try {
      gamification = await awardTestSubmission({ userId: attempt.studentId, attemptId });
    } catch (gErr) { console.warn('Gamification failed:', gErr.message); }

    res.json({
      success: true,
      message: 'Test submitted successfully.',
      data: evaluatedAttempt,
      gamification,
    });
  } catch (error) {
    next(error);
  }
};

export const getAttemptResults = async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const attempt = await TestAttempt.findById(attemptId)
      .populate('answers.questionId')
      .populate('testId');

    if (!attempt) {
      return res.status(404).json({ success: false, message: 'Attempt not found' });
    }

    if (attempt.studentId.toString() !== req.user._id.toString() && req.user.role === 'User') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    if (attempt.status !== 'Submitted') {
      return res.status(400).json({ success: false, message: 'Results are only available for submitted tests.' });
    }

    // Fetch advanced stats breakdown
    const advanced = await getAdvancedAnalytics(attemptId);

    res.json({
      success: true,
      data: {
        attempt,
        analytics: advanced,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const cleanupOldUnsubmitted = async (req, res, next) => {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await TestAttempt.deleteMany({ status: 'In Progress', startedAt: { $lt: cutoff } });
    res.json({ success: true, message: `Deleted ${result.deletedCount || 0} old unsubmitted attempts.` });
  } catch (error) { next(error); }
};

export const listStudentHistory = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    // Use aggregation: group by testId, keep only the latest attempt per test
    const latestByTest = await TestAttempt.aggregate([
      { $match: { studentId: req.user._id, status: 'Submitted' } },
      { $sort: { submittedAt: -1 } },
      {
        $group: {
          _id: '$testId',
          attemptId: { $first: '$_id' },
          submittedAt: { $first: '$submittedAt' },
          score: { $first: '$score' },
          answers: { $first: '$answers' },
        },
      },
      { $sort: { submittedAt: -1 } },
      { $limit: limit },
    ]);

    // Populate test titles in one shot
    const testIds = latestByTest.map((a) => a._id);
    const tests = await Test.find({ _id: { $in: testIds } }).select('title').lean();
    const testMap = {};
    tests.forEach((t) => { testMap[t._id.toString()] = t.title; });

    // Check which attempts already have flashcards generated
    const Flashcard = (await import('../models/Flashcard.js')).default;
    const attemptIds = latestByTest.map((a) => a.attemptId);
    const existingCards = await Flashcard.aggregate([
      { $match: { userId: req.user._id, attemptId: { $in: attemptIds } } },
      { $group: { _id: '$attemptId', count: { $sum: 1 } } },
    ]);
    const cardCountMap = {};
    existingCards.forEach((c) => { cardCountMap[c._id?.toString() || 'null'] = c.count; });

    const data = latestByTest.map((h) => {
      const answers = h.answers || [];
      const wrongCount = answers.filter((a) => a.isCorrect === false && a.selectedAnswer?.length > 0).length;
      return {
        _id: h.attemptId,
        testId: { _id: h._id, title: testMap[h._id.toString()] || 'Unknown Test' },
        submittedAt: h.submittedAt,
        score: h.score,
        totalQuestions: answers.length,
        wrongCount,
        cardsGenerated: cardCountMap[h.attemptId.toString()] || 0,
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/**
 * Re-score a single attempt (admin only). Useful when scoring logic is updated.
 */
export const rescoreAttempt = async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const attempt = await TestAttempt.findById(attemptId);
    if (!attempt) {
      return res.status(404).json({ success: false, message: 'Attempt not found' });
    }

    const rescored = await calculateAttemptAnalytics(attemptId);

    res.json({
      success: true,
      message: 'Attempt re-scored successfully.',
      data: rescored,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Re-score ALL submitted attempts for a test (admin only).
 */
export const rescoreAllAttempts = async (req, res, next) => {
  try {
    const { testId } = req.params;
    const attempts = await TestAttempt.find({ testId, status: 'Submitted' });
    const results = [];

    for (const att of attempts) {
      try {
        const rescored = await calculateAttemptAnalytics(att._id);
        results.push({ attemptId: att._id.toString(), score: rescored.score, status: 'ok' });
      } catch (e) {
        results.push({ attemptId: att._id.toString(), status: 'error', message: e.message });
      }
    }

    res.json({
      success: true,
      message: `Re-scored ${results.length} attempts.`,
      data: results,
    });
  } catch (error) {
    next(error);
  }
};
