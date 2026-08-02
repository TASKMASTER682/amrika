import mongoose from 'mongoose';

const razorpayConfigSchema = new mongoose.Schema({
  keyId: {
    type: String,
    required: true,
    trim: true,
  },
  keySecret: {
    type: String,
    required: true,
  },
}, {
  timestamps: true,
});

export default mongoose.model('RazorpayConfig', razorpayConfigSchema);