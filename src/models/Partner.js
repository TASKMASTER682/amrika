import mongoose from 'mongoose';

const partnerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    agencyName: {
      type: String,
      required: true,
      trim: true,
    },
    contactEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    contactPhone: {
      type: String,
      trim: true,
    },
    examName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    sampleQuestions: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'suspended'],
      default: 'pending',
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
    revenueShare: {
      type: Number,
      default: 40,
      min: 0,
      max: 100,
    },
    totalEarnings: {
      type: Number,
      default: 0,
    },
    totalSales: {
      type: Number,
      default: 0,
    },
    approvedAt: Date,
    rejectedAt: Date,
    suspendedAt: Date,
  },
  { timestamps: true }
);

partnerSchema.index({ status: 1 });
partnerSchema.index({ user: 1 });

export default mongoose.models.Partner || mongoose.model('Partner', partnerSchema);
