import StudyMaterial from '../models/StudyMaterial.js';
import { logAudit } from '../services/AuditService.js';

const sanitizeTags = (tags) => {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(t => String(t).trim()).filter(Boolean);
  return String(tags).split(',').map(t => t.trim()).filter(Boolean);
};

export const createMaterial = async (req, res, next) => {
  try {
    const { title, description, type, externalUrl, tags, subject, topic, examId, agencyId, fileSize, active } = req.body;
    if (!title || !type || !externalUrl) {
      return res.status(400).json({ success: false, message: 'Title, type and external URL are required.' });
    }
    const material = await StudyMaterial.create({
      title,
      description: description || '',
      type,
      externalUrl,
      tags: sanitizeTags(tags),
      subject: subject || '',
      topic: topic || '',
      examId: examId || null,
      agencyId: agencyId || null,
      fileSize: fileSize || '',
      active: active !== false,
      uploadedBy: req.user._id,
    });

    await logAudit({
      userId: req.user._id,
      action: 'MATERIAL_CREATE',
      details: `Created study material "${material.title}"`,
      req,
    });

    res.status(201).json({ success: true, data: material });
  } catch (error) {
    next(error);
  }
};

export const listMaterials = async (req, res, next) => {
  try {
    const { search, type, subject, examId, active } = req.query;
    const filter = {};
    if (active !== undefined && active !== '') filter.active = active === 'true';
    if (type) filter.type = type;
    if (subject) filter.subject = new RegExp(subject, 'i');
    if (examId) filter.examId = examId;

    // Elastic-ish search across title, subject, topic and tags
    if (search && String(search).trim()) {
      const q = String(search).trim();
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { title: regex },
        { subject: regex },
        { topic: regex },
        { tags: { $in: [regex] } },
        { description: regex },
      ];
    }

    const materials = await StudyMaterial.find(filter)
      .populate('examId', 'name')
      .populate('agencyId', 'name')
      .sort({ createdAt: -1 })
      .limit(parseInt(req.query.limit, 10) || 100);

    res.json({ success: true, data: materials });
  } catch (error) {
    next(error);
  }
};

export const getMaterialById = async (req, res, next) => {
  try {
    const material = await StudyMaterial.findById(req.params.id)
      .populate('examId', 'name')
      .populate('agencyId', 'name');
    if (!material) return res.status(404).json({ success: false, message: 'Study material not found.' });
    res.json({ success: true, data: material });
  } catch (error) {
    next(error);
  }
};

export const updateMaterial = async (req, res, next) => {
  try {
    const { tags, ...rest } = req.body;
    if (tags !== undefined) rest.tags = sanitizeTags(tags);
    const material = await StudyMaterial.findByIdAndUpdate(req.params.id, rest, { new: true, runValidators: true });
    if (!material) return res.status(404).json({ success: false, message: 'Study material not found.' });

    await logAudit({
      userId: req.user._id,
      action: 'MATERIAL_UPDATE',
      details: `Updated study material "${material.title}"`,
      req,
    });

    res.json({ success: true, data: material });
  } catch (error) {
    next(error);
  }
};

export const deleteMaterial = async (req, res, next) => {
  try {
    const material = await StudyMaterial.findByIdAndDelete(req.params.id);
    if (!material) return res.status(404).json({ success: false, message: 'Study material not found.' });

    await logAudit({
      userId: req.user._id,
      action: 'MATERIAL_DELETE',
      details: `Deleted study material "${material.title}"`,
      req,
    });

    res.json({ success: true, message: 'Study material deleted.' });
  } catch (error) {
    next(error);
  }
};

// Proxy download: streams the external file as an attachment so the user never
// leaves our site — the browser downloads the file directly from the source.
export const downloadMaterial = async (req, res, next) => {
  let material;
  try {
    material = await StudyMaterial.findById(req.params.id);
  } catch (error) {
    return next(error);
  }
  if (!material) return res.status(404).json({ success: false, message: 'Study material not found.' });
  if (!material.active) return res.status(403).json({ success: false, message: 'This material is unavailable.' });

  material.downloadCount += 1;
  await material.save().catch(() => {});

  const sourceUrl = material.externalUrl;
  const filename = (material.title || 'download')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_') + (material.type === 'pdf' ? '.pdf' : '');

  const isVideo = material.type === 'video';

  try {
    const upstream = await fetch(sourceUrl);
    if (!upstream.ok) {
      return res.status(502).json({ success: false, message: 'Unable to fetch the file from its source.' });
    }
    const disposition = isVideo ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    const buf = await upstream.arrayBuffer();
    res.send(Buffer.from(buf));
  } catch (error) {
    next(error);
  }
};
