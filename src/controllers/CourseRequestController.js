import CourseRequest from '../models/CourseRequest.js';
import { sendTelegramMessage } from '../services/telegramService.js';

export const createCourseRequest = async (req, res, next) => {
  try {
    const { message, telegramLink, telegramId } = req.body;

    const normalizedTelegram = String(telegramLink || telegramId || '').trim();

    if (!message || !String(message).trim()) {
      return res.status(400).json({ success: false, message: 'Message is required.' });
    }

    if (!normalizedTelegram) {
      return res.status(400).json({ success: false, message: 'Telegram link or ID is required.' });
    }

    const request = await CourseRequest.create({
      user: req.user._id,
      message: String(message).trim(),
      telegramLink: normalizedTelegram,
      telegramId: normalizedTelegram,
      status: 'new',
    });

    res.status(201).json({
      success: true,
      message: 'Course request sent to admin.',
      data: request,
    });
  } catch (error) {
    next(error);
  }
};

export const listCourseRequests = async (req, res, next) => {
  try {
    const requests = await CourseRequest.find({})
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 });

    console.log('[CourseRequest] Admin list called. Requests found:', requests.length);
    if (requests.length > 0) {
      console.log('[CourseRequest] First request:', { id: requests[0]._id, user: requests[0].user, message: requests[0].message, status: requests[0].status });
    }

    res.json({ success: true, data: requests });
  } catch (error) {
    next(error);
  }
};

export const getMyCourseRequests = async (req, res, next) => {
  try {
    const requests = await CourseRequest.find({ user: req.user._id })
      .sort({ createdAt: -1 });

    res.json({ success: true, data: requests });
  } catch (error) {
    next(error);
  }
};

export const updateCourseRequestStatus = async (req, res, next) => {
  try {
    const { status, adminNotes } = req.body;
    const request = await CourseRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found.' });
    }

    if (status) request.status = status;
    if (adminNotes !== undefined) request.adminNotes = String(adminNotes || '');

    await request.save();

    res.json({ success: true, data: request });
  } catch (error) {
    next(error);
  }
};

export const bulkSendTelegram = async (req, res, next) => {
  try {
    const { requestIds, message, imageBase64 } = req.body;

    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      return res.status(400).json({ success: false, message: 'requestIds array is required' });
    }

    if (!message && !imageBase64) {
      return res.status(400).json({ success: false, message: 'Either message or imageBase64 is required' });
    }

    const requests = await CourseRequest.find({ _id: { $in: requestIds } })
      .populate('user', 'name email');

    if (requests.length === 0) {
      return res.status(404).json({ success: false, message: 'No valid requests found' });
    }

    const imageBuffer = imageBase64 ? Buffer.from(imageBase64, 'base64') : null;

    const results = [];
    for (const request of requests) {
      const telegramLink = request.telegramLink || request.telegramId || '';
      if (!telegramLink) {
        results.push({ requestId: request._id, success: false, error: 'No telegram link' });
        continue;
      }

      try {
        await sendTelegramMessage(telegramLink, message || '', imageBuffer);
        results.push({ requestId: request._id, success: true });
      } catch (err) {
        results.push({ requestId: request._id, success: false, error: err.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;

    res.json({
      success: true,
      message: `Sent to ${successCount} user(s), failed ${failCount}`,
      results,
    });
  } catch (error) {
    next(error);
  }
};
