/**
 * The exam hierarchy (Agency -> Exam -> Subject -> Topic -> Subtopic) is
 * kept as small, independent collections rather than nested subdocuments.
 * Nesting would force every question edit to rewrite a large parent
 * document; independent collections let the Question Bank reference
 * a topic by ObjectId and scale each collection separately.
 */
const mongoose = require('mongoose');

const agencySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "SSC", "JKSSB"
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String },
    logoUrl: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const examSchema = new mongoose.Schema(
  {
    agency: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    name: { type: String, required: true, trim: true }, // e.g. "SSC CGL", "FAA"
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const subjectSchema = new mongoose.Schema(
  {
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    name: { type: String, required: true, trim: true }, // e.g. "Quantitative Aptitude"
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const topicSchema = new mongoose.Schema(
  {
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    name: { type: String, required: true, trim: true }, // e.g. "Time, Speed & Distance"
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const subtopicSchema = new mongoose.Schema(
  {
    topic: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true, index: true },
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

examSchema.index({ agency: 1, name: 1 }, { unique: true });
subjectSchema.index({ exam: 1, name: 1 }, { unique: true });
topicSchema.index({ subject: 1, name: 1 }, { unique: true });
subtopicSchema.index({ topic: 1, name: 1 }, { unique: true });

module.exports = {
  Agency: mongoose.model('Agency', agencySchema),
  Exam: mongoose.model('Exam', examSchema),
  Subject: mongoose.model('Subject', subjectSchema),
  Topic: mongoose.model('Topic', topicSchema),
  Subtopic: mongoose.model('Subtopic', subtopicSchema),
};
