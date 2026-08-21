import Test from '../models/Test.js';
import Question from '../models/Question.js';
import { canAttemptTest, getTestAvailability, isWithinFreeWindow } from '../services/AccessService.js';

// Normalizes a client-supplied section into the schema shape. Accepts both
// `questions` (ObjectId string refs) and `questionIds` (frontend builder naming).
const normalizeSection = (sec) => {
  const rawQuestions = sec.questions || sec.questionIds || [];
  return {
    name: sec.name || 'Section',
    duration: Number(sec.duration) || 0,
    questions: (Array.isArray(rawQuestions) ? rawQuestions : []).filter(Boolean),
    negativeMarking: sec.negativeMarking !== undefined ? !!sec.negativeMarking : true,
    marksPerQuestion: Number(sec.marksPerQuestion) || 2,
    negativeMarksPerQuestion: Number(sec.negativeMarksPerQuestion) || 0.5,
  };
};

export const createTest = async (req, res, next) => {
  try {
    const {
      title, description, examId, testSeriesId, sections, duration, passingMarks,
      negativeMarking, attemptLimit, calculatorAllowed, fullscreenRequired,
      shuffleQuestions, shuffleOptions, scheduled, startTime, endTime,
      includedInSubscription, freeWindow, status,
    } = req.body;

    const test = await Test.create({
      title: title || '',
      description: description || '',
      examId: examId || null,
      testSeriesId: testSeriesId || null,
      duration: duration || 0,
      passingMarks: passingMarks !== undefined ? passingMarks : 0,
      negativeMarking: negativeMarking !== undefined ? negativeMarking : 0,
      attemptLimit: attemptLimit !== undefined ? attemptLimit : 1,
      calculatorAllowed: !!calculatorAllowed,
      fullscreenRequired: fullscreenRequired !== undefined ? !!fullscreenRequired : true,
      shuffleQuestions: shuffleQuestions !== undefined ? !!shuffleQuestions : true,
      shuffleOptions: shuffleOptions !== undefined ? !!shuffleOptions : true,
      scheduled: !!scheduled,
      startTime: scheduled && startTime ? new Date(startTime) : undefined,
      endTime: scheduled && endTime ? new Date(endTime) : undefined,
      includedInSubscription: !!includedInSubscription,
      freeWindow: freeWindow && (freeWindow.from || freeWindow.to)
        ? { from: freeWindow.from ? new Date(freeWindow.from) : null, to: freeWindow.to ? new Date(freeWindow.to) : null }
        : { from: null, to: null },
      sections: Array.isArray(sections) ? sections.map(normalizeSection) : [],
      status: status || 'draft',
    });
    res.status(201).json({ success: true, data: test });
  } catch (error) {
    next(error);
  }
};

export const listTests = async (req, res, next) => {
  try {
    const { examId, testSeriesId, status } = req.query;
    const filter = {};
    if (examId) filter.examId = examId;
    if (testSeriesId) filter.testSeriesId = testSeriesId;
    if (status) filter.status = status;
    else if (req.user?.role !== 'Super Admin') filter.status = 'published'; // Users only see published tests

    const tests = await Test.find(filter)
      .populate('examId', 'name')
      .populate('testSeriesId', 'title price')
      // Within a test series, first-uploaded test comes first (latest upload last).
      // Other listings keep newest-first.
      .sort(testSeriesId ? { createdAt: 1, _id: 1 } : { createdAt: -1 });

    const enriched = [];
    for (const test of tests) {
      const isStaff = req.user?.role === 'Super Admin' || req.user?.role === 'Content Manager';
      const isLocked = !isStaff && !(await canAttemptTest(req.user, test, test.testSeriesId));
      const availability = req.user?.role !== 'Super Admin' ? getTestAvailability(test) : { status: 'not_scheduled' };
      enriched.push({ ...test.toObject(), isLocked, memberOnly: !!test.includedInSubscription, isFree: isWithinFreeWindow(test), availability });
    }

    res.json({ success: true, data: enriched });
  } catch (error) {
    next(error);
  }
};

export const getTestById = async (req, res, next) => {
  try {
    const test = await Test.findById(req.params.id)
      .populate({
        path: 'sections.questions',
        select: req.user?.role !== 'User' ? '' : '-correctAnswer -explanation -formula -concept'
      })
      .populate('examId', 'name')
      .populate('testSeriesId', 'title');

    if (!test) {
      return res.status(404).json({ success: false, message: 'Test not found' });
    }

    res.json({ success: true, data: test });
  } catch (error) {
    next(error);
  }
};

export const updateTest = async (req, res, next) => {
  try {
    const {
      title, description, examId, testSeriesId, sections, duration, passingMarks,
      negativeMarking, attemptLimit, calculatorAllowed, fullscreenRequired,
      shuffleQuestions, shuffleOptions, scheduled, startTime, endTime,
      includedInSubscription, freeWindow, status,
    } = req.body;

    const updateData = {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(examId !== undefined && { examId: examId || null }),
      ...(testSeriesId !== undefined && { testSeriesId: testSeriesId || null }),
      ...(duration !== undefined && { duration }),
      ...(passingMarks !== undefined && { passingMarks }),
      ...(negativeMarking !== undefined && { negativeMarking }),
      ...(attemptLimit !== undefined && { attemptLimit }),
      ...(calculatorAllowed !== undefined && { calculatorAllowed: !!calculatorAllowed }),
      ...(fullscreenRequired !== undefined && { fullscreenRequired: !!fullscreenRequired }),
      ...(shuffleQuestions !== undefined && { shuffleQuestions: !!shuffleQuestions }),
      ...(shuffleOptions !== undefined && { shuffleOptions: !!shuffleOptions }),
      ...(scheduled !== undefined && { scheduled: !!scheduled }),
      ...(startTime !== undefined && { startTime: scheduled ? new Date(startTime) : null }),
      ...(endTime !== undefined && { endTime: scheduled ? new Date(endTime) : null }),
      ...(includedInSubscription !== undefined && { includedInSubscription: !!includedInSubscription }),
      ...(freeWindow !== undefined && {
        freeWindow: {
          from: freeWindow?.from ? new Date(freeWindow.from) : null,
          to: freeWindow?.to ? new Date(freeWindow.to) : null,
        },
      }),
      ...(Array.isArray(sections) && { sections: sections.map(normalizeSection) }),
      ...(status !== undefined && { status }),
    };

    const test = await Test.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    if (!test) {
      return res.status(404).json({ success: false, message: 'Test not found' });
    }
    res.json({ success: true, data: test });
  } catch (error) {
    next(error);
  }
};

export const deleteTest = async (req, res, next) => {
  try {
    const test = await Test.findByIdAndDelete(req.params.id);
    if (!test) {
      return res.status(404).json({ success: false, message: 'Test not found' });
    }
    res.json({ success: true, message: 'Test deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

// Agency, Exam & TestSeries helpers to support dropdowns in the visual builder
export const getHierarchyMeta = async (req, res, next) => {
  try {
    const exams = await Test.find({ status: 'published' }).distinct('examId');
    res.json({ success: true, data: exams });
  } catch (error) {
    next(error);
  }
};