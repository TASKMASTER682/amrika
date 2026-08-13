import Order from '../models/Order.js';
import TestSeries from '../models/TestSeries.js';
import Plan from '../models/Plan.js';

export const hasActiveSubscription = (user) =>
  user?.subscription?.status === 'active' &&
  (!user?.subscription?.expiresAt || new Date(user.subscription.expiresAt) > new Date());

// Load the plan behind an active subscription, if any.
export const getActiveUserPlan = async (user) => {
  if (!hasActiveSubscription(user) || !user?.subscription?.planId) return null;
  return Plan.findById(user.subscription.planId);
};

// Deterministic per-series hash so a fraction-based pack keeps the same series
// steady across reloads while newly created series automatically circulate in.
const stableHash = (str) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
};

// Live-follow coverage: does an active plan unlock this test series?
//   'all'      -> yes for any series under the plan's exams
//   'manual'   -> only the series the admin hand-picked
//   'fraction'/'random' -> ~fraction of the exam's series, picked deterministically,
//                          plus any series the admin manually pinned in seriesIds
// General plans (empty examIds) cover no series by themselves — member-only
// tests are still unlocked via their own includedInSubscription flag.
export const isSeriesCoveredByPlan = (plan, series) => {
  if (!plan || !series) return false;
  const examIds = (plan.examIds || []).map(String);
  if (!examIds.includes(String(series.examId))) return false;
  const cov = plan.coverage || {};
  const type = cov.type || 'all';
  if (type === 'manual') return (cov.seriesIds || []).map(String).includes(String(series._id));
  if (type === 'fraction' || type === 'random') {
    const pinned = (cov.seriesIds || []).map(String);
    if (pinned.includes(String(series._id))) return true;
    const fraction = Math.min(1, Math.max(0, Number(cov.fraction) || 1));
    if (fraction >= 1) return true;
    if (fraction <= 0) return false;
    return stableHash(String(series._id)) % 100 < fraction * 100;
  }
  return true;
};

// Is the test currently inside its public free-access window (Sunday free mock, trials)?
export const isWithinFreeWindow = (test) => {
  if (!test?.freeWindow) return false;
  const opens = test.freeWindow.from ? new Date(test.freeWindow.from).getTime() : -Infinity;
  const closes = test.freeWindow.to ? new Date(test.freeWindow.to).getTime() : Infinity;
  const now = Date.now();
  return now >= opens && now <= closes;
};

// Can `user` attempt this specific test?
//  1. Free window -> public, no payment needed.
//  2. Free series (price <= 0)            -> open.
//  3. Active subscription + includedInSubscription test -> member unlock.
//  4. Active subscription whose plan covers this test's series -> pack unlock (live-follow).
//  5. Paid order for the test's series    -> purchased unlock.
// NOTE: an active subscription alone does NOT unlock priced targeted batches —
// the series must be part of the active plan's scope.
export const canAttemptTest = async (user, test, series) => {
  if (!test) return false;
  if (isWithinFreeWindow(test)) return true;

  const maxTier = user?.role === 'Super Admin' || user?.role === 'Content Manager';
  if (maxTier) return true;

  if (test.status !== 'published' || test.active === false) return false;

  const s = series || (test.testSeriesId ? await TestSeries.findById(test.testSeriesId) : null);
  if (s && (!s.price || s.price <= 0)) return true;

  if (hasActiveSubscription(user)) {
    if (test.includedInSubscription) return true;
    if (s) {
      const plan = await getActiveUserPlan(user);
      if (plan && isSeriesCoveredByPlan(plan, s)) return true;
    }
  }

  if (s && user) {
    const paid = await Order.findOne({ user: user._id, testSeries: s._id, status: 'paid' });
    if (paid) return true;
  }

  return false;
};

// A user can attempt a test if:
//  - the test is publicly free (no payment), OR
//  - it belongs to a series covered by their active plan (live-follow pack), OR
//  - they have a paid order for that specific test series.
// Kept for series-level callers; prefer canAttemptTest(test) for per-test gating.
export const hasTestSeriesAccess = async (user, testSeriesId) => {
  const series = await TestSeries.findById(testSeriesId);
  if (!series) return false;
  if (!series.price || series.price <= 0) return true;

  if (hasActiveSubscription(user)) {
    const plan = await getActiveUserPlan(user);
    if (plan && isSeriesCoveredByPlan(plan, series)) return true;
  }

  const paid = await Order.findOne({ user: user._id, testSeries: testSeriesId, status: 'paid' });
  return !!paid;
};

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
