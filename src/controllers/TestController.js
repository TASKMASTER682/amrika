import Test from '../models/Test.js';
import Question from '../models/Question.js';
import { canAttemptTest, getTestAvailability, isWithinFreeWindow } from '../services/AccessService.js';

export const createTest = async (req, res, next) => {
  try {
    const test = await Test.create(req.body);
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
      .sort({ createdAt: -1 });

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
    const test = await Test.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
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
