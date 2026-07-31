const { Test } = require('../models/Test');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

/** Lazy-load the ES-Module Question model via dynamic import. */
let _Question;
async function getQuestionModel() {
  if (!_Question) _Question = (await import('../models/Question.js')).default;
  return _Question;
}

const create = asyncHandler(async (req, res) => {
  const test = await Test.create({ ...req.body, createdBy: req.user.id });
  new ApiResponse(201, { test }, 'Test saved as draft').send(res);
});

/** Students only ever see published, currently-active tests; admins can see everything via ?all=true. */
const list = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.exam) filter.exam = req.query.exam;
  if (req.query.testSeries) filter.testSeries = req.query.testSeries;

  if (req.user.role !== 'Super Admin' || req.query.all !== 'true') {
    filter.isPublished = true;
    filter.$or = [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }];
  }

  const tests = await Test.find(filter).select('-sections.questions').sort({ createdAt: -1 });
  new ApiResponse(200, { tests }).send(res);
});

/** Full detail including question IDs — used by the admin test builder and by the attempt-start flow. */
const getById = asyncHandler(async (req, res) => {
  const test = await Test.findById(req.params.id).populate('sections.questions');
  if (!test) throw ApiError.notFound('Test not found');
  new ApiResponse(200, { test }).send(res);
});

const update = asyncHandler(async (req, res) => {
  const test = await Test.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!test) throw ApiError.notFound('Test not found');
  new ApiResponse(200, { test }, 'Test updated').send(res);
});

const publish = asyncHandler(async (req, res) => {
  const test = await Test.findByIdAndUpdate(req.params.id, { isPublished: true }, { new: true });
  if (!test) throw ApiError.notFound('Test not found');
  new ApiResponse(200, { test }, 'Test published').send(res);
});

const unpublish = asyncHandler(async (req, res) => {
  const test = await Test.findByIdAndUpdate(req.params.id, { isPublished: false }, { new: true });
  if (!test) throw ApiError.notFound('Test not found');
  new ApiResponse(200, { test }, 'Test unpublished').send(res);
});

/** "Clone Test" from the spec — duplicates structure/timing but starts life as an unpublished draft. */
const clone = asyncHandler(async (req, res) => {
  const source = await Test.findById(req.params.id).lean();
  if (!source) throw ApiError.notFound('Test not found');

  const { _id, createdAt, updatedAt, ...rest } = source;
  const cloned = await Test.create({
    ...rest,
    title: `${source.title} (Copy)`,
    isPublished: false,
    createdBy: req.user.id,
    clonedFrom: source._id,
  });

  new ApiResponse(201, { test: cloned }, 'Test cloned as draft').send(res);
});

const remove = asyncHandler(async (req, res) => {
  const test = await Test.findByIdAndDelete(req.params.id);
  if (!test) throw ApiError.notFound('Test not found');

  if (req.query.deleteQuestions === 'true') {
    const ids = test.sections.flatMap(s => s.questions || []);
    if (ids.length) {
      const Question = await getQuestionModel();
      await Question.deleteMany({ _id: { $in: ids } });
    }
  }

  new ApiResponse(200, null, 'Test deleted').send(res);
});

module.exports = { create, list, getById, update, publish, unpublish, clone, remove };
