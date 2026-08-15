import TestAttempt from '../models/TestAttempt.js';
import Test from '../models/Test.js';
import Question from '../models/Question.js';
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

    const previousAttemptsCount = await TestAttempt.countDocuments({
      studentId,
      testId,
      status: 'Submitted'
    });

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
      // Never resume with more time than the server clock allows.
      const authRemaining = getAuthoritativeRemaining(existingInProgress, test);
      if (authRemaining !== null) existingInProgress.remainingSeconds = authRemaining;
      return res.json({
        success: true,
        message: 'Resuming active session.',
        data: existingInProgress,
      });
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

    const attempt = await TestAttempt.create({
      studentId,
      testId,
      testSeriesId: test.testSeriesId || null,
      status: 'In Progress',
      remainingSeconds: test.duration * 60,
      answers,
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
    const { answers, remainingSeconds, activeSectionIndex } = req.body;

    const attempt = await TestAttempt.findById(attemptId);
    if (!attempt) {
      return res.status(404).json({ success: false, message: 'Test attempt session not found' });
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
    const test = await Test.findById(attempt.testId).select('duration');
    const authRemaining = getAuthoritativeRemaining(attempt, test);
    if (authRemaining !== null) {
      attempt.remainingSeconds = Math.min(Number(remainingSeconds) || 0, authRemaining);
    } else {
      attempt.remainingSeconds = remainingSeconds;
    }
    attempt.activeSectionIndex = activeSectionIndex;
    attempt.lastHeartbeat = new Date();

    await attempt.save();

    res.json({
      success: true,
      message: 'Progress saved successfully.',
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

    if (attempt.status !== 'In Progress') {
      return res.status(400).json({ success: false, message: 'This test attempt has already been submitted.' });
    }

    // Server-side deadline enforcement — the frontend timer is only visual.
    const test = await Test.findById(attempt.testId).select('duration');
    const startedAt = attempt.startedAt ? new Date(attempt.startedAt).getTime() : null;
    const durationMs = (test?.duration || 0) * MINUTES_TO_MS;
    if (startedAt && durationMs > 0 && Date.now() > startedAt + durationMs + GRACE_MS) {
      return res.status(400).json({
        success: false,
        code: 'TEST_TIME_EXPIRED',
        message: 'Your test time has expired. This attempt can no longer be submitted.',
      });
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

export const listStudentHistory = async (req, res, next) => {
  try {
    const history = await TestAttempt.find({ studentId: req.user._id, status: 'Submitted' })
      .populate('testId', 'title duration')
      .sort({ submittedAt: -1 });

    res.json({ success: true, data: history });
  } catch (error) {
    next(error);
  }
};
