import Coupon from '../models/Coupon.js';
import { logAudit } from '../services/AuditService.js';

export const listCoupons = async (req, res, next) => {
  try {
    const coupons = await Coupon.find({}).sort({ createdAt: -1 });
    res.json({ success: true, data: coupons });
  } catch (error) {
    next(error);
  }
};

export const createCoupon = async (req, res, next) => {
  try {
    const { code, discountType, value, maxUses, minAmount, expiresAt, active } = req.body;

    if (!code || String(code).trim() === '') {
      return res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'Coupon code is required.' });
    }

    const trimmedCode = String(code).toUpperCase().trim();
    const existing = await Coupon.findOne({ code: trimmedCode });
    if (existing) {
      return res.status(409).json({ success: false, code: 'DUPLICATE_CODE', message: `Coupon code "${trimmedCode}" already exists.` });
    }

    if (!['percent', 'flat'].includes(discountType)) {
      return res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'Discount type must be "percent" or "flat".' });
    }

    const numValue = Number(value);
    if (Number.isNaN(numValue) || numValue <= 0) {
      return res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'Discount value must be a positive number.' });
    }

    if (discountType === 'percent' && numValue > 100) {
      return res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'Percent discount cannot exceed 100%.' });
    }

    const coupon = await Coupon.create({
      code: trimmedCode,
      discountType,
      value: numValue,
      maxUses: Number(maxUses) || 0,
      minAmount: Number(minAmount) || 0,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      active: active !== false,
    });

    await logAudit({
      userId: req.user._id,
      action: 'COUPON_CREATE',
      details: `Created coupon "${coupon.code}" (${coupon.discountType} ${coupon.value})`,
      req,
    });

    res.status(201).json({ success: true, data: coupon });
  } catch (error) {
    next(error);
  }
};

export const updateCoupon = async (req, res, next) => {
  try {
    const { code, discountType, value, maxUses, minAmount, expiresAt, active } = req.body;

    if (code && String(code).trim() === '') {
      return res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'Coupon code cannot be empty.' });
    }

    if (discountType && !['percent', 'flat'].includes(discountType)) {
      return res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'Discount type must be "percent" or "flat".' });
    }

    if (value !== undefined && (Number.isNaN(Number(value)) || Number(value) <= 0)) {
      return res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'Discount value must be a positive number.' });
    }

    const updateData = {
      ...(code && { code: String(code).toUpperCase().trim() }),
      ...(discountType && { discountType }),
      ...(value !== undefined && { value: Number(value) }),
      ...(maxUses !== undefined && { maxUses: Number(maxUses) || 0 }),
      ...(minAmount !== undefined && { minAmount: Number(minAmount) || 0 }),
      ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
      ...(active !== undefined && { active: !!active }),
    };

    const coupon = await Coupon.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found.' });
    await logAudit({
      userId: req.user._id,
      action: 'COUPON_UPDATE',
      details: `Updated coupon "${coupon.code}"`,
      req,
    });
    res.json({ success: true, data: coupon });
  } catch (error) {
    next(error);
  }
};

export const deleteCoupon = async (req, res, next) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found.' });
    await Coupon.findByIdAndDelete(req.params.id);
    await logAudit({
      userId: req.user._id,
      action: 'COUPON_DELETE',
      details: `Deleted coupon "${coupon.code}"`,
      req,
    });
    res.json({ success: true, message: 'Coupon deleted.' });
  } catch (error) {
    next(error);
  }
};

export const validateCoupon = async (req, res, next) => {
  try {
    const { code, amount } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Coupon code is required.' });

    const coupon = await Coupon.findOne({ code: String(code).toUpperCase() });
    if (!coupon) return res.status(404).json({ success: false, message: 'Invalid coupon code.' });
    if (!coupon.active) return res.status(400).json({ success: false, message: 'This coupon is no longer active.' });
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      return res.status(400).json({ success: false, message: 'This coupon has expired.' });
    }
    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
      return res.status(400).json({ success: false, message: 'This coupon has reached its usage limit.' });
    }
    if (coupon.minAmount > 0 && (amount || 0) < coupon.minAmount) {
      return res.status(400).json({ success: false, message: `Minimum order amount for this coupon is ₹${coupon.minAmount}.` });
    }

    const discount = coupon.discountType === 'percent'
      ? Math.round(((amount || 0) * coupon.value) / 100)
      : Math.min(coupon.value, amount || 0);

    res.json({ success: true, data: { code: coupon.code, discountType: coupon.discountType, value: coupon.value, discount } });
  } catch (error) {
    next(error);
  }
};
