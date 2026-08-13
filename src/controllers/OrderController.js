import crypto from 'crypto';
import Razorpay from 'razorpay';
import Order from '../models/Order.js';
import Plan from '../models/Plan.js';
import TestSeries from '../models/TestSeries.js';
import User from '../models/User.js';
import Coupon from '../models/Coupon.js';
import Referral from '../models/Referral.js';
import Enrollment from '../models/Enrollment.js';
import RazorpayConfig from '../models/RazorpayConfig.js';
import { hasActiveSubscription } from '../services/AccessService.js';
import { logAudit } from '../services/AuditService.js';

let cachedConfig = null;

const getRazorpayConfig = async () => {
  if (cachedConfig) return cachedConfig;
  const config = await RazorpayConfig.findOne({});
  if (config) {
    cachedConfig = { keyId: config.keyId, keySecret: config.keySecret };
    return cachedConfig;
  }
  // Fallback to env
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (keyId && keySecret) {
    cachedConfig = { keyId, keySecret };
    return cachedConfig;
  }
  return null;
};

const getRazorpay = async () => {
  const config = await getRazorpayConfig();
  if (!config) return null;
  return new Razorpay({ key_id: config.keyId, key_secret: config.keySecret });
};

export const clearRazorpayCache = () => {
  cachedConfig = null;
};

const computeCouponDiscount = async (couponCode, amount) => {
  if (!couponCode) return { discount: 0, coupon: null };
  const coupon = await Coupon.findOne({ code: String(couponCode).toUpperCase() });
  if (!coupon || !coupon.active) {
    throw new Error('Invalid coupon code.');
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) throw new Error('This coupon has expired.');
  if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) throw new Error('This coupon has reached its usage limit.');
  if (coupon.minAmount > 0 && amount < coupon.minAmount) throw new Error(`Minimum order amount for this coupon is ₹${coupon.minAmount}.`);
  const discount = coupon.discountType === 'percent'
    ? Math.round((amount * coupon.value) / 100)
    : Math.min(coupon.value, amount);
  return { discount, coupon };
};

export const checkout = async (req, res, next) => {
  try {
    const { type, planId, testSeriesId, couponCode } = req.body;
    let entity;
    let amount = 0;

    if (type === 'plan') {
      entity = await Plan.findById(planId);
      if (!entity) return res.status(404).json({ success: false, message: 'Plan not found.' });
      amount = entity.price;
      if (hasActiveSubscription(req.user) && req.user.subscription?.planId?.toString() === entity._id.toString()) {
        return res.status(400).json({ success: false, message: 'You already have an active subscription for this plan.' });
      }
    } else if (type === 'test_series') {
      entity = await TestSeries.findById(testSeriesId);
      if (!entity) return res.status(404).json({ success: false, message: 'Test series not found.' });
      amount = entity.price || 0;
    } else {
      return res.status(400).json({ success: false, message: 'Invalid order type.' });
    }

    if (amount <= 0) {
      return res.status(400).json({ success: false, message: 'This item is free — no payment required.' });
    }

    const { discount, coupon } = await computeCouponDiscount(couponCode, amount);
    const payable = Math.max(0, amount - discount);

    const order = await Order.create({
      user: req.user._id,
      type,
      ...(type === 'plan' ? { plan: entity._id } : { testSeries: entity._id }),
      amount: payable,
      subtotal: amount,
      couponCode: coupon?.code,
      discount,
      status: 'pending',
    });

    const rzp = await getRazorpay();
    const config = await getRazorpayConfig();
    let razorpayOrderId;
    let mode = 'offline';
    if (rzp) {
      const rzpOrder = await rzp.orders.create({
        amount: Math.round(payable * 100),
        currency: 'INR',
        receipt: `order_${order._id}`,
        notes: { userId: String(req.user._id), type },
      });
      razorpayOrderId = rzpOrder.id;
      order.razorpayOrderId = razorpayOrderId;
      order.paymentProvider = 'razorpay';
      await order.save();
      mode = 'razorpay';
    }

    res.status(201).json({
      success: true,
      data: {
        orderId: order._id,
        razorpayOrderId,
        mode,
        keyId: config?.keyId ?? null,
        amount: payable,
        currency: 'INR',
        subtotal: amount,
        discount,
        item: { name: entity.name || entity.title, price: amount },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const verifyPayment = async (req, res, next) => {
  try {
    const { orderId, razorpay_payment_id, razorpay_order_id, razorpay_signature, mode } = req.body;

    const order = await Order.findOne({ _id: orderId, user: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    if (order.status === 'paid') {
      return res.json({ success: true, data: { order, alreadyPaid: true } });
    }

    if (mode !== 'offline') {
      const config = await getRazorpayConfig();
      if (!config?.keySecret) {
        return res.status(400).json({ success: false, message: 'Razorpay not configured.' });
      }
      if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
        return res.status(400).json({ success: false, message: 'Missing Razorpay payment details.' });
      }
      const expected = crypto
        .createHmac('sha256', config.keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');
      if (expected !== razorpay_signature) {
        return res.status(400).json({ success: false, message: 'Payment verification failed.' });
      }
      order.paymentId = razorpay_payment_id;
    }

    order.status = 'paid';
    order.paymentId = order.paymentId || `offline_${Date.now()}`;
    await order.save();

    if (order.couponCode) {
      await Coupon.updateOne({ code: order.couponCode }, { $inc: { usedCount: 1 } });
    }

    const user = req.user;
    if (order.type === 'plan' && order.plan) {
      const plan = await Plan.findById(order.plan);
      const durationMonths = plan?.durationMonths ?? 0;
      const durationDays = durationMonths > 0
        ? durationMonths * 30
        : (plan?.durationDays ?? 30);
      const now = new Date();
      let expiresAt = null;
      if (durationDays > 0) {
        expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
      }
      user.subscription = { planId: order.plan, startedAt: now, expiresAt, status: 'active' };
      await user.save();
    } else if (order.type === 'test_series' && order.testSeries) {
      // Create enrollment for paid test series
      await Enrollment.findOneAndUpdate(
        { userId: user._id, testSeriesId: order.testSeries },
        { userId: user._id, testSeriesId: order.testSeries },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    // Referral reward: credit referrer 10% of this user's first paid order.
    if (user.referredBy && order.type === 'plan') {
      const firstPaid = await Order.countDocuments({ user: user._id, status: 'paid' });
      if (firstPaid <= 1) {
        const reward = Math.round(order.amount * 0.1);
        const ref = await Referral.findOneAndUpdate(
          { user: user.referredBy },
          { $inc: { referralCount: 1, rewardAmount: reward } },
          { new: true, upsert: true, setDefaultsOnInsert: true },
        );
        if (!ref.code) {
          const code = `REF${user.referredBy.toString().slice(-4).toUpperCase()}${crypto.randomInt(10, 100)}`;
          await Referral.updateOne({ _id: ref._id }, { $set: { code } });
        }
      }
    }

    res.json({ success: true, data: { order, user } });
  } catch (error) {
    next(error);
  }
};

export const myOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .populate('plan', 'name price')
      .populate('testSeries', 'title price')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: orders });
  } catch (error) {
    next(error);
  }
};

export const adminListOrders = async (req, res, next) => {
  try {
    const { status, type } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    const orders = await Order.find(filter)
      .populate('user', 'name email')
      .populate('plan', 'name price')
      .populate('testSeries', 'title price')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: orders });
  } catch (error) {
    next(error);
  }
};

export const refundOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    if (order.status !== 'paid') return res.status(400).json({ success: false, message: 'Only paid orders can be refunded.' });

    order.status = 'refunded';
    await order.save();

    if (order.type === 'plan') {
      const user = await User.findById(order.user);
      if (user && user.subscription?.planId?.toString() === order.plan?.toString()) {
        user.subscription.status = 'expired';
        user.subscription.expiresAt = new Date();
        await user.save();
      }
    }

    await logAudit({
      userId: req.user._id,
      action: 'ORDER_REFUND',
      details: `Refunded order ${order._id} (₹${order.amount}) for user ${order.user}`,
      req,
    });

    res.json({ success: true, message: 'Order refunded.' });
  } catch (error) {
    next(error);
  }
};

// Public list of plans for the student-facing pricing page (only active plans)
export const listActivePlans = async (req, res, next) => {
  try {
    const plans = await Plan.find({ active: true }).sort({ price: 1 });
    res.json({ success: true, data: plans });
  } catch (error) {
    next(error);
  }
};
