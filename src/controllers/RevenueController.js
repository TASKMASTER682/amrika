import Order from '../models/Order.js';
import User from '../models/User.js';

export const getRevenueDashboard = async (req, res, next) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const paidOrders = await Order.find({ status: 'paid' });
    const totalRevenue = paidOrders.reduce((sum, o) => sum + (o.amount || 0), 0);
    const totalOrders = paidOrders.length;

    const monthOrders = paidOrders.filter((o) => o.createdAt >= monthStart);
    const mrr = monthOrders.reduce((sum, o) => sum + (o.amount || 0), 0);

    const last30Orders = await Order.find({ status: 'paid', createdAt: { $gte: thirtyDaysAgo } });

    // Top test series by revenue
    const seriesMap = {};
    paidOrders.filter((o) => o.type === 'test_series').forEach((o) => {
      const key = o.testSeries ? o.testSeries.toString() : 'unknown';
      seriesMap[key] = (seriesMap[key] || 0) + (o.amount || 0);
    });
    const topSeriesIds = Object.entries(seriesMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
    const { default: TestSeries } = await import('../models/TestSeries.js');
    const seriesDocs = await TestSeries.find({ _id: { $in: topSeriesIds } }).select('title price');
    const seriesNameMap = {};
    seriesDocs.forEach((s) => { seriesNameMap[s._id.toString()] = s.title; });

    const topSeries = Object.entries(seriesMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, revenue]) => ({ id, name: seriesNameMap[id] || 'Unknown Series', revenue }));

    // Monthly trend (last 6 months)
    const trend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const inMonth = paidOrders.filter((o) => o.createdAt >= d && o.createdAt < end);
      trend.push({
        month: d.toLocaleString('en', { month: 'short', year: '2-digit' }),
        revenue: inMonth.reduce((s, o) => s + (o.amount || 0), 0),
        orders: inMonth.length,
      });
    }

    // Funnel: signups -> users who placed any order -> paid orders
    const totalUsers = await User.countDocuments({ role: { $ne: 'Super Admin' } });
    const usersWithOrder = new Set(paidOrders.map((o) => o.user.toString())).size;

    const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    res.json({
      success: true,
      data: {
        totalRevenue,
        totalOrders,
        mrr,
        avgOrderValue,
        revenueLast30Days: last30Orders.reduce((s, o) => s + (o.amount || 0), 0),
        topSeries,
        trend,
        funnel: { totalUsers, usersWithOrder, paidUsers: usersWithOrder },
      },
    });
  } catch (error) {
    next(error);
  }
};
