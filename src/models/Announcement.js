import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true },
  audience: { type: String, enum: ['all', 'users', 'admin'], default: 'all' },
  type: { type: String, enum: ['info', 'success', 'warning', 'danger'], default: 'info' },
  accentColor: { type: String, default: '' },
  expiresAt: { type: Date, default: null },
  active: { type: Boolean, default: true },
  sendEmail: { type: Boolean, default: false },
  emailSentAt: Date,
}, {
  timestamps: true,
});

export default mongoose.model('Announcement', announcementSchema);
