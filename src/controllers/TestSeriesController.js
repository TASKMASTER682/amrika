import TestSeries from '../models/TestSeries.js';
import { logAudit } from '../services/AuditService.js';

// Server-side scrub of admin-authored HTML (same policy as BlogController):
// drops script/style/iframe/object/embed/link tags, inline event handlers and
// javascript: URLs. Applied on write AND on read (defense-in-depth).
const sanitizeHtml = (html = '') => {
  return String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object\s*>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '');
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isStaffRole = (role) =>
  role === 'Super Admin' || role === 'Content Manager' || role === 'Support';

// SEO-friendly unique slug from the title ("SSC CGL 2026!" -> "ssc-cgl-2026").
const generateSlug = async (title, excludeId) => {
  const base = String(title || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'series';
  let slug = base;
  let counter = 2;
  while (
    await TestSeries.exists({
      slug,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    })
  ) {
    slug = `${base}-${counter}`;
    counter += 1;
  }
  return slug;
};

export const listTestSeries = async (req, res, next) => {
  try {
    const { examId, featured, active, all } = req.query;
    const filter = {};
    if (examId) filter.examId = examId;
    if (featured === 'true') filter.featured = true;

    const isStaff = isStaffRole(req.user?.role);
    // Students should only see active series; staff can request all via ?all=true
    if (active === 'true' || (!isStaff && all !== 'true')) {
      filter.active = true;
    }

    // Never ship the landing-page body in list responses.
    const series = await TestSeries.find(filter)
      .select('-body')
      .populate('examId', 'name code')
      .sort({ title: 1 });
    res.json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
};

export const getTestSeriesById = async (req, res, next) => {
  try {
    const isStaff = isStaffRole(req.user?.role);
    const series = await TestSeries.findById(req.params.id).populate('examId', 'name code');
    if (!series) {
      return res.status(404).json({ success: false, message: 'Test Series not found.' });
    }
    if (!series.active && !isStaff) {
      return res.status(404).json({ success: false, message: 'Test Series not found.' });
    }
    // Only staff may read the raw landing-page body through this endpoint.
    if (!isStaff) series.set('body', undefined);
    res.json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
};

export const createTestSeries = async (req, res, next) => {
  try {
    const { title, description, examId, durationDays, price, active, banner, difficulty, body, slug } = req.body;
    const series = await TestSeries.create({
      title: title || '',
      description: description || '',
      slug: slug ? String(slug).toLowerCase() : await generateSlug(title),
      body: body !== undefined && body !== null ? sanitizeHtml(body) : '',
      examId: examId || null,
      durationDays: durationDays || 0,
      price: price || 0,
      // New series start as drafts — hidden from users until activated.
      active: active !== undefined ? !!active : false,
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
    const { title, description, examId, durationDays, price, active, banner, difficulty, body, slug } = req.body;
    // Slug is only changed when explicitly provided — a stable URL matters for SEO.
    const nextSlug =
      slug !== undefined && slug !== null && slug !== ''
        ? String(slug).toLowerCase()
        : undefined;
    if (nextSlug) {
      const clash = await TestSeries.exists({ slug: nextSlug, _id: { $ne: req.params.id } });
      if (clash) {
        return res.status(409).json({ success: false, message: 'That slug is already in use.' });
      }
    }
    const series = await TestSeries.findByIdAndUpdate(
      req.params.id,
      {
        title: title !== undefined ? title : undefined,
        description: description !== undefined ? description : undefined,
        slug: nextSlug,
        body: body !== undefined ? (body === null ? '' : sanitizeHtml(body)) : undefined,
        examId: examId !== undefined ? examId : undefined,
        durationDays: durationDays !== undefined ? durationDays : undefined,
        price: price !== undefined ? price : undefined,
        active: active !== undefined ? !!active : undefined,
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
    const isStaff = isStaffRole(req.user?.role);
    // Students/public never see inactive series.
    const base = isStaff && req.query.all === 'true' ? {} : { active: true };

    const fullQuery = q && q.trim().length > 0 ? {
      $or: [
        { title: new RegExp(escapeRegex(q.trim()), 'i') },
        { description: new RegExp(escapeRegex(q.trim()), 'i') },
        { tags: new RegExp(escapeRegex(q.trim()), 'i') },
      ],
    } : {};

    const series = await TestSeries.find({ ...base, ...fullQuery })
      .select('-body')
      .populate('examId', 'name code')
      .sort({ title: 1 });
    res.json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
};

// Public catalog for the SEO landing pages: active series only, safe fields
// only (never the raw landing HTML), server-side search + pagination.
export const listPublicSeries = async (req, res, next) => {
  try {
    const { q, page = 1, limit = 12 } = req.query;

    const filter = { active: true };
    const term = String(q || '').trim();
    if (term) {
      const regex = new RegExp(escapeRegex(term), 'i');
      filter.$or = [
        { title: regex },
        { description: regex },
        { tags: regex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(48, Math.max(1, parseInt(limit, 10) || 12));

    const [items, total] = await Promise.all([
      TestSeries.find(filter)
        .select('title slug description banner price tags difficulty featured examId createdAt')
        .populate('examId', 'name code')
        .sort({ featured: -1, createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      TestSeries.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: items,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.max(1, Math.ceil(total / limitNum)),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Public detail by slug (or ObjectId fallback). Serves the sanitized landing
// HTML; inactive series are visible to staff only (preview).
export const getPublicSeries = async (req, res, next) => {
  try {
    const key = String(req.params.slug || '');
    const filter = /^[0-9a-fA-F]{24}$/.test(key) ? { _id: key } : { slug: key.toLowerCase() };
    if (!isStaffRole(req.user?.role)) filter.active = true;

    const series = await TestSeries.findOne(filter)
      .select('-__v')
      .populate('examId', 'name code');
    if (!series) {
      return res.status(404).json({ success: false, message: 'Test Series not found.' });
    }
    // Scrub again on read in case a record was written before sanitization existed.
    series.set('body', sanitizeHtml(series.body || ''));
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
