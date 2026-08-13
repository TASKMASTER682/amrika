import mongoose from 'mongoose';

const planSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: String,
  price: { type: Number, required: true, default: 0 },
  billingCycle: { type: String, enum: ['monthly', 'quarterly', 'yearly', 'lifetime'], default: 'monthly' },
  durationDays: { type: Number, default: 30 }, // 0 = lifetime (legacy storage)
  durationMonths: { type: Number, default: 0 }, // 0 = lifetime; primary input, wins over durationDays when set
  // Targeting: which agencies/exams a pack is offered to.
  // Empty agencyIds + empty examIds = general plan shown to every user.
  agencyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Agency' }],
  examIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Exam' }],
  // Live-follow test coverage — which exam test-series the plan unlocks:
  //   'all'      -> every active series under the plan's exams (live)
  //   'fraction' -> a deterministic ~fraction of the exam's series (live)
  //   'random'   -> same as fraction but marked random on the UI
  //   'manual'   -> exactly the seriesIds the admin hand-picked (static)
  coverage: {
    type: { type: String, enum: ['all', 'fraction', 'random', 'manual'], default: 'all' },
    fraction: { type: Number, default: 1, min: 0, max: 1 }, // 0.25 / 0.5 / 1
    seriesIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TestSeries' }],
  },
  features: [String],
  active: { type: Boolean, default: true },
  popular: { type: Boolean, default: false },
}, {
  timestamps: true,
});

export default mongoose.model('Plan', planSchema);
