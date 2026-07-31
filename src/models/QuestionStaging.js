import mongoose from 'mongoose';

const questionStagingSchema = new mongoose.Schema({
  // Parsed content
  body: String,
  options: [{
    key: String,
    text: String,
  }],
  correctAnswer: [String],
  type: {
    type: String,
    default: 'Single Correct',
  },
  subject: String,
  topic: String,
  subtopic: String,
  difficulty: {
    type: String,
    default: 'Medium',
  },
  language: {
    type: String,
    default: 'English',
  },
  explanation: String,
  marks: { type: Number, default: 1 },
  negativeMarks: { type: Number, default: 0 },
  source: String,
  year: Number,
  
  // Status and highlighting fields
  importStatus: {
    type: String,
    enum: ['Pending Review', 'Validated', 'Failed Validation'],
    default: 'Pending Review',
  },
  validationErrors: [String], // Highlights what fields are unknown/missing (e.g. "Missing correct answer", "Missing topic")
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  fileSourceName: String, // Tracks original uploaded filename
  mode: { type: String, enum: ['bank', 'test-specific'], default: 'bank' },
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam' },
  testSeriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestSeries' },
  sectionName: String
}, {
  timestamps: true,
});

export default mongoose.model('QuestionStaging', questionStagingSchema);
