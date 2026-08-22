import TestSeries from '../models/TestSeries.js';
import StudyMaterial from '../models/StudyMaterial.js';
import Blog from '../models/Blog.js';
import Agency from '../models/Agency.js';
import Exam from '../models/Exam.js';

// ---------------------------------------------------------------------------
// Unified cross-entity search ("elastic-style").
//
// Structured as a registry: every searchable entity declares HOW it matches a
// term and which safe fields it returns. Adding courses / current-affairs /
// any future entity = append one entry here — the endpoint contract
//   GET /api/search?q=
//   -> { success, data: { query, groups: [{ type, label, count, items }] } }
// never changes, so the frontend needs zero backend knowledge per type and an
// Elasticsearch (or Atlas Search) implementation can replace the Mongo queries
// behind the same response shape.
// ---------------------------------------------------------------------------

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const termRegex = (term) => new RegExp(escapeRegex(term), 'i');

const PER_GROUP_LIMIT = 6;

const entities = [
  {
    type: 'test-series',
    label: 'Test Series',
    // Matches title/description/tags directly, plus anything filed under an
    // exam (or agency) whose name/code matches — typing "ssc" surfaces every
    // SSC exam series without needing "SSC" in the series title itself.
    search: async ({ re, matchedExamIds }) => {
      const filter = {
        active: true,
        $or: [
          { title: re },
          { description: re },
          { tags: re },
          ...(matchedExamIds.length ? [{ examId: { $in: matchedExamIds } }] : []),
        ],
      };
      const items = await TestSeries.find(filter)
        .select('title slug description banner price tags difficulty featured examId')
        .populate('examId', 'name code')
        .sort({ featured: -1, createdAt: -1 })
        .limit(PER_GROUP_LIMIT)
        .lean();
      return items.map((s) => ({
        _id: s._id,
        title: s.title,
        subtitle: s.description || '',
        href: `/explore/${s.slug || s._id}`,
        image: s.banner || '',
        price: s.price ?? 0,
        meta: [s.examId?.name, ...(s.tags || []).slice(0, 2)].filter(Boolean),
      }));
    },
  },
  {
    type: 'study-material',
    label: 'Study Material',
    search: async ({ re, agencyIds, examIds }) => {
      const filter = {
        active: true,
        $or: [
          { title: re },
          { subject: re },
          { topic: re },
          { tags: re },
          { description: re },
          ...(agencyIds.length ? [{ agencyId: { $in: agencyIds } }] : []),
          ...(examIds.length ? [{ examId: { $in: examIds } }] : []),
        ],
      };
      const items = await StudyMaterial.find(filter)
        .select('title description type subject topic tags accessTier')
        .limit(PER_GROUP_LIMIT)
        .lean();
      return items.map((m) => ({
        _id: m._id,
        title: m.title,
        subtitle: m.subject || m.topic || '',
        href: '/materials',
        meta: [m.type?.toUpperCase(), m.accessTier === 'member' ? 'MEMBERS' : 'FREE', ...(m.tags || []).slice(0, 2)].filter(Boolean),
      }));
    },
  },
  {
    type: 'current-affairs',
    label: 'Current Affairs & Articles',
    // Blogs are the current-affairs/articles content today; when a dedicated
    // course/current-affairs entity ships, register it as its own block here.
    search: async ({ re }) => {
      const filter = {
        status: 'published',
        $or: [
          { title: re },
          { excerpt: re },
          { subject: re },
          { tags: re },
        ],
      };
      const items = await Blog.find(filter)
        .select('title slug excerpt coverImage tags publishedAt')
        .sort({ publishedAt: -1 })
        .limit(PER_GROUP_LIMIT)
        .lean();
      return items.map((b) => ({
        _id: b._id,
        title: b.title,
        subtitle: b.excerpt || '',
        href: `/blogs/${b.slug || b._id}`,
        image: b.coverImage || '',
        meta: (b.tags || []).slice(0, 2),
      }));
    },
  },
];

export const globalSearch = async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) {
      return res.json({ success: true, data: { query, groups: [] } });
    }
    const re = termRegex(query);

    // Resolve agencies & exams matching the term so their child content is
    // included (typing an agency name finds everything under it).
    const [agencies, exams] = await Promise.all([
      Agency.find({ $or: [{ name: re }, { code: re }, { description: re }] }).select('_id').lean(),
      Exam.find({ $or: [{ name: re }, { code: re }, { description: re }] }).select('_id agencyId').lean(),
    ]);
    const agencyIds = agencies.map((a) => a._id);
    // Exams matching by name/code PLUS exams belonging to matching agencies.
    const matchedExamIds = [
      ...exams.map((e) => e._id),
      ...exams.filter((e) => e.agencyId && agencyIds.some((a) => String(a) === String(e.agencyId))).map((e) => e._id),
    ];

    const settled = await Promise.allSettled(
      entities.map((entity) => entity.search({ query, re, agencyIds, matchedExamIds }))
    );

    const groups = [];
    entities.forEach((entity, i) => {
      const result = settled[i];
      if (result.status !== 'fulfilled') {
        console.error(`[search] ${entity.type} failed:`, result.reason?.message);
        return; // one failing entity must not kill the whole search
      }
      if (result.value.length > 0) {
        groups.push({ type: entity.type, label: entity.label, count: result.value.length, items: result.value });
      }
    });

    res.json({ success: true, data: { query, groups } });
  } catch (error) {
    next(error);
  }
};
