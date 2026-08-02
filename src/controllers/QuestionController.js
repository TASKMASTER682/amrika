import Question from '../models/Question.js';
import QuestionStaging from '../models/QuestionStaging.js';
import Test from '../models/Test.js';
import * as ParserService from '../services/ParserService.js';

export const listQuestions = async (req, res, next) => {
  try {
    const { search, subject, topic, difficulty, language, usageStatus, type, page = 1, limit = 20 } = req.query;

    const filter = { active: true };
    if (subject) filter.subject = subject;
    if (topic) filter.topic = topic;
    if (difficulty) filter.difficulty = difficulty;
    if (language) filter.language = language;
    if (usageStatus) filter.usageStatus = usageStatus;
    if (type) filter.type = type;
    
    if (search) {
      filter.$text = { $search: search };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const questions = await Question.find(filter)
      .skip(skip)
      .limit(Number(limit))
      .sort({ createdAt: -1 });

    const total = await Question.countDocuments(filter);

    res.json({
      success: true,
      data: questions,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getQuestionById = async (req, res, next) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found.',
      });
    }
    res.json({ success: true, data: question });
  } catch (error) {
    next(error);
  }
};

export const createQuestion = async (req, res, next) => {
  try {
    const questionData = {
      ...req.body,
      createdBy: req.user._id,
      version: 1,
    };
    const question = await Question.create(questionData);
    res.status(201).json({ success: true, data: question });
  } catch (error) {
    next(error);
  }
};

export const updateQuestion = async (req, res, next) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ success: false, message: 'Question not found.' });
    }

    // Keep track of revision history
    const historyItem = {
      version: question.version,
      updatedBy: req.user._id,
      updatedAt: new Date(),
      changes: req.body.changeDescription || 'Details modified',
    };

    const updateData = {
      ...req.body,
      version: question.version + 1,
      $push: { revisionHistory: historyItem },
    };

    const updatedQuestion = await Question.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({ success: true, data: updatedQuestion });
  } catch (error) {
    next(error);
  }
};

export const pasteQuestions = async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'No question text provided.' });
    }

    // Detect structured tagged format vs free-form text
    let parsed;
    if (ParserService.isStructuredFormat(text)) {
      parsed = ParserService.parseStructuredText(text, req.user._id, 'paste');
    } else {
      parsed = await ParserService.parseRawText(text, req.user._id, 'paste');
    }

    const normalizeType = (t) => {
      if (!t) return 'Single Correct';
      const map = {
        'assertion-reason': 'Assertion Reason',
        'assertion reason': 'Assertion Reason',
        'match-the-column': 'Match the Following',
        'match the column': 'Match the Following',
        'true-false': 'True False',
        'true false': 'True False',
        'data-interpretation': 'Data Interpretation',
        'data interpretation': 'Data Interpretation',
        'data-sufficiency': 'Data Sufficiency',
        'data sufficiency': 'Data Sufficiency',
        'case-study': 'Case Study',
        'case study': 'Case Study',
        'paragraph-based': 'Paragraph Based',
        'paragraph based': 'Paragraph Based',
        'image-based': 'Image Based',
        'image based': 'Image Based',
        'single-correct': 'Single Correct',
        'single correct': 'Single Correct',
        'multiple-correct': 'Multiple Correct',
        'multiple correct': 'Multiple Correct',
      };
      return map[t.toLowerCase()] || t;
    };

    // Filter out blocks with no question body (e.g. trailing text after last [NEXT])
    const validQuestions = parsed.filter((item) => item.body?.trim());
    if (validQuestions.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid questions found in the provided text.' });
    }

    const questionsToInsert = validQuestions.map((item) => ({
      body: item.body,
      options: item.options,
      correctAnswer: item.correctAnswer,
      type: normalizeType(item.type),
      subject: item.subject || 'General',
      topic: item.topic || 'General',
      subtopic: item.subtopic || '',
      context: item.context || '',
      statements: item.statements || [],
      matchPairs: item.matchPairs || [],
      subQ: item.subQ || '',
      difficulty: item.difficulty || 'Medium',
      language: item.language || 'English',
      explanation: item.explanation || '',
      source: item.source || '',
      year: item.year || new Date().getFullYear(),
      usageStatus: 'unused',
      createdBy: req.user._id,
      approvalStatus: 'Approved',
      version: 1,
    }));

    const saved = await Question.insertMany(questionsToInsert);
    res.status(201).json({
      success: true,
      message: `${saved.length} questions saved as unused.`,
      data: saved,
    });
  } catch (error) {
    next(error);
  }
};

export const listSubjects = async (req, res, next) => {
  try {
    const subjects = await Question.distinct('subject', { active: true, subject: { $ne: '' } });
    res.json({ success: true, data: subjects });
  } catch (error) {
    next(error);
  }
};

// --- DUPLICATE DETECTION ---

/**
 * Finds questions that look like duplicates of a given question.
 * Strategy:
 *  1. Exact normalized-body matches (strongest signal)
 *  2. Same subject + topic with high option-text overlap
 *  3. Text-index similarity via $text (weaker, catches paraphrase)
 */
export const findDuplicateQuestions = async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) {
      return res.status(400).json({ success: false, message: 'Query parameter q is required.' });
    }
    const query = q.trim();
    const normalized = query.replace(/\s+/g, ' ').toLowerCase().trim();

    // 1. Exact body match (case + whitespace normalized)
    const exact = await Question.find({ active: true }).lean();
    const exactMatches = exact.filter((doc) =>
      (doc.body || '').replace(/\s+/g, ' ').toLowerCase().trim() === normalized
    );

    // 2. Text search (requires the text index on body/tags)
    let textMatches = [];
    try {
      textMatches = await Question.find({ active: true, $text: { $search: `"${query}"` } })
        .limit(10)
        .lean();
    } catch (e) {
      textMatches = [];
    }

    // Merge with dedupe, prioritize exact matches
    const seen = new Set();
    const results = [];
    for (const doc of [...exactMatches, ...textMatches]) {
      if (seen.has(doc._id.toString())) continue;
      seen.add(doc._id.toString());
      const similarity = exactMatches.some((d) => d._id.toString() === doc._id.toString()) ? 'exact' : 'similar';
      results.push({ ...doc, matchType: similarity });
    }

    res.json({ success: true, data: results, count: results.length });
  } catch (error) {
    next(error);
  }
};

/**
 * Scans the entire staging area for duplicate candidates against the master
 * bank. Used by the moderation UI to flag staged questions that already exist.
 */
export const findStagedDuplicates = async (req, res, next) => {
  try {
    const staged = await QuestionStaging.find().sort({ createdAt: -1 }).lean();
    const master = await Question.find({ active: true }).select('body subject topic').lean();

    const masterNorm = master.map((m) => ({
      _id: m._id,
      body: (m.body || '').replace(/\s+/g, ' ').toLowerCase().trim(),
      subject: (m.subject || '').toLowerCase(),
      topic: (m.topic || '').toLowerCase(),
    }));

    const enriched = [];
    for (const s of staged) {
      const normBody = (s.body || '').replace(/\s+/g, ' ').toLowerCase().trim();
      const subj = (s.subject || '').toLowerCase();
      const topic = (s.topic || '').toLowerCase();

      const dup = masterNorm.find((m) =>
        m.body === normBody ||
        (m.body && m.body === normBody)
      );
      const similar = masterNorm.find((m) =>
        m.body !== normBody &&
        m.subject === subj &&
        m.topic === topic &&
        m.body &&
        normBody &&
        (m.body.includes(normBody.slice(0, 40)) || normBody.includes(m.body.slice(0, 40)))
      );

      enriched.push({
        ...s,
        duplicateOf: dup ? dup._id : null,
        duplicateMatchType: dup ? 'exact' : (similar ? 'similar' : null),
        duplicatePreview: dup ? master.find((m) => m._id.toString() === dup._id.toString())?.body?.slice(0, 120) : (similar ? master.find((m) => m._id.toString() === similar._id.toString())?.body?.slice(0, 120) : null),
      });
    }

    res.json({
      success: true,
      data: enriched,
      duplicateCount: enriched.filter((e) => e.duplicateOf || e.duplicateMatchType).length,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteQuestion = async (req, res, next) => {
  try {
    const question = await Question.findByIdAndUpdate(
      req.params.id,
      { active: false },
      { new: true }
    );
    if (!question) {
      return res.status(404).json({ success: false, message: 'Question not found.' });
    }
    res.json({ success: true, message: 'Question retired from bank.' });
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteQuestions = async (req, res, next) => {
  try {
    const { ids, hardDelete } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'No question IDs provided.' });
    }
    if (hardDelete) {
      await Question.deleteMany({ _id: { $in: ids } });
    } else {
      await Question.updateMany({ _id: { $in: ids } }, { active: false });
    }
    res.json({ success: true, message: `${ids.length} question(s) deleted.` });
  } catch (error) {
    next(error);
  }
};

// --- STAGING MANAGEMENT ---

export const getStagedQuestions = async (req, res, next) => {
  try {
    const staged = await QuestionStaging.find().sort({ createdAt: -1 });
    res.json({ success: true, data: staged });
  } catch (error) {
    next(error);
  }
};

export const updateStagedQuestion = async (req, res, next) => {
  try {
    const { id } = req.params;
    const item = await QuestionStaging.findByIdAndUpdate(id, req.body, { new: true });
    
    if (!item) {
      return res.status(404).json({ success: false, message: 'Staged question not found' });
    }

    // Clear validation errors upon manual correction
    item.validationErrors = [];
    item.importStatus = 'Pending Review';
    await item.save();

    res.json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

export const deleteStagedQuestion = async (req, res, next) => {
  try {
    await QuestionStaging.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Staged question deleted.' });
  } catch (error) {
    next(error);
  }
};

export const approveStagedQuestionsToTest = async (req, res, next) => {
  try {
    const { ids, testId, sectionName, marksPerQuestion, negativeMarksPerQuestion } = req.body;
    if (!ids || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'No staging IDs provided.' });
    }
    if (!testId) {
      return res.status(400).json({ success: false, message: 'Test ID is required for test-specific mode.' });
    }

    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ success: false, message: 'Test not found.' });
    }

    const items = await QuestionStaging.find({ _id: { $in: ids } });
    const questionsToInsert = [];

    for (const item of items) {
      questionsToInsert.push({
        body: item.body, options: item.options, correctAnswer: item.correctAnswer,
        type: item.type, subject: item.subject || 'General', topic: item.topic || 'General',
        subtopic: item.subtopic, difficulty: item.difficulty, language: item.language,
        explanation: item.explanation, marks: marksPerQuestion || item.marks || 1,
        negativeMarks: negativeMarksPerQuestion || item.negativeMarks || 0,
        source: item.source, year: item.year, examId: item.examId || test.examId,
        agencyId: item.agencyId, tags: [], createdBy: req.user._id,
        approvalStatus: 'Approved', version: 1,
        context: item.context || '',
        statements: item.statements || [],
        matchPairs: item.matchPairs || [],
        subQ: item.subQ || '',
      });
    }

    const inserted = await Question.insertMany(questionsToInsert);
    const questionIds = inserted.map(q => q._id);

    // Add questions to the test or create a new section
    if (sectionName) {
      test.sections.push({
        name: sectionName,
        duration: 0,
        questions: questionIds,
        negativeMarking: negativeMarksPerQuestion > 0,
        marksPerQuestion: marksPerQuestion || 1,
        negativeMarksPerQuestion: negativeMarksPerQuestion || 0,
      });
    } else if (test.sections.length > 0) {
      test.sections[0].questions.push(...questionIds);
    } else {
      test.sections.push({
        name: 'Auto-Imported',
        duration: 0,
        questions: questionIds,
        negativeMarking: false,
        marksPerQuestion: 1,
        negativeMarksPerQuestion: 0,
      });
    }

    await test.save();
    await QuestionStaging.deleteMany({ _id: { $in: ids } });

    res.json({
      success: true,
      message: `Approved ${inserted.length} questions and added to test "${test.title}".`,
    });
  } catch (error) {
    next(error);
  }
};

export const approveStagedQuestions = async (req, res, next) => {
  try {
    const { ids } = req.body; // Array of staging IDs to commit
    if (!ids || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'No staging IDs provided.' });
    }

    const items = await QuestionStaging.find({ _id: { $in: ids } });
    const questionsToInsert = [];

    for (const item of items) {
      questionsToInsert.push({
        body: item.body,
        options: item.options,
        correctAnswer: item.correctAnswer,
        type: item.type,
        subject: item.subject || 'General',
        topic: item.topic || 'General',
        subtopic: item.subtopic,
        difficulty: item.difficulty,
        language: item.language,
        explanation: item.explanation,
        marks: item.marks,
        negativeMarks: item.negativeMarks,
        source: item.source,
        year: item.year,
        createdBy: req.user._id,
        approvalStatus: 'Approved',
        version: 1,
        context: item.context || '',
        statements: item.statements || [],
        matchPairs: item.matchPairs || [],
        subQ: item.subQ || '',
      });
    }

    // Insert into master Question collection
    const inserted = await Question.insertMany(questionsToInsert);

    // Delete committed items from staging
    await QuestionStaging.deleteMany({ _id: { $in: ids } });

    res.json({
      success: true,
      message: `Successfully approved and imported ${inserted.length} questions to the main Question Bank.`,
    });
  } catch (error) {
    next(error);
  }
};
