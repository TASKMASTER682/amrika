import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  action: {
    type: String,
    required: true, // e.g. "CREATE_QUESTION", "APPROVE_QUESTION", "PUBLISH_TEST", "USER_ROLE_CHANGE"
  },
  details: {
    type: String,
    required: true,
  },
  ipAddress: String,
  userAgent: String,
}, {
  timestamps: { createdAt: true, updatedAt: false }, // Only log creation time
});

export default mongoose.model('AuditLog', auditLogSchema);
