import TestAttempt from '../models/TestAttempt.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import { logAudit } from '../services/AuditService.js';

const logAction = async (req, action, details) => {
  await logAudit({ userId: req.user._id, action, details, req });
};

export const listAttempts = async (req, res, next) => {
  try {
    const { status, q } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const studentFilter = {};
    if (q) {
      studentFilter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
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
    const { q, role } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
      ];
    }
    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const { active, role } = req.body;
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: 'User not found.' });
    if (target.role === 'Super Admin' && req.user._id.toString() !== target._id.toString() && role !== 'Super Admin') {
      return res.status(400).json({ success: false, message: 'Cannot demote another Super Admin.' });
    }

    if (active !== undefined) {
      target.active = !!active;
      await logAction(req, 'USER_STATUS_CHANGE', `Set ${target.email} active=${target.active}`);
    }
    if (role !== undefined) {
      // Only Super Admin can assign/change staff roles
      const allowedRoles = ['Super Admin', 'Content Manager', 'Support', 'User'];
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({ success: false, message: 'Invalid role.' });
      }
      if (req.user.role !== 'Super Admin') {
        return res.status(403).json({ success: false, message: 'Only Super Admin can change roles.' });
      }
      target.role = role;
      await logAction(req, 'USER_ROLE_CHANGE', `Set ${target.email} role=${target.role}`);
    }
    await target.save();
    res.json({ success: true, data: target });
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
