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
    // Schema contract: { agencyId, name, code, description?, active? }
    const { name, code, description, agencyId, active } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'Exam name is required.' });
    }
    if (!code || !String(code).trim()) {
      return res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'Exam code is required.' });
    }
    if (!agencyId) {
      return res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'Agency is required.' });
    }

    const exam = await Exam.create({
      name: String(name).trim(),
      code: String(code).trim(),
      ...(description !== undefined ? { description } : {}),
      agencyId,
      ...(active !== undefined ? { active } : {}),
    });
    res.status(201).json({ success: true, data: exam });
  } catch (error) {
    next(error);
  }
};

export const updateExam = async (req, res, next) => {
  try {
    // Only apply the fields the client actually sent — never unset the rest.
    const allowed = ['name', 'code', 'description', 'agencyId', 'active'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const exam = await Exam.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
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
