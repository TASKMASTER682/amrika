import Exam from '../models/Exam.js';

export const listExams = async (req, res, next) => {
  try {
    const { agencyId } = req.query;
    const filter = {};
    if (agencyId) filter.agencyId = agencyId;
    const exams = await Exam.find(filter).populate('agencyId', 'name code').sort({ name: 1 });
    res.json({ success: true, data: exams });
  } catch (error) {
    next(error);
  }
};

export const getExamById = async (req, res, next) => {
  try {
    const exam = await Exam.findById(req.params.id).populate('agencyId', 'name code');
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found.' });
    }
    res.json({ success: true, data: exam });
  } catch (error) {
    next(error);
  }
};

export const createExam = async (req, res, next) => {
  try {
    const exam = await Exam.create(req.body);
    res.status(201).json({ success: true, data: exam });
  } catch (error) {
    next(error);
  }
};

export const updateExam = async (req, res, next) => {
  try {
    const exam = await Exam.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found.' });
    }
    res.json({ success: true, data: exam });
  } catch (error) {
    next(error);
  }
};

export const deleteExam = async (req, res, next) => {
  try {
    await Exam.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Exam deleted.' });
  } catch (error) {
    next(error);
  }
};
