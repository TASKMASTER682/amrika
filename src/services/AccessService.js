import Order from '../models/Order.js';
import TestSeries from '../models/TestSeries.js';

// A user can attempt a test if:
//  - its test series is free (price <= 0), OR
//  - they have an active subscription/plan, OR
//  - they have a paid order for that specific test series.
export const hasTestSeriesAccess = async (user, testSeriesId) => {
  const series = await TestSeries.findById(testSeriesId);
  if (!series) return false;
  if (!series.price || series.price <= 0) return true;

  if (user.subscription?.status === 'active') {
    if (user.subscription.expiresAt && new Date(user.subscription.expiresAt) > new Date()) return true;
  }

  const paid = await Order.findOne({ user: user._id, testSeries: testSeriesId, status: 'paid' });
  return !!paid;
};

export const hasActiveSubscription = (user) =>
  user.subscription?.status === 'active' &&
  (!user.subscription.expiresAt || new Date(user.subscription.expiresAt) > new Date());

// Scheduled/live test window: returns { status: 'available'|'scheduled'|'expired'|'not_scheduled', opensAt?, closesAt? }
export const getTestAvailability = (test) => {
  if (!test.scheduled) {
    return { status: 'not_scheduled' };
  }
  const now = Date.now();
  const opensAt = test.startTime ? new Date(test.startTime).getTime() : null;
  const closesAt = test.endTime ? new Date(test.endTime).getTime() : null;
  if (opensAt && now < opensAt) {
    return { status: 'scheduled', opensAt: test.startTime, closesAt: test.endTime || null };
  }
  if (closesAt && now > closesAt) {
    return { status: 'expired', opensAt: test.startTime || null, closesAt: test.endTime };
  }
  return { status: 'available', opensAt: test.startTime || null, closesAt: test.endTime || null };
};
