import Blog from '../models/Blog.js';
import { logAudit } from '../services/AuditService.js';

const sanitizeTags = (tags) => {
  const clean = (t) => String(t).trim().replace(/^#/, '').replace(/\s+/g, ' ');
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(clean).filter(Boolean);
  return String(tags).split(',').map(clean).filter(Boolean);
};

const stripTags = (html = '') =>
  String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// The pasted HTML is the source of truth: the first <h1> becomes the SEO title.
const extractTitle = (html = '') => {
  const m = String(html).match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return m ? stripTags(m[1]) : '';
};

// Description for meta tags: a <meta name="description"> inside the HTML wins,
// otherwise the first real paragraph after the <h1> is used.
const extractExcerpt = (html = '') => {
  const s = String(html);
  const meta =
    s.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
    s.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  if (meta && meta[1] && meta[1].trim()) return meta[1].trim().slice(0, 300);

  const afterH1 = s.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, '');
  // Skip badge/pill text before the <h1> by narrowing to what follows it.
  const fromH1 = s.slice(s.toLowerCase().indexOf('</h1>') + 5);
  const paras = fromH1.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
  for (const p of paras) {
    const text = stripTags(p);
    if (text.length >= 40) return text.slice(0, 300);
  }
  return stripTags(fromH1 || afterH1).slice(0, 300);
};

// Tags from the HTML: "<meta name=keywords>" and every "#Tag" pill (e.g. inside
// the tags <span> section). Restricts to element text starting with '#' so hex
// colors inside style="" attributes are never picked up.
const extractTags = (html = '') => {
  const s = String(html);
  const tags = new Set();
  const meta =
    s.match(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']*)["']/i) ||
    s.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']keywords["']/i);
  if (meta && meta[1]) {
    meta[1]
      .split(',')
      .map((t) => t.trim().replace(/^#/, '').replace(/\s+/g, ' '))
      .filter(Boolean)
      .forEach((t) => tags.add(t));
  }
  const pill = /<[a-z][^>]*>\s*#([^<#\n]{1,60}?)<\/[a-z]+>/gi;
  let m;
  while ((m = pill.exec(s)) !== null) {
    const clean = m[1].trim().replace(/[#!.,]/g, '').replace(/\s+/g, ' ');
    if (clean) tags.add(clean);
  }
  return [...tags];
};

// Server-side scrub of admin-authored HTML: drops script/style/iframe/object/embed,
// inline event handlers, and javascript: URLs. Defense-in-depth before storage;
// existing records are also scrubbed on read.
const sanitizeHtml = (html = '') => {
  return String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object\s*>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '');
};

export const createBlog = async (req, res, next) => {
  try {
    const { title, slug, excerpt, content, coverImage, tags, subject, status, materials } = req.body;
    const contentHtml = sanitizeHtml(content);

    // Derive title + description from the pasted HTML for SEO meta tags.
    const derivedTitle = extractTitle(contentHtml);
    const finalTitle = (derivedTitle || String(title || '').trim());
    if (!finalTitle) {
      return res.status(400).json({ success: false, message: 'Blog title is required. Add an <h1> tag in the content or provide a title.' });
    }
    const finalExcerpt = extractExcerpt(contentHtml) || String(excerpt || '').trim();
    // Merge tags found in the HTML (#pills / keywords meta) with the field tags.
    const finalTags = [...new Set([...extractTags(contentHtml), ...sanitizeTags(tags)])].slice(0, 20);

    const blog = await Blog.create({
      title: finalTitle,
      slug: slug || undefined,
      excerpt: finalExcerpt,
      content: contentHtml,
      coverImage: coverImage || '',
      tags: finalTags,
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
    const isStaff = req.user?.role && ['Super Admin', 'Content Manager', 'Support'].includes(req.user.role);
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

    res.json({ success: true, data: { ...blog.toObject(), content: sanitizeHtml(blog.content) } });
  } catch (error) {
    next(error);
  }
};

export const getBlogBySlug = async (req, res, next) => {
  try {
    const isStaff = req.user?.role && ['Super Admin', 'Content Manager', 'Support'].includes(req.user.role);
    const blog = await Blog.findOne({ slug: req.params.slug, ...(isStaff ? {} : { status: 'published' }) })
      .populate('author', 'name')
      .populate('materials', 'title type externalUrl subject topic fileSize');

    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found.' });

    if (blog.status === 'published' && !isStaff) {
      blog.viewCount += 1;
      await blog.save().catch(() => {});
    }

    res.json({ success: true, data: { ...blog.toObject(), content: sanitizeHtml(blog.content) } });
  } catch (error) {
    next(error);
  }
};

export const updateBlog = async (req, res, next) => {
  try {
    const { tags, materials, content, ...rest } = req.body;
    if (tags !== undefined) rest.tags = sanitizeTags(tags);
    if (materials !== undefined) rest.materials = Array.isArray(materials) ? materials : [];
    if (content !== undefined) {
      const contentHtml = sanitizeHtml(content);
      rest.content = contentHtml;
      // Re-derive title/description from the edited HTML for meta tags.
      const derivedTitle = extractTitle(contentHtml);
      if (derivedTitle) rest.title = derivedTitle;
      const derivedExcerpt = extractExcerpt(contentHtml);
      if (derivedExcerpt) rest.excerpt = derivedExcerpt;
      // Keep tags in sync with the edited HTML (+ any explicitly sent tags).
      rest.tags = [...new Set([...extractTags(contentHtml), ...(tags !== undefined ? sanitizeTags(tags) : [])])].slice(0, 20);
    } else if (tags !== undefined) {
      rest.tags = sanitizeTags(tags);
    }
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