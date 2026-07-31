const mongoose = require('mongoose');

/**
 * A frozen snapshot of a Question document taken every time an approved
 * question is edited. Kept as a separate collection (not an array on
 * Question) so the hot path — reading questions for a test — never has
 * to load or skip over historical revisions.
 */
const questionVersionSchema = new mongoose.Schema(
  {
    question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true, index: true },
    version: { type: Number, required: true },
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true }, // full Question payload at this version
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    changeNote: { type: String },
  },
  { timestamps: true }
);

questionVersionSchema.index({ question: 1, version: 1 }, { unique: true });

module.exports = mongoose.model('QuestionVersion', questionVersionSchema);
