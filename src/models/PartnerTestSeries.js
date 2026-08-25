import mongoose from 'mongoose';

const partnerQuestionSchema = new mongoose.Schema(
  {
    rawText: {
      type: String,
      required: true,
    },
    formattedBody: { type: String, default: '' },
    formattedOptions: { type: String, default: '' },
    formattedCorrectAnswer: { type: String, default: '' },
    formattedExplanation: { type: String, default: '' },
    status: {
      type: String,
      enum: ['raw', 'formatted', 'approved'],
      default: 'raw',
    },
  },
  { _id: true }
);

const partnerTestSeriesSchema = new mongoose.Schema(
  {
    partner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Partner',
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    agencyName: {
      type: String,
      required: true,
      trim: true,
    },
    examName: {
      type: String,
      required: true,
      trim: true,
    },
    testPlan: {
      type: String,
      required: true,
      trim: true,
    },
    subjects: [String],
    totalTests: {
      type: Number,
      default: 0,
    },
    questionsPerTest: {
      type: Number,
      default: 30,
    },
    price: {
      type: Number,
      default: 0,
    },
    suggestedPrice: {
      type: Number,
      default: 0,
    },
    questions: [partnerQuestionSchema],
    status: {
      type: String,
      enum: ['draft', 'pending_review', 'under_review', 'approved', 'published', 'rejected'],
      default: 'draft',
    },
    visibility: {
      type: String,
      enum: ['hidden', 'visible_to_admin'],
      default: 'hidden',
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
    adminNotes: {
      type: String,
      trim: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: Date,
    publishedAt: Date,
    publishedSeriesId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TestSeries',
    },
    totalEnrollments: {
      type: Number,
      default: 0,
    },
    totalRevenue: {
      type: Number,
      default: 0,
    },
    partnerEarnings: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

partnerTestSeriesSchema.index({ partner: 1 });
partnerTestSeriesSchema.index({ status: 1 });
partnerTestSeriesSchema.index({ visibility: 1 });

export default mongoose.models.PartnerTestSeries ||
  mongoose.model('PartnerTestSeries', partnerTestSeriesSchema);
