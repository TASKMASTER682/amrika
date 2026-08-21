import TestAttempt from '../models/TestAttempt.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import { logAudit } from '../services/AuditService.js';

const logAction = async (req, action, details) => {
  await logAudit({ userId: req.user._id, action, details, req });
};

const ALL_ROLES = ['User', 'Content Manager', 'Support', 'Super Admin'];
const STAFF_ROLES = ['Super Admin', 'Content Manager', 'Support'];

const escapeRegex = (s = '') => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const listAttempts = async (req, res, next) => {
  try {
    const { status, q } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const studentFilter = {};
    if (q) {
      const safeQ = escapeRegex(q);
      studentFilter.$or = [
        { name: { $regex: safeQ, $options: 'i' } },
        { email: { $regex: safeQ, $options: 'i' } },
      ];
    }

    const students = q ? await User.find(studentFilter).select('_id') : null;
    if (q) {
      filter.studentId = { $in: students.map((s) => s._id) };
    }

    const attempts = await TestAttempt.find(filter)
      .populate('studentId', 'name email')
      .populate('testId', 'title duration status')
      .sort({ createdAt: -1 })
      .limit(200);

    res.json({ success: true, data: attempts });
  } catch (error) {
    next(error);
  }
};

export const getAttemptDetail = async (req, res, next) => {
  try {
    const attempt = await TestAttempt.findById(req.params.id)
      .populate('studentId', 'name email role')
      .populate('answers.questionId')
      .populate('testId');

    if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found.' });
    res.json({ success: true, data: attempt });
  } catch (error) {
    next(error);
  }
};

export const listUsers = async (req, res, next) => {
  try {
    const { q, role, page, limit } = req.query;
    const filter = {};
    if (role && ALL_ROLES.includes(role)) filter.role = role;
    if (q) {
      filter.$or = [
        { name: { $regex: escapeRegex(q), $options: 'i' } },
        { email: { $regex: escapeRegex(q), $options: 'i' } },
      ];
    }
    const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const pg = Math.max(parseInt(page, 10) || 1, 1);
    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip((pg - 1) * lim)
        .limit(lim),
      User.countDocuments(filter),
    ]);
    res.json({ success: true, data: users, total, page: pg, pages: Math.ceil(total / lim) || 1 });
  } catch (error) {
    next(error);
  }
};

export const getUserStats = async (req, res, next) => {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [byRole, suspended, premium, newLast7Days] = await Promise.all([
      User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
      User.countDocuments({ active: false }),
      User.countDocuments({ 'subscription.status': 'active' }),
      User.countDocuments({ createdAt: { $gte: weekAgo } }),
    ]);
    const roleMap = {};
    let total = 0;
    for (const r of byRole) {
      roleMap[r._id || 'User'] = r.count;
      total += r.count;
    }
    const staff = STAFF_ROLES.reduce((sum, r) => sum + (roleMap[r] || 0), 0);
    res.json({
      success: true,
      data: {
        total,
        staff,
        candidates: roleMap['User'] || 0,
        suspended,
        premium,
        newLast7Days,
        byRole: roleMap,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const { active, role } = req.body;
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: 'User not found.' });

    const isSelf = req.user._id.toString() === target._id.toString();
    const targetIsSuper = target.role === 'Super Admin';

    // Role change guards
    if (role !== undefined && role !== target.role) {
      if (!ALL_ROLES.includes(role)) {
        return res.status(400).json({ success: false, message: 'Invalid role.' });
      }
      if (isSelf) {
        return res.status(400).json({ success: false, message: 'You cannot change your own role. Ask another Super Admin.' });
      }
      if (targetIsSuper) {
        return res.status(400).json({ success: false, message: 'Cannot change the role of another Super Admin.' });
      }
    }

    // Suspension guards
    if (active !== undefined && !!active !== !!target.active) {
      if (isSelf) {
        return res.status(400).json({ success: false, message: 'You cannot suspend your own account.' });
      }
      if (targetIsSuper) {
        return res.status(400).json({ success: false, message: 'Cannot suspend another Super Admin.' });
      }
    }

    if (active !== undefined) {
      target.active = !!active;
      await logAction(req, 'USER_STATUS_CHANGE', `Set ${target.email} active=${target.active}`);
    }
    if (role !== undefined && role !== target.role) {
      target.role = role;
      await logAction(req, 'USER_ROLE_CHANGE', `Set ${target.email} role=${target.role}`);
    }
    await target.save();
    res.json({ success: true, data: target });
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: 'User not found.' });

    const isSelf = req.user._id.toString() === target._id.toString();
    if (isSelf) return res.status(400).json({ success: false, message: 'You cannot delete your own account.' });
    if (target.role === 'Super Admin') {
      return res.status(400).json({ success: false, message: 'Cannot delete another Super Admin.' });
    }

    await target.deleteOne();
    await logAction(req, 'USER_DELETE', `Deleted user ${target.email}`);
    res.json({ success: true, message: 'User deleted.' });
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const { newPassword, adminPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }
    // Secondary verification: the acting Super Admin must re-enter their own password.
    if (!adminPassword || !(await req.user.comparePassword(adminPassword))) {
      return res.status(403).json({ success: false, code: 'ADMIN_REAUTH_REQUIRED', message: 'Please re-enter your admin password to confirm this action.' });
    }
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: 'User not found.' });

    target.password = newPassword; // pre-save hook hashes it
    await target.save();
    await logAction(req, 'ADMIN_RESET_PASSWORD', `Reset password for ${target.email}`);
    res.json({ success: true, message: 'Password reset successfully.' });
  } catch (error) {
    next(error);
  }
};

export const forceLogout = async (req, res, next) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: 'User not found.' });
    target.refreshTokenVersion = (target.refreshTokenVersion || 0) + 1;
    await target.save();
    await logAction(req, 'FORCE_LOGOUT', `Force logout for ${target.email}`);
    res.json({ success: true, message: 'User logged out from all devices.' });
  } catch (error) {
    next(error);
  }
};

export const listAuditLogs = async (req, res, next) => {
  try {
    const logs = await AuditLog.find({})
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
};
