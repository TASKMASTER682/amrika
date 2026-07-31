import TestSeries from '../models/TestSeries.js';

export const listTestSeries = async (req, res, next) => {
  try {
    const { examId } = req.query;
    const filter = {};
    if (examId) filter.examId = examId;
    const series = await TestSeries.find(filter).populate('examId', 'name code').sort({ title: 1 });
    res.json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
};

export const getTestSeriesById = async (req, res, next) => {
  try {
    const series = await TestSeries.findById(req.params.id).populate('examId', 'name code');
    if (!series) {
      return res.status(404).json({ success: false, message: 'Test Series not found.' });
    }
    res.json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
};

export const createTestSeries = async (req, res, next) => {
  try {
    const series = await TestSeries.create(req.body);
    res.status(201).json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
};

export const updateTestSeries = async (req, res, next) => {
  try {
    const series = await TestSeries.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!series) {
      return res.status(404).json({ success: false, message: 'Test Series not found.' });
    }
    res.json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
};

export const searchTestSeries = async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length === 0) {
      const all = await TestSeries.find({}).populate('examId', 'name code').sort({ title: 1 });
      return res.json({ success: true, data: all });
    }
    const regex = new RegExp(q.trim(), 'i');
    const series = await TestSeries.find({
      $or: [
        { title: regex },
        { description: regex },
        { tags: regex },
      ],
    }).populate('examId', 'name code').sort({ title: 1 });
    res.json({ success: true, data: series });
  } catch (error) {
    next(error);
  }
};

export const deleteTestSeries = async (req, res, next) => {
  try {
    await TestSeries.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Test Series deleted.' });
  } catch (error) {
    next(error);
  }
};
