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
  scheduled: { type: Boolean, default: false }, // fixed-slot scheduled/live test
  startTime: Date, // scheduled start (window open)
  endTime: Date, // scheduled end (window close)
  attemptLimit: { type: Number, default: 1 }, // 0 or 1 etc.
  calculatorAllowed: { type: Boolean, default: false },
  fullscreenRequired: { type: Boolean, default: true },
  shuffleQuestions: { type: Boolean, default: true },
  shuffleOptions: { type: Boolean, default: true },
  sections: [testSectionSchema],
  active: { type: Boolean, default: true },
  // Monetization flags
  includedInSubscription: { type: Boolean, default: false }, // unlocked by an active paid plan
  freeWindow: { // public free-access window (e.g. Sunday free mock, trial promos)
    from: { type: Date, default: null },
    to: { type: Date, default: null },
  },
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'draft',
    set: (v) => String(v).toLowerCase(), // accept legacy 'Draft'/'Published' input
  },
}, {
  timestamps: true,
});

const Test = mongoose.model('Test', testSchema);

// One-time migration: normalize any legacy 'Draft'/'Published' values to lowercase.
export const normalizeTestStatus = async () => {
  const conn = mongoose.connection;
  if (conn.readyState !== 1) return;
  const res = await Test.updateMany(
    { status: { $in: ['Draft', 'Published'] } },
    [{ $set: { status: { $toLower: '$status' } } }],
  );
  if (res.modifiedCount) {
    console.log(`[migration] Normalized ${res.modifiedCount} test status values to lowercase.`);
  }
};

export default Test;
