const { Bookmark } = require('../models/Engagement');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

const create = asyncHandler(async (req, res) => {
  const { type, refId, folder, note } = req.body;
  const bookmark = await Bookmark.findOneAndUpdate(
    { student: req.user.id, type, refId },
    { folder: folder || 'Default', note },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  new ApiResponse(201, { bookmark }, 'Bookmarked').send(res);
});

const list = asyncHandler(async (req, res) => {
  const filter = { student: req.user.id };
  if (req.query.type) filter.type = req.query.type;
  if (req.query.folder) filter.folder = req.query.folder;

  const bookmarks = await Bookmark.find(filter).sort({ createdAt: -1 });
  new ApiResponse(200, { bookmarks }).send(res);
});

const remove = asyncHandler(async (req, res) => {
  const bookmark = await Bookmark.findOneAndDelete({ _id: req.params.id, student: req.user.id });
  if (!bookmark) throw ApiError.notFound('Bookmark not found');
  new ApiResponse(200, null, 'Bookmark removed').send(res);
});

module.exports = { create, list, remove };
