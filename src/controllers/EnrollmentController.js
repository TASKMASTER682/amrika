import Enrollment from '../models/Enrollment.js';
import TestSeries from '../models/TestSeries.js';
import Order from '../models/Order.js';
import { hasTestSeriesAccess } from '../services/AccessService.js';

export const enroll = async (req, res, next) => {
  try {
    const { testSeriesId } = req.params;
    const testSeries = await TestSeries.findById(testSeriesId);
    if (!testSeries) {
      return res.status(404).json({ success: false, message: 'Test Series not found.' });
    }
    if (!testSeries.active) {
      return res.status(409).json({ success: false, message: 'This test series is no longer available for enrollment.' });
    }
    
    // Check if paid test series - require payment or subscription
    if (testSeries.price > 0) {
      const hasAccess = await hasTestSeriesAccess(req.user, testSeriesId);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          code: 'PAYMENT_REQUIRED',
          message: 'This is a paid test series. Please purchase it first to enroll.',
        });
      }
    }
    
    const existing = await Enrollment.findOne({ userId: req.user._id, testSeriesId });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Already enrolled in this test series.' });
    }
    const enrollment = await Enrollment.create({ userId: req.user._id, testSeriesId });
    res.status(201).json({ success: true, data: enrollment });
  } catch (error) {
    next(error);
  }
};

export const unenroll = async (req, res, next) => {
  try {
    const { testSeriesId } = req.params;
    const enrollment = await Enrollment.findOneAndDelete({ userId: req.user._id, testSeriesId });
    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'Enrollment not found.' });
    }
    res.json({ success: true, message: 'Unenrolled successfully.' });
  } catch (error) {
    next(error);
  }
};

export const myEnrollments = async (req, res, next) => {
  try {
    const enrollments = await Enrollment.find({ userId: req.user._id })
      .populate({
        path: 'testSeriesId',
        populate: { path: 'examId', select: 'name code' },
      })
      .sort({ enrolledAt: -1 });
    res.json({ success: true, data: enrollments });
  } catch (error) {
    next(error);
  }
};

export const checkEnrolled = async (req, res, next) => {
  try {
    const { testSeriesId } = req.params;
    const enrollment = await Enrollment.findOne({ userId: req.user._id, testSeriesId });
    res.json({ success: true, enrolled: !!enrollment });
  } catch (error) {
    next(error);
  }
};
