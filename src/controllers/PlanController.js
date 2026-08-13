import Plan from '../models/Plan.js';
import { logAudit } from '../services/AuditService.js';

// Every premium pack ships with these perks out of the box — the free tier is
// where they get restricted, not individual paid packs.
const DEFAULT_PREMIUM_FEATURES = [
  'Unlimited full-length mock tests',
  'Old papers with solutions',
  'Detailed performance analytics & reports',
  'Weekly Sunday Free Mock',
  'Priority doubt resolution',
  'Ad-free experience',
];

export const listPlans = async (req, res, next) => {
  try {
    const { active } = req.query;
    const filter = {};
    if (req.user?.role !== 'Super Admin') filter.active = true;
    if (active !== undefined) filter.active = active === 'true';
    const plans = await Plan.find(filter)
      .populate('agencyIds', 'name')
      .populate('examIds', 'name code')
      .sort({ price: 1 });

    // Targeted packs are shown to a student only when their saved preferences
    // overlap the plan's scope. General plans (no exams) show for everyone.
    if (req.user?.role !== 'Super Admin') {
      const userAgencies = new Set([
        ...(req.user.agencies || []).map((a) => String(a)),
        ...(req.user.primaryAgency ? [String(req.user.primaryAgency)] : []),
      ]);
      const userExams = (req.user.exams || []).map(String);
      const filtered = plans.filter((p) => {
        const toIds = (arr) => (arr || []).map((x) => String(x?._id || x));
        const examIds = toIds(p.examIds);
        if (examIds.length === 0) return true; // general plan — everyone
        if (userExams.length === 0) return false; // no exam preference yet — skip targeted
        if (!examIds.some((id) => userExams.includes(id))) return false;
        const agIds = toIds(p.agencyIds);
        if (agIds.length === 0) return true;
        return agIds.some((id) => userAgencies.has(id));
      });
      return res.json({ success: true, data: filtered });
    }

    res.json({ success: true, data: plans });
  } catch (error) {
    next(error);
  }
};

// Shape/Sanitize targeted-pack fields coming from the admin builder.
const sanitizePlanInput = (body) => {
  const coverage = body.coverage || {};
  const type = ['all', 'fraction', 'random', 'manual'].includes(coverage.type) ? coverage.type : 'all';
  let fraction = 1;
  if (type === 'fraction' || type === 'random') {
    fraction = Math.min(1, Math.max(0.01, Number(coverage.fraction) || 0.5));
  }
  body.coverage = {
    type,
    fraction,
    ...(type === 'manual' ? { seriesIds: Array.isArray(coverage.seriesIds) ? coverage.seriesIds : [] } : {}),
    ...((type === 'fraction' || type === 'random') &&
      Array.isArray(coverage.seriesIds) && coverage.seriesIds.length > 0
      ? { seriesIds: coverage.seriesIds }
      : {}),
  };
  if (!Array.isArray(body.agencyIds)) body.agencyIds = [];
  if (!Array.isArray(body.examIds)) body.examIds = [];
  // Premium perks are automatic on every paid pack; extra features may still be merged in.
  if (!Array.isArray(body.features) || body.features.length === 0) {
    body.features = DEFAULT_PREMIUM_FEATURES;
  } else {
    body.features = [...new Set([...DEFAULT_PREMIUM_FEATURES, ...body.features.map(String)])];
  }
  if (body.durationMonths !== undefined) {
    body.durationMonths = Math.max(0, Math.floor(Number(body.durationMonths) || 0));
    if (body.durationMonths === 0) body.durationDays = 0;
    else if (body.durationDays === undefined) body.durationDays = body.durationMonths * 30;
  }
  return body;
};

export const getPlanById = async (req, res, next) => {
  try {
    const plan = await Plan.findById(req.params.id)
      .populate('agencyIds', 'name')
      .populate('examIds', 'name code');
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found.' });
    res.json({ success: true, data: plan });
  } catch (error) {
    next(error);
  }
};

export const createPlan = async (req, res, next) => {
  try {
    const planData = sanitizePlanInput({ ...req.body });
    const plan = await Plan.create(planData);
    await logAudit({
      userId: req.user._id,
      action: 'PLAN_CREATE',
      details: `Created plan "${plan.name}" (₹${plan.price})`,
      req,
    });
    res.status(201).json({ success: true, data: plan });
  } catch (error) {
    next(error);
  }
};

export const updatePlan = async (req, res, next) => {
  try {
    const planData = sanitizePlanInput({ ...req.body });
    const plan = await Plan.findByIdAndUpdate(req.params.id, planData, { new: true, runValidators: true });
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found.' });
    await logAudit({
      userId: req.user._id,
      action: 'PLAN_UPDATE',
      details: `Updated plan "${plan.name}"`,
      req,
    });
    res.json({ success: true, data: plan });
  } catch (error) {
    next(error);
  }
};

export const deletePlan = async (req, res, next) => {
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found.' });
    await Plan.findByIdAndDelete(req.params.id);
    await logAudit({
      userId: req.user._id,
      action: 'PLAN_DELETE',
      details: `Deleted plan "${plan.name}"`,
      req,
    });
    res.json({ success: true, message: 'Plan deleted.' });
  } catch (error) {
    next(error);
  }
};
