import User from '../models/User.js';
import TestAttempt from '../models/TestAttempt.js';
import Referral from '../models/Referral.js';

export const getEngagementDashboard = async (req, res, next) => {
  try {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const totalUsers = await User.countDocuments({ role: { $ne: 'Super Admin' } });
    const dau = await User.countDocuments({ lastActiveAt: { $gte: dayStart } });
    const mau = await User.countDocuments({ lastActiveAt: { $gte: monthStart } });

    // Signups per day (last 14 days)
    const signupTrend = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      const count = await User.countDocuments({ createdAt: { $gte: d, $lt: end } });
      signupTrend.push({
        day: d.toLocaleString('en', { day: '2-digit', month: 'short' }),
        signups: count,
      });
    }

    // Signup source breakdown
    const sources = await User.aggregate([
      { $match: { role: { $ne: 'Super Admin' } } },
      { $group: { _id: { $ifNull: ['$signupSource', 'web'] }, count: { $sum: 1 } } },
    ]);

    // Attempts activity (tests attempted in last 14 days)
    const attemptTrend = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      const count = await TestAttempt.countDocuments({ createdAt: { $gte: d, $lt: end } });
      attemptTrend.push({
        day: d.toLocaleString('en', { day: '2-digit', month: 'short' }),
        attempts: count,
      });
    }

    // Rough retention: users active this month vs total
    const activeRatio = totalUsers > 0 ? Math.round((mau / totalUsers) * 100) : 0;

    const referrals = await Referral.find({}).populate('user', 'name email').sort({ referralCount: -1 }).limit(10);

    res.json({
      success: true,
      data: {
        totalUsers,
        dau,
        mau,
        activeRatio,
        signupTrend,
        attemptTrend,
        signupSources: sources.map((s) => ({ source: s._id, count: s.count })),
        topReferrals: referrals.map((r) => ({ name: r.user?.name, email: r.user?.email, referralCount: r.referralCount, rewardAmount: r.rewardAmount })),
      },
    });
  } catch (error) {
    next(error);
  }
};
