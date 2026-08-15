import mongoose from 'mongoose';

const analyticsEventSchema = new mongoose.Schema({
  type: { type: String, enum: ['pageview', 'event'], default: 'pageview' },
  name: { type: String, default: '', maxlength: 100 }, // future custom events (signup, test_started, ...)
  path: { type: String, default: '', maxlength: 300 },
  page: { type: String, default: '', maxlength: 200 },
  referrer: { type: String, default: '', maxlength: 500 },
  sessionId: { type: String, default: '', maxlength: 100 },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  browser: { type: String, default: '', maxlength: 30 },
  device: { type: String, default: '', maxlength: 20 },
  userAgent: { type: String, default: '', maxlength: 300 },
  ip: { type: String, default: '' },
}, {
  timestamps: true,
});

analyticsEventSchema.index({ createdAt: -1 });
analyticsEventSchema.index({ type: 1, createdAt: -1 });
analyticsEventSchema.index({ path: 1, createdAt: -1 });
analyticsEventSchema.index({ sessionId: 1, createdAt: -1 });

export default mongoose.model('AnalyticsEvent', analyticsEventSchema);