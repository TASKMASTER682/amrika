const Question = require('../models/Question');
const QuestionVersion = require('../models/QuestionVersion');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

const create = asyncHandler(async (req, res) => {
  const question = await Question.create({ ...req.body, createdBy: req.user.id });
  new ApiResponse(201, { question }, 'Question created as draft').send(res);
});

/**
 * Powers the Question Bank search/filter screen. Every filter is optional
 * and additive; `search` uses the text index defined on the model rather
 * than a regex scan, so it stays fast as the bank grows into the millions.
 */
const list = asyncHandler(async (req, res) => {
  const { exam, subject, topic, difficulty, tag, search, approvalStatus, page, limit } = req.query;

  const filter = { isActive: true };
  if (exam) filter.exam = exam;
  if (subject) filter.subject = subject;
  if (topic) filter.topic = topic;
  if (difficulty) filter.difficulty = difficulty;
  if (tag) filter.tags = tag;
  if (approvalStatus) filter.approvalStatus = approvalStatus;
  if (search) filter.$text = { $search: search };

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Question.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Question.countDocuments(filter),
  ]);

  new ApiResponse(200, { items, total, page, limit, pages: Math.ceil(total / limit) }).send(res);
});

const getById = asyncHandler(async (req, res) => {
  const question = await Question.findById(req.params.id);
  if (!question || !question.isActive) throw ApiError.notFound('Question not found');
  new ApiResponse(200, { question }).send(res);
});

/**
 * Any edit to an already-approved question is snapshotted first, so the
 * platform never silently rewrites content a review already signed off on —
 * it always has a paper trail (used by "Revision History" in the admin UI).
 */
const update = asyncHandler(async (req, res) => {
  const question = await Question.findById(req.params.id);
  if (!question || !question.isActive) throw ApiError.notFound('Question not found');

  if (question.approvalStatus === 'approved') {
    await QuestionVersion.create({
      question: question._id,
      version: question.version,
      snapshot: question.toObject(),
      editedBy: req.user.id,
      changeNote: req.body.changeNote || 'Edited after approval',
    });
    question.version += 1;
    question.approvalStatus = 'in_review'; // re-review required after editing an approved question
  }

  Object.assign(question, req.body);
  await question.save();

  new ApiResponse(200, { question }, 'Question updated').send(res);
});

/** Soft delete — preserves the question for any test/attempt that already references it. */
const remove = asyncHandler(async (req, res) => {
  const question = await Question.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!question) throw ApiError.notFound('Question not found');
  new ApiResponse(200, null, 'Question archived').send(res);
});

const submitForReview = asyncHandler(async (req, res) => {
  const question = await Question.findByIdAndUpdate(
    req.params.id,
    { approvalStatus: 'in_review' },
    { new: true }
  );
  if (!question) throw ApiError.notFound('Question not found');
  new ApiResponse(200, { question }, 'Submitted for review').send(res);
});

const approve = asyncHandler(async (req, res) => {
  const question = await Question.findByIdAndUpdate(
    req.params.id,
    { approvalStatus: 'approved', reviewedBy: req.user.id, rejectionReason: null },
    { new: true }
  );
  if (!question) throw ApiError.notFound('Question not found');
  new ApiResponse(200, { question }, 'Question approved').send(res);
});

const reject = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  if (!reason) throw ApiError.badRequest('A rejection reason is required');

  const question = await Question.findByIdAndUpdate(
    req.params.id,
    { approvalStatus: 'rejected', reviewedBy: req.user.id, rejectionReason: reason },
    { new: true }
  );
  if (!question) throw ApiError.notFound('Question not found');
  new ApiResponse(200, { question }, 'Question rejected').send(res);
});

module.exports = { create, list, getById, update, remove, submitForReview, approve, reject };
