import QuestionReport from '../models/QuestionReport.js';

/** Student reports a question. */
export const reportQuestion = async (req, res, next) => {
  try {
    const { questionId, reason, description } = req.body;
    if (!questionId || !reason) {
      return res.status(400).json({ success: false, message: 'questionId and reason are required.' });
    }

    const existing = await QuestionReport.findOne({ studentId: req.user._id, questionId });
    if (existing) {
      return res.status(409).json({ success: false, message: 'You have already reported this question.' });
    }

    const report = await QuestionReport.create({
      studentId: req.user._id,
      questionId,
      reason,
      description,
    });

    res.status(201).json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
};

/** Get current student's reports. */
export const getMyReports = async (req, res, next) => {
  try {
    const reports = await QuestionReport.find({ studentId: req.user._id })
      .populate('questionId', 'body subject topic')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: reports });
  } catch (err) {
    next(err);
  }
};

/** Admin: list all reports. */
export const listReports = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const [reports, total] = await Promise.all([
      QuestionReport.find(filter)
        .populate('studentId', 'name email')
        .populate('questionId', 'body subject topic agencyId')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit)),
      QuestionReport.countDocuments(filter),
    ]);

    res.json({ success: true, data: reports, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
};

/** Admin: update report status. */
export const updateReportStatus = async (req, res, next) => {
  try {
    const { status, adminNote } = req.body;
    const report = await QuestionReport.findByIdAndUpdate(
      req.params.id,
      { status, adminNote },
      { new: true }
    );
    if (!report) return res.status(404).json({ success: false, message: 'Report not found.' });
    res.json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
};
