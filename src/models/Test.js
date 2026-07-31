import mongoose from 'mongoose';

const testSectionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  duration: { type: Number, default: 0 }, // in minutes, 0 means no section locking
  questions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
  }],
  negativeMarking: { type: Boolean, default: true },
  marksPerQuestion: { type: Number, default: 2 },
  negativeMarksPerQuestion: { type: Number, default: 0.5 },
});

const testSchema = new mongoose.Schema({
  testSeriesId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestSeries',
    required: true,
  },
  examId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: String,
  duration: { type: Number, required: true }, // total duration in minutes
  passingMarks: { type: Number, default: 0 },
  publishDate: { type: Date, default: Date.now },
  expiryDate: Date,
  attemptLimit: { type: Number, default: 1 }, // 0 or 1 etc.
  calculatorAllowed: { type: Boolean, default: false },
  fullscreenRequired: { type: Boolean, default: true },
  shuffleQuestions: { type: Boolean, default: true },
  shuffleOptions: { type: Boolean, default: true },
  sections: [testSectionSchema],
  active: { type: Boolean, default: true },
  status: {
    type: String,
    enum: ['Draft', 'Published'],
    default: 'Draft',
  },
}, {
  timestamps: true,
});

export default mongoose.model('Test', testSchema);
