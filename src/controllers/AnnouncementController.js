import Announcement from '../models/Announcement.js';
import { logAudit } from '../services/AuditService.js';
import { sendAnnouncementBlast } from '../services/MailService.js';

export const listActiveAnnouncements = async (req, res, next) => {
  try {
    const isAdmin = req.user?.role === 'Super Admin' || req.user?.role === 'Content Manager' || req.user?.role === 'Support';
    const audience = isAdmin ? { $in: ['all', 'admin'] } : { $in: ['all', 'users'] };
    const list = await Announcement.find({ active: true, audience, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] })
      .sort({ createdAt: -1 })
      .limit(20);
    res.json({ success: true, data: list });
  } catch (error) {
    next(error);
  }
};

export const listAll = async (req, res, next) => {
  try {
    const list = await Announcement.find({}).sort({ createdAt: -1 });
    res.json({ success: true, data: list });
  } catch (error) {
    next(error);
  }
};

export const create = async (req, res, next) => {
  try {
    const { sendEmail, ...rest } = req.body;
    const announcement = await Announcement.create(rest);

    await logAudit({
      userId: req.user._id,
      action: 'ANNOUNCEMENT_CREATE',
      details: `Created announcement "${announcement.title}"`,
      req,
    });

    // Fire-and-forget email blast — never blocks the response
    if (sendEmail) {
      sendAnnouncementBlast({
        title: announcement.title,
        message: announcement.message,
        audience: announcement.audience,
      })
        .then(() => Announcement.findByIdAndUpdate(announcement._id, { emailSentAt: new Date() }))
        .catch((e) => console.warn('Announcement email blast failed:', e.message));
    }

    res.status(201).json({ success: true, data: announcement });
  } catch (error) {
    next(error);
  }
};

export const update = async (req, res, next) => {
  try {
    const { title, message, audience } = req.body;
    const announcement = await Announcement.findByIdAndUpdate(
      req.params.id,
      {
        title: title !== undefined ? title : undefined,
        message: message !== undefined ? message : undefined,
        audience: audience !== undefined ? audience : undefined,
      },
      { new: true, runValidators: true }
    );
    if (!announcement) return res.status(404).json({ success: false, message: 'Announcement not found.' });

    await logAudit({
      userId: req.user._id,
      action: 'ANNOUNCEMENT_UPDATE',
      details: `Updated announcement "${announcement.title}"`,
      req,
    });

    res.json({ success: true, data: announcement });
  } catch (error) {
    next(error);
  }
};

export const remove = async (req, res, next) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) return res.status(404).json({ success: false, message: 'Announcement not found.' });

    await Announcement.findByIdAndDelete(req.params.id);

    await logAudit({
      userId: req.user._id,
      action: 'ANNOUNCEMENT_DELETE',
      details: `Deleted announcement "${announcement.title}"`,
      req,
    });

    res.json({ success: true, message: 'Announcement deleted.' });
  } catch (error) {
    next(error);
  }
};
