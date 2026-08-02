import Doubt from '../models/Doubt.js';
import DoubtReply from '../models/DoubtReply.js';
import { generateAIDoubtAnswer } from '../services/AIService.js';
import { awardDoubt } from '../services/GamificationService.js';
import { logAudit } from '../services/AuditService.js';

export const createDoubt = async (req, res, next) => {
  try {
    const { questionId, title, body, subject, topic } = req.body;
    if (!title || !body) {
      return res.status(400).json({ success: false, message: 'Title and body are required.' });
    }

    const doubt = await Doubt.create({
      questionId: questionId || null,
      title,
      body,
      subject: subject || '',
      topic: topic || '',
      author: req.user._id,
    });
    console.log(`[DOUBT] Created doubt ${doubt._id} "${title}" by ${req.user._id}`);

    // Fire-and-forget AI auto-reply
    console.log(`[DOUBT] Kicking off AI reply for doubt ${doubt._id}...`);
    generateAIDoubtAnswer({ title, body, subject, topic })
      .then(async (aiBody) => {
        console.log(`[DOUBT] AI generated for ${doubt._id}:`, aiBody ? `${aiBody.length} chars` : 'NULL');
        if (!aiBody) return;
        await DoubtReply.create({
          doubtId: doubt._id,
          author: null,
          authorName: 'AI Tutor',
          body: aiBody,
          isAI: true,
          isAdmin: false,
        });
        await Doubt.findByIdAndUpdate(doubt._id, {
          aiAnswered: true,
          replyCount: 1,
          status: 'resolved',
        });
        console.log(`[DOUBT] Doubt ${doubt._id} marked resolved with AI reply.`);
      })
      .catch((e) => console.warn('[DOUBT] AI reply chain failed:', e?.message || e));

    awardDoubt(req.user._id).catch((e) => console.warn('[DOUBT] awardDoubt failed:', e?.message));

    res.status(201).json({ success: true, data: doubt });
  } catch (error) {
    next(error);
  }
};

export const listDoubts = async (req, res, next) => {
  try {
    const { status, search, mine } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (mine === 'true') filter.author = req.user._id;

    if (search && String(search).trim()) {
      const q = String(search).trim();
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ title: regex }, { body: regex }, { subject: regex }, { topic: regex }];
    }

    const doubts = await Doubt.find(filter)
      .populate('author', 'name')
      .populate('questionId', 'body topic subject')
      .sort({ createdAt: -1 })
      .limit(parseInt(req.query.limit, 10) || 100);

    res.json({ success: true, data: doubts });
  } catch (error) {
    next(error);
  }
};

export const getDoubtById = async (req, res, next) => {
  try {
    const doubt = await Doubt.findById(req.params.id)
      .populate('author', 'name')
      .populate('questionId', 'body topic subject');
    if (!doubt) return res.status(404).json({ success: false, message: 'Doubt not found.' });

    // AI reply is always pinned at the top; user replies below, latest 20 only.
    const [aiReplies, userReplies] = await Promise.all([
      DoubtReply.find({ doubtId: doubt._id, isAI: true })
        .populate('author', 'name')
        .sort({ createdAt: 1 }),
      DoubtReply.find({ doubtId: doubt._id, isAI: { $ne: true } })
        .populate('author', 'name')
        .sort({ createdAt: -1 })
        .limit(20),
    ]);
    const replies = [...aiReplies, ...userReplies.reverse()];

    res.json({ success: true, data: { doubt, replies } });
  } catch (error) {
    next(error);
  }
};

export const addReply = async (req, res, next) => {
  try {
    const { body } = req.body;
    if (!body || !String(body).trim()) {
      return res.status(400).json({ success: false, message: 'Reply body is required.' });
    }

    const doubt = await Doubt.findById(req.params.id);
    if (!doubt) return res.status(404).json({ success: false, message: 'Doubt not found.' });

    const isStaff = ['Super Admin', 'Content Manager', 'Support'].includes(req.user.role);

    const reply = await DoubtReply.create({
      doubtId: doubt._id,
      author: req.user._id,
      authorName: req.user.name,
      body: String(body).trim(),
      isAI: false,
      isAdmin: isStaff,
    });

    await Doubt.findByIdAndUpdate(doubt._id, {
      $inc: { replyCount: 1 },
      status: isStaff ? 'resolved' : doubt.status,
    });

    await logAudit({
      userId: req.user._id,
      action: 'DOUBT_REPLY',
      details: `Replied to doubt "${doubt.title}"`,
      req,
    });

    res.status(201).json({ success: true, data: reply });
  } catch (error) {
    next(error);
  }
};

export const resolveDoubt = async (req, res, next) => {
  try {
    const doubt = await Doubt.findById(req.params.id);
    if (!doubt) return res.status(404).json({ success: false, message: 'Doubt not found.' });
    if (doubt.author.toString() !== req.user._id.toString() && !['Super Admin', 'Content Manager', 'Support'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }
    doubt.status = 'resolved';
    await doubt.save();
    res.json({ success: true, data: doubt });
  } catch (error) {
    next(error);
  }
};

export const deleteDoubt = async (req, res, next) => {
  try {
    const staffRoles = ['Super Admin', 'Content Manager', 'Support'];
    const doubt = await Doubt.findById(req.params.id);
    if (!doubt) return res.status(404).json({ success: false, message: 'Doubt not found.' });
    if (doubt.author.toString() !== req.user._id.toString() && !staffRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }
    await DoubtReply.deleteMany({ doubtId: doubt._id });
    await Doubt.findByIdAndDelete(doubt._id);

    await logAudit({
      userId: req.user._id,
      action: 'DOUBT_DELETE',
      details: `Deleted doubt "${doubt.title}"`,
      req,
    });

    res.json({ success: true, message: 'Doubt deleted.' });
  } catch (error) {
    next(error);
  }
};
