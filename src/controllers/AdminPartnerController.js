import Partner from '../models/Partner.js';
import PartnerTestSeries from '../models/PartnerTestSeries.js';
import PartnerMessage from '../models/PartnerMessage.js';
import TestSeries from '../models/TestSeries.js';
import Test from '../models/Test.js';
import Question from '../models/Question.js';
import mongoose from 'mongoose';

// List all partners
export const listPartners = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const partners = await Partner.find(filter)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Partner.countDocuments(filter);

    res.json({ success: true, data: partners, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    next(error);
  }
};

// Get partner details
export const getPartnerDetails = async (req, res, next) => {
  try {
    const partner = await Partner.findById(req.params.id).populate('user', 'name email');
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner not found.' });
    }

    const series = await PartnerTestSeries.find({ partner: partner._id })
      .sort({ createdAt: -1 });

    res.json({ success: true, data: { partner, series } });
  } catch (error) {
    next(error);
  }
};

// Approve/reject partner application
export const reviewPartner = async (req, res, next) => {
  try {
    const { action, rejectionReason } = req.body;
    const partner = await Partner.findById(req.params.id);
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner not found.' });
    }

    if (partner.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Partner is already ${partner.status}.`,
      });
    }

    if (action === 'approve') {
      partner.status = 'approved';
      partner.approvedAt = new Date();
    } else if (action === 'reject') {
      partner.status = 'rejected';
      partner.rejectedAt = new Date();
      partner.rejectionReason = rejectionReason || '';
    } else {
      return res.status(400).json({ success: false, message: 'Action must be "approve" or "reject".' });
    }

    await partner.save();
    res.json({ success: true, data: partner });
  } catch (error) {
    next(error);
  }
};

// Update partner revenue share percentage
export const updateRevenueShare = async (req, res, next) => {
  try {
    const { revenueShare } = req.body;
    if (revenueShare === undefined || typeof revenueShare !== 'number' || revenueShare < 0 || revenueShare > 100) {
      return res.status(400).json({ success: false, message: 'revenueShare must be a number between 0 and 100.' });
    }
    const partner = await Partner.findByIdAndUpdate(
      req.params.id,
      { revenueShare },
      { new: true, runValidators: true }
    ).populate('user', 'name email');
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner not found.' });
    }
    res.json({ success: true, data: partner });
  } catch (error) {
    next(error);
  }
};

// List test series visible to admin (pending_review or under_review)
export const listPartnerTestSeries = async (req, res, next) => {
  try {
    const { status, partnerId } = req.query;
    const filter = {};

    if (status) {
      filter.status = status;
    } else {
      filter.status = { $in: ['pending_review', 'under_review', 'approved', 'published', 'rejected'] };
    }

    if (partnerId) filter.partner = partnerId;

    const series = await PartnerTestSeries.find(filter)
      .populate('partner', 'agencyName user')
      .populate({ path: 'partner', populate: { path: 'user', select: 'name email' } })
      .populate('reviewedBy', 'name')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
};

// Get a specific test series for review (with dual question boxes)
export const getTestSeriesForReview = async (req, res, next) => {
  try {
    const series = await PartnerTestSeries.findById(req.params.id)
      .populate({ path: 'partner', populate: { path: 'user', select: 'name email' } })
      .populate('reviewedBy', 'name');

    if (!series) {
      return res.status(404).json({ success: false, message: 'Test series not found.' });
    }

    // Mark as under_review if it was pending_review
    if (series.status === 'pending_review') {
      series.status = 'under_review';
      series.reviewedBy = req.user._id;
      series.reviewedAt = new Date();
      await series.save();
    }

    res.json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
};

// Save formatted question (admin converts raw text to parser format)
export const saveFormattedQuestion = async (req, res, next) => {
  try {
    const { seriesId, questionId } = req.params;
    const { formattedBody, formattedOptions, formattedCorrectAnswer, formattedExplanation } = req.body;

    const series = await PartnerTestSeries.findById(seriesId);
    if (!series) {
      return res.status(404).json({ success: false, message: 'Test series not found.' });
    }

    const question = series.questions.id(questionId);
    if (!question) {
      return res.status(404).json({ success: false, message: 'Question not found.' });
    }

    question.formattedBody = formattedBody || '';
    question.formattedOptions = formattedOptions || '';
    question.formattedCorrectAnswer = formattedCorrectAnswer || '';
    question.formattedExplanation = formattedExplanation || '';
    question.status = 'formatted';

    await series.save();
    res.json({ success: true, data: question });
  } catch (error) {
    next(error);
  }
};

// Clear formatted question (admin wants to redo)
export const clearFormattedQuestion = async (req, res, next) => {
  try {
    const { seriesId, questionId } = req.params;

    const series = await PartnerTestSeries.findById(seriesId);
    if (!series) {
      return res.status(404).json({ success: false, message: 'Test series not found.' });
    }

    const question = series.questions.id(questionId);
    if (!question) {
      return res.status(404).json({ success: false, message: 'Question not found.' });
    }

    question.formattedBody = '';
    question.formattedOptions = '';
    question.formattedCorrectAnswer = '';
    question.formattedExplanation = '';
    question.status = 'raw';

    await series.save();
    res.json({ success: true, data: question });
  } catch (error) {
    next(error);
  }
};

// Approve/reject a test series
export const reviewTestSeries = async (req, res, next) => {
  try {
    const { action, rejectionReason, adminNotes } = req.body;
    const series = await PartnerTestSeries.findById(req.params.id);
    if (!series) {
      return res.status(404).json({ success: false, message: 'Test series not found.' });
    }

    if (action === 'approve') {
      // Check if all questions are formatted
      const unformatted = series.questions.filter((q) => q.status === 'raw');
      if (unformatted.length > 0) {
        return res.status(400).json({
          success: false,
          message: `${unformatted.length} questions still need formatting before approval.`,
        });
      }
      series.status = 'approved';
    } else if (action === 'reject') {
      series.status = 'rejected';
      series.rejectionReason = rejectionReason || '';
    } else {
      return res.status(400).json({ success: false, message: 'Action must be "approve" or "reject".' });
    }

    series.adminNotes = adminNotes || '';
    series.reviewedBy = req.user._id;
    series.reviewedAt = new Date();
    await series.save();

    res.json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
};

// Publish a partner test series (creates actual TestSeries + Tests + Questions in DB)
export const publishTestSeries = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const series = await PartnerTestSeries.findById(req.params.id).session(session);
    if (!series) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'Test series not found.' });
    }

    if (series.status !== 'approved') {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Only approved test series can be published.',
      });
    }

    // Find or create agency
    let agency = await mongoose.model('Agency').findOne({ name: series.agencyName }).session(session);
    if (!agency) {
      const results = await mongoose.model('Agency').create([{
        name: series.agencyName,
        code: series.agencyName.substring(0, 10).toUpperCase().replace(/\s+/g, ''),
        active: true,
      }], { session });
      agency = results[0];
    }

    // Find or create exam
    let exam = await mongoose.model('Exam').findOne({
      agencyId: agency._id,
      name: series.examName,
    }).session(session);
    if (!exam) {
      const results = await mongoose.model('Exam').create([{
        agencyId: agency._id,
        name: series.examName,
        code: series.examName.substring(0, 10).toUpperCase().replace(/\s+/g, ''),
        active: true,
      }], { session });
      exam = results[0];
    }

    // Create the actual TestSeries
    const testSeriesDoc = await TestSeries.create([{
      examId: exam._id,
      title: series.title,
      description: series.description,
      price: series.price,
      active: true,
      featured: false,
      difficulty: 'mix',
    }], { session });

    const testSeries = testSeriesDoc[0];

    // Create questions from formatted text
    const createdQuestions = [];
    for (const q of series.questions) {
      if (q.status !== 'formatted' && q.status !== 'approved') continue;

      // Parse formatted text into structured question
      const questionData = parseFormattedQuestion(q, exam._id, agency._id);
      const qDoc = await Question.create([questionData], { session });
      createdQuestions.push(qDoc[0]);
    }

    // Create a test with all questions in one section
    if (createdQuestions.length > 0) {
      await Test.create([{
        testSeriesId: testSeries._id,
        examId: exam._id,
        title: series.title,
        description: series.description,
        duration: Math.ceil(createdQuestions.length * 1.5), // ~1.5 min per question
        sections: [{
          name: 'General',
          duration: 0,
          questions: createdQuestions.map((q) => q._id),
          negativeMarking: true,
          marksPerQuestion: 2,
          negativeMarksPerQuestion: 0.5,
        }],
        active: true,
        status: 'published',
      }], { session });
    }

    // Update partner test series
    series.status = 'published';
    series.publishedAt = new Date();
    series.publishedSeriesId = testSeries._id;
    await series.save({ session });

    // Update partner earnings tracking
    await Partner.findByIdAndUpdate(series.partner, {
      $inc: { totalSales: 0 },
    }).session(session);

    await session.commitTransaction();

    res.json({
      success: true,
      message: `Test series published with ${createdQuestions.length} questions.`,
      data: { testSeriesId: testSeries._id, questionsCreated: createdQuestions.length },
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

// Parse formatted question text into structured Question document
function parseFormattedQuestion(q, examId, agencyId) {
  const raw = q.formattedBody || q.rawText;
  const optionsText = q.formattedOptions || '';
  const answerText = q.formattedCorrectAnswer || '';
  const explanationText = q.formattedExplanation || '';

  // Parse options from text (look for A), B), C), D) patterns)
  const options = [];
  const optionRegex = /([A-D])\)\s*(.+?)(?=\s*[A-D]\)|$)/gs;
  let match;
  while ((match = optionRegex.exec(optionsText)) !== null) {
    options.push({ key: match[1], text: match[2].trim() });
  }

  // Default options if parsing fails
  if (options.length === 0) {
    options.push(
      { key: 'A', text: 'Option A' },
      { key: 'B', text: 'Option B' },
      { key: 'C', text: 'Option C' },
      { key: 'D', text: 'Option D' },
    );
  }

  // Parse correct answer
  const correctAnswer = answerText.trim().split(/[,;\s]+/).filter(Boolean);

  return {
    body: raw,
    options,
    correctAnswer: correctAnswer.length > 0 ? correctAnswer : ['A'],
    type: 'Single Correct',
    subject: 'General',
    topic: 'General',
    difficulty: 'Medium',
    language: 'English',
    explanation: explanationText,
    marks: 2,
    negativeMarks: 0.5,
    examId,
    agencyId,
    approvalStatus: 'Approved',
    active: true,
    createdBy: undefined,
  };
}

// List all messages from partners
export const listMessages = async (req, res, next) => {
  try {
    const { unread } = req.query;
    const filter = {};
    if (unread === 'true') filter.readByAdmin = false;

    const messages = await PartnerMessage.find(filter)
      .populate({ path: 'partner', populate: { path: 'user', select: 'name email' } })
      .populate('repliedBy', 'name')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: messages });
  } catch (error) {
    next(error);
  }
};

// Reply to a partner message
export const replyToMessage = async (req, res, next) => {
  try {
    const { adminReply } = req.body;
    if (!adminReply) {
      return res.status(400).json({ success: false, message: 'Reply is required.' });
    }

    const message = await PartnerMessage.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found.' });
    }

    message.adminReply = adminReply;
    message.repliedAt = new Date();
    message.repliedBy = req.user._id;
    message.readByAdmin = true;
    message.readAt = new Date();

    await message.save();
    res.json({ success: true, data: message });
  } catch (error) {
    next(error);
  }
};

// Get partner earnings for admin view
export const getPartnerEarnings = async (req, res, next) => {
  try {
    const partner = await Partner.findById(req.params.id).populate('user', 'name email');
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner not found.' });
    }

    const series = await PartnerTestSeries.find({ partner: partner._id })
      .select('title totalEnrollments totalRevenue partnerEarnings status publishedAt');

    res.json({
      success: true,
      data: {
        partner,
        series,
        totalEarnings: partner.totalEarnings,
        totalSales: partner.totalSales,
      },
    });
  } catch (error) {
    next(error);
  }
};
