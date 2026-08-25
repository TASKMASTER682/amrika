import Partner from '../models/Partner.js';
import PartnerTestSeries from '../models/PartnerTestSeries.js';
import PartnerMessage from '../models/PartnerMessage.js';
import User from '../models/User.js';

// Apply to become a partner
export const applyAsPartner = async (req, res, next) => {
  try {
    const { agencyName, contactPhone, examName, description, sampleQuestions } = req.body;

    if (!agencyName || !examName) {
      return res.status(400).json({
        success: false,
        message: 'Agency name and exam name are required.',
      });
    }

    const existing = await Partner.findOne({ user: req.user._id });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: existing.status === 'pending'
          ? 'Your application is already under review.'
          : existing.status === 'approved'
            ? 'You are already an approved partner.'
            : existing.status === 'rejected'
              ? 'Your previous application was rejected. Please contact support.'
              : 'Your partner account is suspended.',
      });
    }

    const partner = await Partner.create({
      user: req.user._id,
      agencyName,
      contactEmail: req.user.email,
      contactPhone,
      examName,
      description,
      sampleQuestions,
      status: 'pending',
    });

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully. Our team will review it shortly.',
      data: partner,
    });
  } catch (error) {
    next(error);
  }
};

// Get my partner profile
export const getMyPartnerProfile = async (req, res, next) => {
  try {
    const partner = await Partner.findOne({ user: req.user._id }).populate('user', 'name email');
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner profile not found.' });
    }
    res.json({ success: true, data: partner });
  } catch (error) {
    next(error);
  }
};

// Get my test series
export const getMyTestSeries = async (req, res, next) => {
  try {
    const partner = await Partner.findOne({ user: req.user._id });
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner profile not found.' });
    }

    const series = await PartnerTestSeries.find({ partner: partner._id })
      .sort({ createdAt: -1 })
      .populate('reviewedBy', 'name');

    res.json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
};

// Create a test series
export const createTestSeries = async (req, res, next) => {
  try {
    const partner = await Partner.findOne({ user: req.user._id });
    if (!partner || partner.status !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'Only approved partners can create test series.',
      });
    }

    const { title, description, agencyName, examName, testPlan, subjects, questionsPerTest, price, suggestedPrice } = req.body;

    if (!title || !agencyName || !examName || !testPlan) {
      return res.status(400).json({
        success: false,
        message: 'Title, agency, exam, and test plan are required.',
      });
    }

    const series = await PartnerTestSeries.create({
      partner: partner._id,
      user: req.user._id,
      title,
      description,
      agencyName,
      examName,
      testPlan,
      subjects: subjects || [],
      questionsPerTest: questionsPerTest || 30,
      price: price || 0,
      suggestedPrice: suggestedPrice || 0,
      status: 'draft',
      visibility: 'hidden',
    });

    res.status(201).json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
};

// Update a test series
export const updateTestSeries = async (req, res, next) => {
  try {
    const partner = await Partner.findOne({ user: req.user._id });
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner profile not found.' });
    }

    const series = await PartnerTestSeries.findOne({ _id: req.params.id, partner: partner._id });
    if (!series) {
      return res.status(404).json({ success: false, message: 'Test series not found.' });
    }

    if (series.status === 'published' || series.status === 'under_review') {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit a published or under-review series.',
      });
    }

    const { title, description, agencyName, examName, testPlan, subjects, questionsPerTest, price, suggestedPrice } = req.body;

    if (title) series.title = title;
    if (description !== undefined) series.description = description;
    if (agencyName) series.agencyName = agencyName;
    if (examName) series.examName = examName;
    if (testPlan) series.testPlan = testPlan;
    if (subjects) series.subjects = subjects;
    if (questionsPerTest) series.questionsPerTest = questionsPerTest;
    if (price !== undefined) series.price = price;
    if (suggestedPrice !== undefined) series.suggestedPrice = suggestedPrice;

    await series.save();
    res.json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
};

// Add questions to a test series (raw text, no parser)
export const addQuestions = async (req, res, next) => {
  try {
    const partner = await Partner.findOne({ user: req.user._id });
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner profile not found.' });
    }

    const series = await PartnerTestSeries.findOne({ _id: req.params.id, partner: partner._id });
    if (!series) {
      return res.status(404).json({ success: false, message: 'Test series not found.' });
    }

    if (series.status === 'published' || series.status === 'under_review') {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit a published or under-review series.',
      });
    }

    const { questions } = req.body;
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one question is required.',
      });
    }

    // Add questions as raw text
    const newQuestions = questions.map((q) => ({
      rawText: q.rawText || q,
      status: 'raw',
    }));

    series.questions.push(...newQuestions);
    await series.save();

    res.json({
      success: true,
      message: `${newQuestions.length} questions added.`,
      data: series,
    });
  } catch (error) {
    next(error);
  }
};

// Remove a question from a test series
export const removeQuestion = async (req, res, next) => {
  try {
    const partner = await Partner.findOne({ user: req.user._id });
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner profile not found.' });
    }

    const series = await PartnerTestSeries.findOne({ _id: req.params.seriesId, partner: partner._id });
    if (!series) {
      return res.status(404).json({ success: false, message: 'Test series not found.' });
    }

    series.questions = series.questions.filter((q) => q._id.toString() !== req.params.questionId);
    await series.save();

    res.json({ success: true, message: 'Question removed.' });
  } catch (error) {
    next(error);
  }
};

// Toggle visibility (partner makes series visible to admin for review)
export const toggleVisibility = async (req, res, next) => {
  try {
    const partner = await Partner.findOne({ user: req.user._id });
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner profile not found.' });
    }

    const series = await PartnerTestSeries.findOne({ _id: req.params.id, partner: partner._id });
    if (!series) {
      return res.status(404).json({ success: false, message: 'Test series not found.' });
    }

    if (series.status === 'published') {
      return res.status(400).json({
        success: false,
        message: 'Cannot change visibility of a published series.',
      });
    }

    if (series.questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Add at least one question before making visible to admin.',
      });
    }

    series.visibility = series.visibility === 'hidden' ? 'visible_to_admin' : 'hidden';
    if (series.visibility === 'visible_to_admin' && series.status === 'draft') {
      series.status = 'pending_review';
    } else if (series.visibility === 'hidden' && series.status === 'pending_review') {
      series.status = 'draft';
    }

    await series.save();

    res.json({
      success: true,
      message: series.visibility === 'visible_to_admin'
        ? 'Series is now visible to admin for review.'
        : 'Series is now hidden from admin.',
      data: series,
    });
  } catch (error) {
    next(error);
  }
};

// Send message to admin
export const sendMessage = async (req, res, next) => {
  try {
    const partner = await Partner.findOne({ user: req.user._id });
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner profile not found.' });
    }

    const { subject, message, testSeriesRef } = req.body;
    if (!subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Subject and message are required.',
      });
    }

    const msg = await PartnerMessage.create({
      partner: partner._id,
      user: req.user._id,
      subject,
      message,
      testSeriesRef: testSeriesRef || undefined,
    });

    res.status(201).json({ success: true, data: msg });
  } catch (error) {
    next(error);
  }
};

// Get my messages
export const getMyMessages = async (req, res, next) => {
  try {
    const partner = await Partner.findOne({ user: req.user._id });
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner profile not found.' });
    }

    const messages = await PartnerMessage.find({ partner: partner._id })
      .sort({ createdAt: -1 })
      .populate('repliedBy', 'name');

    res.json({ success: true, data: messages });
  } catch (error) {
    next(error);
  }
};

// Get my earnings summary
export const getMyEarnings = async (req, res, next) => {
  try {
    const partner = await Partner.findOne({ user: req.user._id });
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner profile not found.' });
    }

    const series = await PartnerTestSeries.find({ partner: partner._id })
      .select('title totalEnrollments totalRevenue partnerEarnings status');

    res.json({
      success: true,
      data: {
        totalEarnings: partner.totalEarnings,
        totalSales: partner.totalSales,
        revenueShare: partner.revenueShare,
        series,
      },
    });
  } catch (error) {
    next(error);
  }
};
