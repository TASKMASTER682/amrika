import mongoose from 'mongoose';

const bookmarkSchema = new mongoose.Schema({
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
  folderName: {
    type: String,
    default: 'Starred Questions',
    trim: true,
  },
  notes: String,
}, {
  timestamps: true,
});

bookmarkSchema.index({ studentId: 1, questionId: 1 }, { unique: true });

export default mongoose.model('Bookmark', bookmarkSchema);
