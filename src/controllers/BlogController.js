import Blog from '../models/Blog.js';
import { logAudit } from '../services/AuditService.js';

const sanitizeTags = (tags) => {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(t => String(t).trim()).filter(Boolean);
  return String(tags).split(',').map(t => t.trim()).filter(Boolean);
};

export const createBlog = async (req, res, next) => {
  try {
    const { title, slug, excerpt, content, coverImage, tags, subject, status, materials } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, message: 'Blog title is required.' });
    }

    const blog = await Blog.create({
      title,
      slug: slug || undefined,
      excerpt: excerpt || '',
      content: content || '',
      coverImage: coverImage || '',
      tags: sanitizeTags(tags),
      subject: subject || '',
      status: status === 'published' ? 'published' : 'draft',
      materials: Array.isArray(materials) ? materials : [],
      author: req.user._id,
    });

    await logAudit({
      userId: req.user._id,
      action: 'BLOG_CREATE',
      details: `Created blog "${blog.title}" (${blog.status})`,
      req,
    });

    res.status(201).json({ success: true, data: blog });
  } catch (error) {
    next(error);
  }
};

export const listBlogs = async (req, res, next) => {
  try {
    const { search, status, subject } = req.query;
    const filter = {};
    if (status && ['draft', 'published'].includes(status)) filter.status = status;
    if (subject) filter.subject = new RegExp(subject, 'i');

    // Elastic-ish search across title, excerpt, subject and tags
    if (search && String(search).trim()) {
      const q = String(search).trim();
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { title: regex },
        { excerpt: regex },
        { subject: regex },
        { tags: { $in: [regex] } },
      ];
    }

    const blogs = await Blog.find(filter)
      .populate('author', 'name')
      .populate('materials', 'title type externalUrl subject topic fileSize')
      .sort({ status: 1, updatedAt: -1 })
      .limit(parseInt(req.query.limit, 10) || 100);

    res.json({ success: true, data: blogs });
  } catch (error) {
    next(error);
  }
};

// Public listing — only published blogs, most recent first.
export const listPublished = async (req, res, next) => {
  try {
    const { search, subject } = req.query;
    const filter = { status: 'published' };
    if (subject) filter.subject = new RegExp(subject, 'i');

    if (search && String(search).trim()) {
      const q = String(search).trim();
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { title: regex },
        { excerpt: regex },
        { subject: regex },
        { tags: { $in: [regex] } },
      ];
    }

    const blogs = await Blog.find(filter)
      .populate('author', 'name')
      .populate('materials', 'title type externalUrl subject topic fileSize')
      .sort({ publishedAt: -1 })
      .limit(parseInt(req.query.limit, 10) || 100);

    res.json({ success: true, data: blogs });
  } catch (error) {
    next(error);
  }
};

export const getBlogById = async (req, res, next) => {
  try {
    const isStaff = ['Super Admin', 'Content Manager', 'Support'].includes(req.user.role);
    const blog = await Blog.findOne({
      _id: req.params.id,
      ...(isStaff ? {} : { status: 'published' }),
    })
      .populate('author', 'name')
      .populate('materials', 'title type externalUrl subject topic fileSize');

    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found.' });

    // Count a view only for published blogs read by non-staff.
    if (blog.status === 'published' && !isStaff) {
      blog.viewCount += 1;
      await blog.save().catch(() => {});
    }

    res.json({ success: true, data: blog });
  } catch (error) {
    next(error);
  }
};

export const getBlogBySlug = async (req, res, next) => {
  try {
    const blog = await Blog.findOne({ slug: req.params.slug, status: 'published' })
      .populate('author', 'name')
      .populate('materials', 'title type externalUrl subject topic fileSize');

    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found.' });

    blog.viewCount += 1;
    await blog.save().catch(() => {});

    res.json({ success: true, data: blog });
  } catch (error) {
    next(error);
  }
};

export const updateBlog = async (req, res, next) => {
  try {
    const { tags, materials, ...rest } = req.body;
    if (tags !== undefined) rest.tags = sanitizeTags(tags);
    if (materials !== undefined) rest.materials = Array.isArray(materials) ? materials : [];
    if (rest.status === 'published') {
      const current = await Blog.findById(req.params.id);
      rest.publishedAt = current?.publishedAt || new Date();
    }
    if (rest.status === 'draft') rest.publishedAt = null;

    const blog = await Blog.findByIdAndUpdate(req.params.id, rest, { new: true, runValidators: true });
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found.' });

    await logAudit({
      userId: req.user._id,
      action: 'BLOG_UPDATE',
      details: `Updated blog "${blog.title}" (${blog.status})`,
      req,
    });

    res.json({ success: true, data: blog });
  } catch (error) {
    next(error);
  }
};

export const deleteBlog = async (req, res, next) => {
  try {
    const blog = await Blog.findByIdAndDelete(req.params.id);
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found.' });

    await logAudit({
      userId: req.user._id,
      action: 'BLOG_DELETE',
      details: `Deleted blog "${blog.title}"`,
      req,
    });

    res.json({ success: true, message: 'Blog deleted.' });
  } catch (error) {
    next(error);
  }
};
