import { z } from 'zod';

export const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

// Accepts a 24-hex ObjectId or empty/null/undefined (treated as "not provided").
const optionalObjectId = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : v),
  objectId.optional()
);

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.string().optional(),
  agencyId: optionalObjectId.optional(),
  examId: optionalObjectId.optional(),
  referralCode: z.string().trim().optional().nullable(),
  signupSource: z.string().trim().max(50).optional(),
  agencies: z.array(objectId).max(20).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const blogTags = z.array(z.string().trim().min(1).max(40)).or(z.string()).optional();

export const createBlogSchema = z.object({
  // Optional — the controller derives the title from the first <h1> in the HTML.
  title: z.string().trim().min(1).max(200).optional().nullable(),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/i, 'Slug may only contain letters, numbers and hyphens').optional().nullable(),
  excerpt: z.string().max(500).optional().nullable(),
  content: z.string().optional().nullable(),
  coverImage: z.string().optional().nullable(),
  tags: blogTags,
  subject: z.string().trim().max(100).optional().nullable(),
  status: z.enum(['draft', 'published']).optional(),
  materials: z.array(objectId).max(50).optional(),
});

export const updateBlogSchema = createBlogSchema.partial();

export const createTestSeriesSchema = z.object({
  examId: objectId,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  price: z.number().min(0).max(1000000).optional(),
  banner: z.string().optional().nullable(),
  featured: z.boolean().optional(),
  publishAt: z.coerce.date().optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  active: z.boolean().optional(),
});

export const updateTestSeriesSchema = z.object({
  examId: objectId.optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  price: z.number().min(0).max(1000000).optional(),
  banner: z.string().optional().nullable(),
  featured: z.boolean().optional(),
  publishAt: z.coerce.date().optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  active: z.boolean().optional(),
});

/**
 * Wraps a Zod schema into Express middleware. The parsed (and coerced/defaulted)
 * result replaces req[source] so controllers always work with clean data.
 */
export const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    return res.status(400).json({
      success: false,
      code: 'VALIDATION_FAILED',
      message: 'Validation failed',
      details,
    });
  }
  req[source] = result.data;
  next();
};