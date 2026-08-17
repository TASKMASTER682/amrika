import TestSeries from '../models/TestSeries.js';
import { logAudit } from '../services/AuditService.js';

export const listTestSeries = async (req, res, next) => {
  try {
    const { examId, featured, active, all } = req.query;
    const filter = {};
    if (examId) filter.examId = examId;
    if (featured === 'true') filter.featured = true;

    const isStaff = req.user?.role === 'Super Admin' || req.user?.role === 'Content Manager';
    // Students should only see active series; staff can request all via ?all=true
    if (active === 'true' || (!isStaff && all !== 'true')) {
      filter.active = true;
    }

    const series = await TestSeries.find(filter).populate('examId', 'name code').sort({ title: 1 });
    res.json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
};

export const getTestSeriesById = async (req, res, next) => {
  try {
    const isStaff = req.user?.role === 'Super Admin' || req.user?.role === 'Content Manager';
    const series = await TestSeries.findById(req.params.id).populate('examId', 'name code');
    if (!series) {
      return res.status(404).json({ success: false, message: 'Test Series not found.' });
    }
    if (!series.active && !isStaff) {
      return res.status(404).json({ success: false, message: 'Test Series not found.' });
    }
    res.json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
};

export const createTestSeries = async (req, res, next) => {
  try {
    const { title, description, examId, durationDays, price, isActive, banner, difficulty } = req.body;
    const series = await TestSeries.create({
      title: title || '',
      description: description || '',
      examId: examId || null,
      durationDays: durationDays || 0,
      price: price || 0,
      isActive: isActive !== undefined ? isActive : true,
      banner: banner || '',
      difficulty: difficulty || 'mix',
      author: req.user._id,
    });
    await logAudit({
      userId: req.user._id,
      action: 'TESTSERIES_CREATE',
      details: `Created test series "${series.title}"`,
      req,
    });
    res.status(201).json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
};

export const updateTestSeries = async (req, res, next) => {
  try {
    const { title, description, examId, durationDays, price, isActive, banner, difficulty } = req.body;
    const series = await TestSeries.findByIdAndUpdate(
      req.params.id,
      {
        title: title !== undefined ? title : undefined,
        description: description !== undefined ? description : undefined,
        examId: examId !== undefined ? examId : undefined,
        durationDays: durationDays !== undefined ? durationDays : undefined,
        price: price !== undefined ? price : undefined,
        isActive: isActive !== undefined ? isActive : undefined,
        banner: banner !== undefined ? banner : undefined,
        difficulty: difficulty || undefined,
      },
      { new: true, runValidators: true }
    );
    if (!series) {
      return res.status(404).json({ success: false, message: 'Test Series not found.' });
    }
    await logAudit({
      userId: req.user._id,
      action: 'TESTSERIES_UPDATE',
      details: `Updated test series "${series.title}"`,
      req,
    });
    res.json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
};

export const searchTestSeries = async (req, res, next) => {
  try {
    const { q } = req.query;
    const isStaff = req.user?.role === 'Super Admin' || req.user?.role === 'Content Manager';
    // Students/public never see inactive series.
    const base = isStaff && req.query.all === 'true' ? {} : { active: true };

    const regex = new RegExp(String(q || '').trim(), 'i');
    const fullQuery = q && q.trim().length > 0 ? {
      $or: [
        { title: regex },
        { description: regex },
        { tags: regex },
      ],
    } : {};

    const series = await TestSeries.find({ ...base, ...fullQuery })
      .populate('examId', 'name code')
      .sort({ title: 1 });
    res.json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
};

export const deleteTestSeries = async (req, res, next) => {
  try {
    await TestSeries.findByIdAndDelete(req.params.id);
    await logAudit({
      userId: req.user._id,
      action: 'TESTSERIES_DELETE',
      details: `Deleted test series ${req.params.id}`,
      req,
    });
    res.json({ success: true, message: 'Test Series deleted.' });
  } catch (error) {
    next(error);
  }
};

// Upload a banner image for a test series (base64 data URL, stored inline)
// Pass `banner: null` to remove the banner.
export const uploadBanner = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { banner } = req.body;
    if (banner === undefined) {
      return res.status(400).json({ success: false, message: 'Banner field is required (send null to remove).' });
    }
    const update = banner === null ? { $unset: { banner: '' } } : { banner };
    const series = await TestSeries.findByIdAndUpdate(id, update, { new: true });
    if (!series) {
      return res.status(404).json({ success: false, message: 'Test Series not found.' });
    }
    await logAudit({
      userId: req.user._id,
      action: 'TESTSERIES_BANNER',
      details: banner === null ? `Removed banner for "${series.title}"` : `Updated banner for "${series.title}"`,
      req,
    });
    res.json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
};
