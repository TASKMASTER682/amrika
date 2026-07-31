import multer from 'multer';
import * as ParserService from '../services/ParserService.js';

// Set up Multer in-memory storage config
const storage = multer.memoryStorage();
export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    if (allowedTypes.includes(file.mimetype) || file.originalname.endsWith('.csv') || file.originalname.endsWith('.docx') || file.originalname.endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV, Excel, PDF, and DOCX are allowed.'));
    }
  }
});

export const parseFile = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const { originalname, buffer } = req.file;
    const userId = req.user._id;
    const mode = req.body.mode || 'bank';
    const examId = req.body.examId || null;
    const testSeriesId = req.body.testSeriesId || null;
    const sectionName = req.body.sectionName || '';
    let result;

    const parseOpts = { mode, examId, testSeriesId, sectionName };
    if (originalname.endsWith('.csv')) {
      result = await ParserService.parseCSV(buffer, userId, originalname, parseOpts);
    } else if (originalname.endsWith('.xlsx') || originalname.endsWith('.xls')) {
      result = await ParserService.parseXLSX(buffer, userId, originalname, parseOpts);
    } else if (originalname.endsWith('.docx')) {
      result = await ParserService.parseDOCX(buffer, userId, originalname, parseOpts);
    } else if (originalname.endsWith('.pdf')) {
      result = await ParserService.parsePDF(buffer, userId, originalname, parseOpts);
    } else {
      // Treat as plain text
      result = await ParserService.parseRawText(buffer.toString('utf8'), userId, originalname, parseOpts);
    }

    res.status(201).json({
      success: true,
      message: `File parsed successfully. Staged ${result.length} questions for review.`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
