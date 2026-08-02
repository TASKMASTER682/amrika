import Bookmark from '../models/Bookmark.js';
import { awardBookmark } from '../services/GamificationService.js';

export const createBookmark = async (req, res, next) => {
  try {
    const { questionId, folderName, notes } = req.body;
    const studentId = req.user._id;

    if (!questionId) {
      return res.status(400).json({ success: false, message: 'Question ID is required.' });
    }

    const bookmark = await Bookmark.findOneAndUpdate(
      { studentId, questionId },
      { folderName: folderName || 'Starred Questions', notes },
      { upsert: true, new: true }
    );

    if (bookmark.createdAt && Date.now() - new Date(bookmark.createdAt).getTime() < 5000) {
      awardBookmark(studentId).catch(() => {});
    }

    res.status(201).json({
      success: true,
      message: 'Question bookmarked successfully.',
      data: bookmark,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteBookmark = async (req, res, next) => {
  try {
    const { questionId } = req.params;
    const studentId = req.user._id;

    const result = await Bookmark.findOneAndDelete({ studentId, questionId });
    if (!result) {
      return res.status(404).json({ success: false, message: 'Bookmark not found.' });
    }

    res.json({
      success: true,
      message: 'Bookmark removed successfully.',
    });
  } catch (error) {
    next(error);
  }
};

export const getBookmarks = async (req, res, next) => {
  try {
    const studentId = req.user._id;
    const { folderName } = req.query;

    const filter = { studentId };
    if (folderName) filter.folderName = folderName;

    const list = await Bookmark.find(filter)
      .populate('questionId')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: list,
    });
  } catch (error) {
    next(error);
  }
};

export const getFolders = async (req, res, next) => {
  try {
    const studentId = req.user._id;
    const folders = await Bookmark.find({ studentId }).distinct('folderName');
    res.json({
      success: true,
      data: folders.length > 0 ? folders : ['Starred Questions'],
    });
  } catch (error) {
    next(error);
  }
};
