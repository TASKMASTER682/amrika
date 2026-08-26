import Event from '../models/Event.js';

// List upcoming events for the logged-in user
export const listEvents = async (req, res, next) => {
  try {
    const events = await Event.find({
      userId: req.user._id,
      date: { $gte: new Date() },
    })
      .sort({ date: 1 })
      .lean();
    res.json({ success: true, data: events });
  } catch (error) {
    next(error);
  }
};

// Create a new event
export const createEvent = async (req, res, next) => {
  try {
    const { title, description, date, color } = req.body;
    if (!title || !date) {
      return res.status(400).json({ success: false, message: 'title and date are required.' });
    }
    const event = await Event.create({
      userId: req.user._id,
      title,
      description: description || '',
      date: new Date(date),
      color: color || 'lime',
    });
    res.status(201).json({ success: true, data: event });
  } catch (error) {
    next(error);
  }
};

// Update an event
export const updateEvent = async (req, res, next) => {
  try {
    const event = await Event.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }
    res.json({ success: true, data: event });
  } catch (error) {
    next(error);
  }
};

// Delete an event
export const deleteEvent = async (req, res, next) => {
  try {
    const event = await Event.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }
    res.json({ success: true, message: 'Event deleted.' });
  } catch (error) {
    next(error);
  }
};
