import mongoose from 'mongoose';

const partnerMessageSchema = new mongoose.Schema(
  {
    partner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Partner',
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    testSeriesRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PartnerTestSeries',
    },
    readByAdmin: {
      type: Boolean,
      default: false,
    },
    readAt: Date,
    adminReply: {
      type: String,
      trim: true,
    },
    repliedAt: Date,
    repliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

partnerMessageSchema.index({ partner: 1 });
partnerMessageSchema.index({ readByAdmin: 1 });

export default mongoose.models.PartnerMessage ||
  mongoose.model('PartnerMessage', partnerMessageSchema);
