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
    const { title, code, duration, passingMarks, agencyId, negativeMarking } = req.body;
    const exam = await Exam.create({
      title: title || '',
      code: code || '',
      duration: duration || 0,
      passingMarks: passingMarks !== undefined ? passingMarks : 0,
      negativeMarking: negativeMarking !== undefined ? negativeMarking : 0,
      agencyId: agencyId || null,
    });
    res.status(201).json({ success: true, data: exam });
  } catch (error) {
    next(error);
  }
};

export const updateExam = async (req, res, next) => {
  try {
    const { title, code, duration, passingMarks, agencyId, negativeMarking } = req.body;
    const exam = await Exam.findByIdAndUpdate(
      req.params.id,
      {
        title: title !== undefined ? title : undefined,
        code: code !== undefined ? code : undefined,
        duration: duration !== undefined ? duration : undefined,
        passingMarks: passingMarks !== undefined ? passingMarks : undefined,
        negativeMarking: negativeMarking !== undefined ? negativeMarking : undefined,
        agencyId: agencyId !== undefined ? agencyId : undefined,
      },
      { new: true, runValidators: true }
    );
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
