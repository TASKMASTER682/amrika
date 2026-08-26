import mongoose from 'mongoose';

const questionReportSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true,
    },
    reason: {
      type: String,
      enum: [
        'Wrong Answer',
        'Missing Option',
        'Wrong Question',
        'Duplicate Question',
        'Incomplete Question',
        'Spelling Error',
        'Image Issue',
        'Other',
      ],
      required: true,
    },
    description: {
      type: String,
      maxlength: 500,
      default: '',
    },
    status: {
      type: String,
      enum: ['Pending', 'Reviewed', 'Resolved', 'Dismissed'],
      default: 'Pending',
    },
    adminNote: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

questionReportSchema.index({ studentId: 1, questionId: 1 }, { unique: true });
questionReportSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('QuestionReport', questionReportSchema);
