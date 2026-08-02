import Plan from '../models/Plan.js';
import { logAudit } from '../services/AuditService.js';

export const listPlans = async (req, res, next) => {
  try {
    const { active } = req.query;
    const filter = {};
    if (req.user?.role !== 'Super Admin') filter.active = true;
    if (active !== undefined) filter.active = active === 'true';
    const plans = await Plan.find(filter).sort({ price: 1 });
    res.json({ success: true, data: plans });
  } catch (error) {
    next(error);
  }
};

export const getPlanById = async (req, res, next) => {
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found.' });
    res.json({ success: true, data: plan });
  } catch (error) {
    next(error);
  }
};

export const createPlan = async (req, res, next) => {
  try {
    const plan = await Plan.create(req.body);
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
    const plan = await Plan.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
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
