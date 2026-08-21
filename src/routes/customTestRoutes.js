import express from 'express';
import { protect } from '../middleware/auth.js';
import Question from '../models/Question.js';
import Exam from '../models/Exam.js';
import Agency from '../models/Agency.js';
import TestSeries from '../models/TestSeries.js';
import Enrollment from '../models/Enrollment.js';
import User from '../models/User.js';
import mongoose from 'mongoose';

const router = express.Router();

// All custom test routes require authentication
router.use(protect);

// GET /api/custom-tests/access — check if user can use custom test feature
// Access = has active subscription OR has at least one test series enrollment
router.get('/access', async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('subscription').lean();
    const hasSubscription = user.subscription?.status === 'active';
    let hasEnrollment = false;
    if (!hasSubscription) {
      const count = await Enrollment.countDocuments({ userId: req.user._id });
      hasEnrollment = count > 0;
    }
    const hasAccess = hasSubscription || hasEnrollment;
    res.json({
      success: true,
      data: { hasAccess, hasSubscription, hasEnrollment },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/custom-tests/setup — all active agencies, exams, and subjects
// Query params: ?agencyId=X&examId=Y (optional, filters next step)
router.get('/setup', async (req, res, next) => {
  try {
    // Step 1: All active agencies
    const agencies = await Agency.find({ active: true })
      .select('name code')
      .sort({ name: 1 })
      .lean();

    // Step 2: Exams — all active, optionally filtered by agency
    const examFilter = { active: true };
    if (req.query.agencyId) {
      examFilter.agencyId = req.query.agencyId;
    }
    const exams = await Exam.find(examFilter)
      .select('name code agencyId')
      .sort({ name: 1 })
      .lean();

    // Step 3: Subjects — find through TestSeries → Test → Questions chain
    let subjects = [];
    if (req.query.examId) {
      // Find test series for this exam
      const seriesIds = await TestSeries.find({ examId: req.query.examId })
        .select('_id').lean().then((ss) => ss.map((s) => s._id));

      if (seriesIds.length > 0) {
        // Find tests in those series, collect all question IDs
        const TestModel = mongoose.model('Test');
        const tests = await TestModel.find({ testSeriesId: { $in: seriesIds } })
          .select('sections.questions').lean();

        const questionIds = [];
        for (const test of tests) {
          for (const sec of (test.sections || [])) {
            for (const q of (sec.questions || [])) {
              const qid = q.questionId || q;
              if (qid) questionIds.push(qid);
            }
          }
        }

        if (questionIds.length > 0) {
          subjects = await Question.distinct('subject', {
            _id: { $in: questionIds },
            active: true,
            subject: { $ne: '' },
          });
        }
      }

      // Fallback: if no subjects from chain, try direct examId on questions
      if (subjects.length === 0) {
        subjects = await Question.distinct('subject', {
          examId: req.query.examId,
          active: true,
          subject: { $ne: '' },
        });
      }
    } else if (req.query.agencyId) {
      // Filter by agency through test series
      const seriesIds = await TestSeries.find({ agencyId: req.query.agencyId })
        .select('_id').lean().then((ss) => ss.map((s) => s._id));

      if (seriesIds.length > 0) {
        const TestModel = mongoose.model('Test');
        const tests = await TestModel.find({ testSeriesId: { $in: seriesIds } })
          .select('sections.questions').lean();

        const questionIds = [];
        for (const test of tests) {
          for (const sec of (test.sections || [])) {
            for (const q of (sec.questions || [])) {
              const qid = q.questionId || q;
              if (qid) questionIds.push(qid);
            }
          }
        }

        if (questionIds.length > 0) {
          subjects = await Question.distinct('subject', {
            _id: { $in: questionIds },
            active: true,
            subject: { $ne: '' },
          });
        }
      }

      if (subjects.length === 0) {
        subjects = await Question.distinct('subject', {
          agencyId: req.query.agencyId,
          active: true,
          subject: { $ne: '' },
        });
      }
    } else {
      // No filter — show all subjects from question bank
      subjects = await Question.distinct('subject', {
        active: true,
        subject: { $ne: '' },
      });
    }

    // Final fallback: parse [SUBJ] tags from question bodies
    if (subjects.length === 0) {
      const bodyFilter = { active: true, approvalStatus: 'Approved' };
      if (req.query.examId) bodyFilter.examId = req.query.examId;
      else if (req.query.agencyId) bodyFilter.agencyId = req.query.agencyId;

      const questionsWithBody = await Question.find(bodyFilter)
        .select('body')
        .limit(500)
        .lean();

      const tagSubjects = new Set();
      for (const q of questionsWithBody) {
        const match = String(q.body || '').match(/\[SUBJ\]\s*(.+)/i);
        if (match) {
          const s = match[1].trim();
          if (s) tagSubjects.add(s);
        }
      }
      subjects = [...tagSubjects].sort();
    }

    res.json({
      success: true,
      data: {
        agencies: agencies.map((a) => ({ ...a, _id: a._id.toString() })),
        exams: exams.map((e) => ({ ...e, _id: e._id.toString() })),
        subjects: subjects.sort(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/custom-tests/create — generate a random test (returns questions, no DB write)
// Body: { examId, subject, count (max 30), timeMinutes }
router.post('/create', async (req, res, next) => {
  try {
    const { examId, subject, count, timeMinutes } = req.body;

    if (!examId || !subject) {
      return res.status(400).json({ success: false, message: 'examId and subject are required.' });
    }
    const questionCount = Math.min(Math.max(parseInt(count, 10) || 10, 1), 30);
    const time = Math.min(Math.max(parseInt(timeMinutes, 10) || 30, 5), 180);

    // Verify the exam exists
    const exam = await Exam.findById(examId).select('name code').lean();
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found.' });
    }

    // Find question IDs through TestSeries → Test → Questions chain
    const seriesIds = await TestSeries.find({ examId: exam._id })
      .select('_id').lean().then((ss) => ss.map((s) => s._id));

    let questionPoolFilter = { active: true, approvalStatus: 'Approved', subject, difficulty: { $in: ['Easy', 'Medium'] } };

    if (seriesIds.length > 0) {
      const TestModel = mongoose.model('Test');
      const tests = await TestModel.find({ testSeriesId: { $in: seriesIds } })
        .select('sections.questions').lean();

      const questionIds = [];
      for (const test of tests) {
        for (const sec of (test.sections || [])) {
          for (const q of (sec.questions || [])) {
            const qid = q.questionId || q;
            if (qid) questionIds.push(qid);
          }
        }
      }

      if (questionIds.length > 0) {
        questionPoolFilter._id = { $in: questionIds };
      }
    } else {
      // Fallback: try direct examId
      questionPoolFilter.examId = exam._id;
    }

    // Randomly select Easy + Medium questions
    const questions = await Question.aggregate([
      { $match: questionPoolFilter },
      { $sample: { size: questionCount } },
      {
        $project: {
          body: 1, options: 1, type: 1, subject: 1, topic: 1,
          difficulty: 1, marks: 1, negativeMarks: 1, imageUrl: 1,
          language: 1, context: 1, statements: 1, matchPairs: 1,
        },
      },
    ]);

    if (questions.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No Easy/Medium questions found for "${subject}" in ${exam.name}. Try a different subject.`,
      });
    }

    // Return questions without correctAnswer — client never sees answers
    res.json({
      success: true,
      data: {
        examId: exam._id.toString(),
        examName: exam.name,
        subject,
        questions: questions.map((q) => ({
          _id: q._id.toString(),
          body: q.body,
          options: q.options,
          type: q.type,
          subject: q.subject,
          topic: q.topic,
          difficulty: q.difficulty,
          marks: q.marks || 1,
          negativeMarks: q.negativeMarks || 0,
          imageUrl: q.imageUrl || null,
          language: q.language,
          context: q.context || null,
          statements: q.statements || [],
          matchPairs: q.matchPairs || [],
        })),
        totalQuestions: questions.length,
        timeMinutes: time,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/custom-tests/submit — grade a custom test (no DB save)
// Body: { examId, subject, timeMinutes, timeTakenSeconds, answers: [{ questionId, selectedAnswer }] }
router.post('/submit', async (req, res, next) => {
  try {
    const { examId, subject, timeMinutes, timeTakenSeconds, answers } = req.body;

    if (!examId || !subject || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid submission data.' });
    }

    const questionIds = answers.map((a) => a.questionId).filter(Boolean);
    if (questionIds.length === 0) {
      return res.status(400).json({ success: false, message: 'No answers provided.' });
    }

    // Fetch questions from DB to verify correct answers
    const questions = await Question.find({ _id: { $in: questionIds } })
      .select('correctAnswer marks negativeMarks')
      .lean();

    const questionMap = {};
    for (const q of questions) {
      questionMap[q._id.toString()] = q;
    }

    let correct = 0;
    let incorrect = 0;
    let unattempted = 0;
    let totalMarks = 0;
    let maxMarks = 0;

    const results = answers.map((a) => {
      const q = questionMap[a.questionId];
      if (!q) return { questionId: a.questionId, status: 'unattempted', marks: 0 };

      const selected = Array.isArray(a.selectedAnswer) ? a.selectedAnswer : [];
      const correctAns = q.correctAnswer || [];
      const marks = q.marks || 1;
      const neg = q.negativeMarks || 0;
      maxMarks += marks;

      if (selected.length === 0) {
        unattempted++;
        return { questionId: a.questionId, status: 'unattempted', marks: 0 };
      }

      // Compare answers (case-insensitive, sorted)
      const selSorted = [...selected].map((s) => String(s).toUpperCase().trim()).sort();
      const corSorted = [...correctAns].map((c) => String(c).toUpperCase().trim()).sort();

      const isCorrect = selSorted.length === corSorted.length && selSorted.every((v, i) => v === corSorted[i]);

      if (isCorrect) {
        correct++;
        totalMarks += marks;
        return { questionId: a.questionId, status: 'correct', marks };
      } else {
        incorrect++;
        totalMarks -= neg;
        return { questionId: a.questionId, status: 'incorrect', marks: -neg };
      }
    });

    const timeTaken = parseInt(timeTakenSeconds, 10) || 0;
    const accuracy = correct + incorrect > 0 ? Math.round((correct / (correct + incorrect)) * 100) : 0;
    const percentage = maxMarks > 0 ? Math.round((totalMarks / maxMarks) * 100) : 0;

    res.json({
      success: true,
      data: {
        totalMarks: Math.max(totalMarks, 0),
        maxMarks,
        percentage: Math.max(percentage, 0),
        correct,
        incorrect,
        unattempted,
        totalQuestions: answers.length,
        accuracy,
        timeTaken,
        timeAllowed: (parseInt(timeMinutes, 10) || 30) * 60,
        subject,
        examId,
        results,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
