import mongoose from 'mongoose';

const studyMaterialSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  type: {
    type: String,
    enum: ['note', 'pdf', 'video'],
    required: true,
  },
  externalUrl: { type: String, required: true, trim: true }, // hosted elsewhere; served via download proxy
  tags: [{ type: String, trim: true }], // comma-separated on input, stored as array
  subject: { type: String, default: '' },
  topic: { type: String, default: '' },
  examId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    default: null,
  },
  agencyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agency',
    default: null,
  },
  active: { type: Boolean, default: true },
  accessTier: { type: String, enum: ['free', 'member'], default: 'free' }, // 'member' = paid plan only
  downloadCount: { type: Number, default: 0 },
  fileSize: { type: String, default: '' },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
}, {
  timestamps: true,
});

studyMaterialSchema.index({ title: 'text', subject: 'text', topic: 'text', tags: 'text' });

export default mongoose.model('StudyMaterial', studyMaterialSchema);
