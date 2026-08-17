import mongoose from 'mongoose';

const blogSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  excerpt: { type: String, default: '' },
  content: { type: String, default: '' }, // admin-authored HTML, rendered as-is for readers
  coverImage: { type: String, default: '' },
  tags: [{ type: String, trim: true }],
  subject: { type: String, default: '' },
  seoSchema: {
    type: String,
    enum: ['BlogPosting', 'Article', 'FAQPage', 'HowTo', 'Course', 'Quiz'],
    default: 'BlogPosting',
  },
  seoConfig: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'draft',
  },
  materials: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudyMaterial',
  }],
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  viewCount: { type: Number, default: 0 },
  publishedAt: { type: Date, default: null },
}, {
  timestamps: true,
});

blogSchema.index({ title: 'text', excerpt: 'text', tags: 'text', subject: 'text' });

// Auto-generate a slug if not provided
blogSchema.pre('save', function (next) {
  if (!this.slug) {
    const base = this.title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
    this.slug = `${base || 'blog'}-${this._id ? this._id.toString().slice(-6) : Date.now().toString(36)}`;
  }
  if (this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  next();
});

export default mongoose.model('Blog', blogSchema);
