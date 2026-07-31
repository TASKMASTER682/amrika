const TestAttempt = require('../models/TestAttempt');
const { Test } = require('../models/Test');
const Question = require('../models/Question');
const { RevisionQueue } = require('../models/Engagement');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { computeOverallSummary, buildRevisionQueue } = require('../utils/ruleEngine');

/**
 * Remaining time is always derived from `startedAt`, never trusted from the
 * client and never just decremented on each request — that's what makes
 * "resume after refresh" and "resume after disconnect" work correctly:
 * however long the student was gone, the clock kept running server-side,
 * exactly like it would in a real exam hall.
 */
function computeRemainingSeconds(attempt, totalDurationSec) {
  const elapsed = Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000);
  return Math.max(0, totalDurationSec - elapsed);
}

/** Starts a fresh attempt, or resumes the existing in-progress one if it exists. */
const start = asyncHandler(async (req, res) => {
  const { testId } = req.params;
  const test = await Test.findById(testId);
  if (!test || !test.isPublished) throw ApiError.notFound('Test not found or not published');

  const existing = await TestAttempt.findOne({ student: req.user.id, test: testId, status: 'in_progress' });
  if (existing) {
    existing.remainingSeconds = computeRemainingSeconds(existing, test.totalDurationSec);
    if (existing.remainingSeconds <= 0) {
      return autoSubmitAttempt(existing, test, res);
    }
    return new ApiResponse(200, { attempt: existing, resumed: true }, 'Resumed in-progress attempt').send(res);
  }

  const attemptCount = await TestAttempt.countDocuments({ student: req.user.id, test: testId });
  if (attemptCount >= test.maxAttempts) throw ApiError.forbidden('Maximum attempts reached for this test');

  const answers = test.sections.flatMap((section) =>
    section.questions.map((questionId) => ({
      question: questionId,
      sectionName: section.name,
      status: 'not_visited',
    }))
  );

  const attempt = await TestAttempt.create({
    student: req.user.id,
    test: testId,
    attemptNumber: attemptCount + 1,
    answers,
    startedAt: new Date(),
    remainingSeconds: test.totalDurationSec,
    status: 'in_progress',
  });

  new ApiResponse(201, { attempt, resumed: false }, 'Attempt started').send(res);
});

/** Autosave — called on every Save & Next / Mark for Review / Clear Response. */
const saveAnswer = asyncHandler(async (req, res) => {
  const { attemptId } = req.params;
  const { questionIndex, selectedOptionIds, numericAnswer, status, timeTakenSec } = req.body;

  const attempt = await TestAttempt.findOne({ _id: attemptId, student: req.user.id, status: 'in_progress' });
  if (!attempt) throw ApiError.notFound('No in-progress attempt found');
  if (!attempt.answers[questionIndex]) throw ApiError.badRequest('Invalid question index');

  const answer = attempt.answers[questionIndex];
  if (!answer.firstVisitedAt) answer.firstVisitedAt = new Date();
  answer.selectedOptionIds = selectedOptionIds;
  answer.numericAnswer = numericAnswer;
  answer.status = status;
  answer.timeTakenSec += timeTakenSec;
  answer.lastSavedAt = new Date();

  attempt.currentQuestionIndex = questionIndex;
  attempt.lastActivityAt = new Date();
  await attempt.save();

  new ApiResponse(200, { saved: true }).send(res);
});

/** Lightweight resume/heartbeat read — frontend polls this to keep the timer authoritative. */
const getAttempt = asyncHandler(async (req, res) => {
  const attempt = await TestAttempt.findOne({ _id: req.params.attemptId, student: req.user.id }).populate({
    path: 'answers.question',
    select: 'text options type marks negativeMarks imageUrl',
  });
  if (!attempt) throw ApiError.notFound('Attempt not found');

  if (attempt.status === 'in_progress') {
    const test = await Test.findById(attempt.test).select('totalDurationSec');
    attempt.remainingSeconds = computeRemainingSeconds(attempt, test.totalDurationSec);
    if (attempt.remainingSeconds <= 0) {
      return autoSubmitAttempt(attempt, test, res);
    }
    await attempt.save();
  }

  new ApiResponse(200, { attempt }).send(res);
});

/** Student-initiated submit. */
const submit = asyncHandler(async (req, res) => {
  const attempt = await TestAttempt.findOne({ _id: req.params.attemptId, student: req.user.id, status: 'in_progress' });
  if (!attempt) throw ApiError.notFound('No in-progress attempt found');

  const test = await Test.findById(attempt.test);
  await scoreAndFinalize(attempt, test, 'submitted');

  new ApiResponse(200, { attempt }, 'Test submitted').send(res);
});

/** Shared by both the timer-expiry path and the explicit submit endpoint. */
async function scoreAndFinalize(attempt, test, finalStatus) {
  const questionIds = attempt.answers.map((a) => a.question);
  const questions = await Question.find({ _id: { $in: questionIds } }).lean();
  const questionMap = new Map(questions.map((q) => [q._id.toString(), q]));

  let obtainedMarks = 0;
  const analyticsRows = [];
  const incorrectQuestionIds = [];

  for (const answer of attempt.answers) {
    const question = questionMap.get(answer.question.toString());
    if (!question) continue;

    const isAttempted = answer.status === 'answered' || answer.status === 'answered_marked';
    let isCorrect = null;
    let marksAwarded = 0;

    if (isAttempted) {
      isCorrect = checkCorrectness(question, answer);
      marksAwarded = isCorrect ? question.marks : -question.negativeMarks;
      obtainedMarks += marksAwarded;
      if (!isCorrect) incorrectQuestionIds.push(question._id);
    }

    answer.isCorrect = isCorrect;
    answer.marksAwarded = marksAwarded;

    analyticsRows.push({
      topic: question.topic?.toString() || 'unknown',
      isCorrect: !!isCorrect,
      isAttempted,
      timeTakenSec: answer.timeTakenSec,
      avgSolvingTimeSec: question.avgSolvingTimeSec,
    });
  }

  const summary = computeOverallSummary(analyticsRows);

  attempt.status = finalStatus;
  attempt.submittedAt = new Date();
  attempt.remainingSeconds = 0;
  attempt.result = {
    totalMarks: test.totalMarks,
    obtainedMarks: Math.round(obtainedMarks * 100) / 100,
    accuracy: summary.accuracy,
    attemptRate: summary.attemptRate,
    correctCount: summary.correct,
    incorrectCount: summary.incorrect,
    skippedCount: summary.skipped,
  };
  await attempt.save();

  if (incorrectQuestionIds.length) {
    const queueRows = buildRevisionQueue(incorrectQuestionIds).map((row) => ({
      ...row,
      student: attempt.student,
      sourceAttempt: attempt._id,
    }));
    await RevisionQueue.insertMany(queueRows);
  }

  return attempt;
}

async function autoSubmitAttempt(attempt, test, res) {
  await scoreAndFinalize(attempt, test, 'auto_submitted');
  return new ApiResponse(200, { attempt, autoSubmitted: true }, 'Time expired — test auto-submitted').send(res);
}

/** Handles single/multiple-correct option matching and numeric-with-tolerance matching. */
function checkCorrectness(question, answer) {
  if (question.type === 'integer' || question.type === 'numerical') {
    if (answer.numericAnswer === undefined || answer.numericAnswer === null) return false;
    const tolerance = question.numericTolerance || 0;
    return Math.abs(answer.numericAnswer - question.correctNumericAnswer) <= tolerance;
  }

  const correctIds = question.options.filter((o) => o.isCorrect).map((o) => o._id.toString());
  const selectedIds = (answer.selectedOptionIds || []).map((id) => id.toString());
  if (correctIds.length !== selectedIds.length) return false;
  return correctIds.every((id) => selectedIds.includes(id));
}

module.exports = { start, saveAnswer, getAttempt, submit };
