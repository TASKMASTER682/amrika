import Papa from 'papaparse';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import XLSX from 'xlsx';
import QuestionStaging from '../models/QuestionStaging.js';
import { normalizeQuestionType } from '../models/Question.js';

/**
 * Parses a CSV buffer into staging records
 */
export const parseCSV = async (buffer, userId, filename, opts = {}) => {
  const text = buffer.toString('utf8');
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
  });

  const stagingRecords = [];

  for (const row of parsed.data) {
    const body = row.Question || row.question || row.body || '';
    const explanation = row.Explanation || row.explanation || '';
    const subject = row.Subject || row.subject || '';
    const topic = row.Topic || row.topic || '';
    const subtopic = row.Subtopic || row.subtopic || '';
    const type = row.Type || row.type || 'Single Correct';
    const difficulty = row.Difficulty || row.difficulty || 'Medium';
    const language = row.Language || row.language || 'English';
    const marks = Number(row.Marks || row.marks || 1);
    const negativeMarks = Number(row.NegativeMarks || row.negativeMarks || 0);
    const source = row.Source || row.source || '';
    const year = Number(row.Year || row.year || new Date().getFullYear());

    // Extract options
    const options = [];
    ['A', 'B', 'C', 'D', 'E'].forEach((key) => {
      const optionVal = row[`Option ${key}`] || row[`option_${key.toLowerCase()}`] || row[`Option_${key}`] || row[key];
      if (optionVal) {
        options.push({ key, text: optionVal.trim() });
      }
    });

    // Extract correct answers (comma-separated if multiple correct)
    const rawAnswer = row['Correct Answer'] || row['correct_answer'] || row['Answer'] || row['answer'] || '';
    const correctAnswer = rawAnswer.split(',').map(ans => ans.trim()).filter(Boolean);

    const validationErrors = [];
    if (!body) validationErrors.push('Missing Question body text.');
    if (options.length === 0 && !['Integer', 'Numerical'].includes(type)) {
      validationErrors.push('No options found for this option-based question.');
    }
    if (correctAnswer.length === 0) validationErrors.push('Missing correct answer.');
    if (!subject) validationErrors.push('Missing subject tag.');
    if (!topic) validationErrors.push('Missing topic tag.');

    stagingRecords.push({
      body: body.trim(),
      options,
      correctAnswer,
      type: normalizeQuestionType(type),
      subject: subject.trim(),
      topic: topic.trim(),
      subtopic: subtopic.trim(),
      difficulty,
      language,
      explanation: explanation.trim(),
      marks,
      negativeMarks,
      source,
      year,
      validationErrors,
      importStatus: validationErrors.length > 0 ? 'Failed Validation' : 'Pending Review',
      uploadedBy: userId,
      fileSourceName: filename,
      mode: opts.mode || 'bank',
      examId: opts.examId || undefined,
      testSeriesId: opts.testSeriesId || undefined,
      sectionName: opts.sectionName || '',
      imageUrl: row['Image URL'] || row.imageUrl || row.image_url || '',
    });
  }

  return await QuestionStaging.insertMany(stagingRecords);
};

/**
 * Parses XLSX/XLS Excel buffer into staging records
 */
export const parseXLSX = async (buffer, userId, filename, opts = {}) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

  const stagingRecords = [];

  for (const row of rows) {
    const body = row.Question || row.question || row.body || '';
    const explanation = row.Explanation || row.explanation || '';
    const subject = row.Subject || row.subject || '';
    const topic = row.Topic || row.topic || '';
    const subtopic = row.Subtopic || row.subtopic || '';
    const type = row.Type || row.type || 'Single Correct';
    const difficulty = row.Difficulty || row.difficulty || 'Medium';
    const language = row.Language || row.language || 'English';
    const marks = Number(row.Marks || row.marks || 1);
    const negativeMarks = Number(row.NegativeMarks || row.negativeMarks || 0);
    const source = row.Source || row.source || '';
    const year = Number(row.Year || row.year || new Date().getFullYear());

    const options = [];
    ['A', 'B', 'C', 'D', 'E'].forEach((key) => {
      const optionVal = row[`Option ${key}`] || row[`option_${key.toLowerCase()}`] || row[`Option_${key}`] || row[key];
      if (optionVal) {
        options.push({ key, text: String(optionVal).trim() });
      }
    });

    const rawAnswer = row['Correct Answer'] || row['correct_answer'] || row['Answer'] || row['answer'] || '';
    const correctAnswer = String(rawAnswer).split(',').map(ans => ans.trim()).filter(Boolean);

    const validationErrors = [];
    if (!body) validationErrors.push('Missing Question body text.');
    if (options.length === 0 && !['Integer', 'Numerical'].includes(type)) {
      validationErrors.push('No options found for this option-based question.');
    }
    if (correctAnswer.length === 0) validationErrors.push('Missing correct answer.');
    if (!subject) validationErrors.push('Missing subject tag.');
    if (!topic) validationErrors.push('Missing topic tag.');

    stagingRecords.push({
      body: body.trim(),
      options,
      correctAnswer,
      type: normalizeQuestionType(type),
      subject: subject.trim(),
      topic: topic.trim(),
      subtopic: subtopic.trim(),
      difficulty,
      language,
      explanation: explanation.trim(),
      marks,
      negativeMarks,
      source,
      year,
      validationErrors,
      importStatus: validationErrors.length > 0 ? 'Failed Validation' : 'Pending Review',
      uploadedBy: userId,
      fileSourceName: filename,
      mode: opts.mode || 'bank',
      examId: opts.examId || undefined,
      testSeriesId: opts.testSeriesId || undefined,
      sectionName: opts.sectionName || '',
      imageUrl: row['Image URL'] || row.imageUrl || row.image_url || '',
    });
  }

  return await QuestionStaging.insertMany(stagingRecords);
};

/**
 * Parses raw text extracted from DOCX/PDF/TXT via Regex patterns
 */
export const parseRawText = async (rawText, userId, filename, opts = {}) => {
  // Normalize line endings
  const text = rawText.replace(/\r\n/g, '\n');

  // Split into question blocks using regex lookahead for lines starting like "Q1." or "1." or "Question 1"
  // e.g. Q1. What is... or 12. Solve... or Question 5:
  const blockRegex = /(?=^\s*(?:Q\d+[:.]|\d+[\.)]|Question\s*\d+[:.]))/gm;
  const blocks = text.split(blockRegex).map(b => b.trim()).filter(Boolean);

  const stagingRecords = [];

  for (const block of blocks) {
    let body = '';
    const options = [];
    let correctAnswer = [];
    let explanation = '';
    let subject = 'General';
    let topic = 'General';

    // Parse options
    // Matches option indicators like A. text, B) text, (C) text
    const lines = block.split('\n');
    const bodyLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const optionMatch = line.match(/^\s*(?:([A-Ea-e])[\b\.)]|\(([A-Ea-e])\))\s*(.*)/i);
      const answerMatch = line.match(/^(?:Correct\s+)?Answer\s*:\s*([A-Ea-e\d,\s\-]+)/i);
      const explMatch = line.match(/^(?:Explanation|Exp)\s*:\s*([\s\S]+)/i);
      const subjectMatch = line.match(/^Subject\s*:\s*(.*)/i);
      const topicMatch = line.match(/^Topic\s*:\s*(.*)/i);

      if (optionMatch) {
        const key = (optionMatch[1] || optionMatch[2]).toUpperCase();
        const optionText = optionMatch[3].trim();
        options.push({ key, text: optionText });
      } else if (answerMatch) {
        correctAnswer = answerMatch[1].split(/[,&-]/).map(ans => ans.trim().toUpperCase()).filter(Boolean);
      } else if (explMatch) {
        // Grab remainder of block as explanation
        explanation = lines.slice(i).join('\n').replace(/^(?:Explanation|Exp)\s*:\s*/i, '').trim();
        break; // break outer lines loop as explanation is usually at the bottom
      } else if (subjectMatch) {
        subject = subjectMatch[1].trim();
      } else if (topicMatch) {
        topic = topicMatch[1].trim();
      } else {
        // Collect question body text (ignore question numbering prefix)
        if (i === 0) {
          const bodyClean = line.replace(/^\s*(?:Q\d+[:.]|\d+[\.)]|Question\s*\d+[:.])\s*/i, '');
          bodyLines.push(bodyClean);
        } else if (bodyLines.length > 0 && options.length === 0 && !answerMatch && !explMatch && !subjectMatch && !topicMatch) {
          bodyLines.push(line);
        }
      }
    }

    body = bodyLines.join('\n').trim();

    const validationErrors = [];
    if (!body) validationErrors.push('Missing Question body text.');
    if (options.length === 0) validationErrors.push('No options parsed.');
    if (correctAnswer.length === 0) validationErrors.push('No correct answer detected.');

    stagingRecords.push({
      body,
      options,
      correctAnswer,
      type: correctAnswer.length > 1 ? 'Multiple Correct' : 'Single Correct',
      subject,
      topic,
      validationErrors,
      importStatus: validationErrors.length > 0 ? 'Failed Validation' : 'Pending Review',
      uploadedBy: userId,
      fileSourceName: filename,
      mode: opts.mode || 'bank',
      examId: opts.examId || undefined,
      testSeriesId: opts.testSeriesId || undefined,
      sectionName: opts.sectionName || '',
    });
  }

  if (stagingRecords.length === 0) {
    throw new Error('Could not identify any questions. Make sure questions start with a number (e.g. "1." or "Q1.")');
  }

  return await QuestionStaging.insertMany(stagingRecords);
};

/**
 * Detects if text uses the structured tagged format with [Q], [SUB-Q], [O_a], [ANS] markers
 */
export const isStructuredFormat = (rawText) => {
  return /\[\s*Q\s*\]/i.test(rawText);
};

/**
 * Parses structured tagged format into question objects directly (not staging).
 *
 * Recognized markers:
 *   [Q]           – question body / introductory text
 *   [ST-START]    – beginning of statements block (optional)
 *   [ST-END]      – end of statements block
 *   [MATCH-START] – beginning of match-the-following pairs (optional)
 *   [MATCH-END]   – end of match pairs
 *   [SUB-Q]       – sub-question / actual ask (e.g. "How many are correct?")
 *   [O_a]         – option A text
 *   [O_b]         – option B text
 *   [O_c]         – option C text
 *   [O_d]         – option D text
 *   [ANS]         – correct answer letter(s) e.g. "B" or "A, C"
 *   [EXP]         – explanation text
 *   [SUBJ]        – subject (e.g. Polity, Economy, Geography …)
 *   [TOPIC]       – topic (optional, default "General")
 *   [TYPE]        – question type: Passage / Numerical / Conceptual / Reasoning (optional, inferred otherwise)
 *   [DIFFICULTY]  – difficulty level (optional, default "Medium")
 *   [SRC]         – source / year (optional)
 *   [NEXT]        – separator between questions
 */
export const parseStructuredText = (rawText, userId, filename = 'paste') => {
  const text = rawText.replace(/\r\n/g, '\n');

  // Split on [NEXT] markers
  const blockRegex = /\[NEXT\]/gi;
  const blocks = text.split(blockRegex).map(b => b.trim()).filter(Boolean);

  const questions = [];
  let lastContext = '';

  for (const block of blocks) {
    // Check if block is a standalone [CONTEXT] passage (no [Q] marker)
    const ctxMatch = block.match(/\[CONTEXT\]([\s\S]*)/i);
    if (ctxMatch && !/\[\s*Q\s*\]/i.test(block)) {
      lastContext = ctxMatch[1].trim();
      continue;
    }

    // Skip blocks that have no [Q] marker (e.g. trailing text after last [NEXT])
    if (!/\[\s*Q\s*\]/i.test(block)) continue;

    const extract = (marker) => {
      const regex = new RegExp(`\\[${marker}\\]([\\s\\S]*?)(?=\\[(?:CONTEXT|Q|SUB-Q|ST-START|MATCH-START|O_[a-d]|ANS|EXP|SUBJ|TOPIC|DIFFICULTY|TYPE|SRC|NEXT)\\]|$)`, 'i');
      const match = block.match(regex);
      return match ? match[1].trim() : '';
    };

    const qText = extract('Q');
    const subQ = extract('SUB-Q');
    const oa = extract('O_a');
    const ob = extract('O_b');
    const oc = extract('O_c');
    const od = extract('O_d');
    const ansRaw = extract('ANS');
    const expl = extract('EXP');
    const subj = extract('SUBJ');
    const topic = extract('TOPIC') || 'General';
    const difficulty = ['Easy', 'Medium', 'Hard'].includes(extract('DIFFICULTY')) ? extract('DIFFICULTY') : 'Medium';
    const typeOverride = extract('TYPE');
    const source = extract('SRC');

    // Extract statements block
    let statements = [];
    const stMatch = block.match(/\[ST-START\]([\s\S]*?)\[ST-END\]/i);
    if (stMatch) {
      statements = stMatch[1].split('\n').map(l => l.trim().replace(/^\d+[\.\)]\s*/, '')).filter(Boolean);
    }

    // Extract match pairs
    let matchPairs = [];
    const mtMatch = block.match(/\[MATCH-START\]([\s\S]*?)\[MATCH-END\]/i);
    if (mtMatch) {
      matchPairs = mtMatch[1].split('\n').map(l => l.trim()).filter(Boolean);
    }

    // Build the body — context, statements, matchPairs, and subQ saved separately for structured rendering, so omit from body to avoid duplication
    let body = qText;

    // Build options
    const options = [];
    const rawOpts = [['A', oa], ['B', ob], ['C', oc], ['D', od]];
    for (const [key, val] of rawOpts) {
      if (val) options.push({ key, text: val });
    }

    // Parse correct answer
    const correctAnswer = ansRaw.split(/[,&\s]+/).map(a => a.trim().toUpperCase()).filter(Boolean);

    // Use [TYPE] override if provided (accept any value from the external AI)
    let type;
    if (typeOverride) {
      type = typeOverride;
    } else {
      // Auto-infer
      if (matchPairs.length > 0) {
        type = 'Match the Following';
      } else if (statements.length > 0 && /assertion|reason/i.test(qText + subQ)) {
        type = 'Assertion Reason';
      } else if (correctAnswer.length > 1) {
        type = 'Multiple Correct';
      } else if (options.length === 2 && /true|false/i.test(options.map(o => o.text).join(' '))) {
        type = 'True False';
      } else {
        type = 'Single Correct';
      }
    }

    // Numerical/Data Sufficiency with A/B/C/D options → treat as Single Correct (CBT shows buttons)
    if (['Numerical', 'Data Sufficiency'].includes(type) && options.length >= 2) {
      const hasLetterKeys = options.every((o) => ['A', 'B', 'C', 'D'].includes(o.key));
      if (hasLetterKeys) type = 'Single Correct';
    }

    // Validation
    const validationErrors = [];
    if (!qText && !lastContext) validationErrors.push('Missing [Q] question body.');
    if (options.length === 0) validationErrors.push('No options found.');
    if (correctAnswer.length === 0) validationErrors.push('Missing [ANS] correct answer.');
    if (!subj) validationErrors.push('Missing [SUBJ] subject.');

    questions.push({
      body,
      context: lastContext || '',
      options,
      correctAnswer,
      type: normalizeQuestionType(type),
      subject: subj || 'General',
      topic,
      subtopic: '',
      difficulty,
      language: 'English',
      explanation: expl || 'No explanation provided.',
      source,
      year: source ? (source.match(/\d{4}/)?.[0] || new Date().getFullYear()) : new Date().getFullYear(),
      validationErrors,
      importStatus: validationErrors.length > 0 ? 'Failed Validation' : 'Pending Review',
      uploadedBy: userId,
      fileSourceName: filename,
      mode: 'bank',
      statements,
      matchPairs,
      subQ,
    });
  }

  return questions;
};

/**
 * Extracts text from DOCX and parses it
 */
export const parseDOCX = async (buffer, userId, filename, opts = {}) => {
  const result = await mammoth.extractRawText({ buffer });
  return await parseRawText(result.value, userId, filename, opts);
};

/**
 * Extracts text from PDF and parses it
 */
export const parsePDF = async (buffer, userId, filename, opts = {}) => {
  const data = await pdfParse(buffer);
  return await parseRawText(data.text, userId, filename, opts);
};
