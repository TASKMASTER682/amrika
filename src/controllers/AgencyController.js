import Agency from '../models/Agency.js';

export const listAgencies = async (req, res, next) => {
  try {
    const agencies = await Agency.find().sort({ name: 1 });
    res.json({ success: true, data: agencies });
  } catch (error) {
    next(error);
  }
};

export const getAgencyById = async (req, res, next) => {
  try {
    const agency = await Agency.findById(req.params.id);
    if (!agency) {
      return res.status(404).json({ success: false, message: 'Agency not found.' });
    }
    res.json({ success: true, data: agency });
  } catch (error) {
    next(error);
  }
};

export const createAgency = async (req, res, next) => {
  try {
    // Schema contract: { name, code, description?, logoUrl?, active? }
    const { name, code, description, logoUrl, active } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'Agency name is required.' });
    }
    if (!code || !String(code).trim()) {
      return res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'Agency code is required.' });
    }

    const agency = await Agency.create({
      name: String(name).trim(),
      code: String(code).trim(),
      ...(description !== undefined ? { description } : {}),
      ...(logoUrl !== undefined ? { logoUrl } : {}),
      ...(active !== undefined ? { active } : {}),
    });
    res.status(201).json({ success: true, data: agency });
  } catch (error) {
    next(error);
  }
};

export const updateAgency = async (req, res, next) => {
  try {
    // Only apply the fields the client actually sent — never unset the rest.
    const allowed = ['name', 'code', 'description', 'logoUrl', 'active'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const agency = await Agency.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!agency) {
      return res.status(404).json({ success: false, message: 'Agency not found.' });
    }
    res.json({ success: true, data: agency });
  } catch (error) {
    next(error);
  }
};

export const deleteAgency = async (req, res, next) => {
  try {
    await Agency.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Agency deleted.' });
  } catch (error) {
    next(error);
  }
};
