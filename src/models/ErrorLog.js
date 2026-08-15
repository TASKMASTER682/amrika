import mongoose from 'mongoose';

const errorLogSchema = new mongoose.Schema({
  source: { type: String, enum: ['client', 'server'], default: 'client' },
  type: { type: String, default: 'Error', maxlength: 100 },
  message: { type: String, required: true, trim: true, maxlength: 2000 },
  stack: { type: String, default: '', maxlength: 20000 },
  url: { type: String, default: '', maxlength: 1000 },
  method: { type: String, default: '', maxlength: 20 },
  statusCode: { type: Number, default: null },
  route: { type: String, default: '', maxlength: 300 },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  userAgent: { type: String, default: '', maxlength: 500 },
  ip: { type: String, default: '' },
  status: { type: String, enum: ['Unresolved', 'Resolved', 'Ignored'], default: 'Unresolved' },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
});

errorLogSchema.index({ createdAt: -1 });
errorLogSchema.index({ status: 1, createdAt: -1 });
errorLogSchema.index({ source: 1, createdAt: -1 });
errorLogSchema.index({ message: 'text' });

export default mongoose.model('ErrorLog', errorLogSchema);