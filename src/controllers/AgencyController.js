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
    const { name, code, contactEmail, contactPhone, address, description } = req.body;
    const agency = await Agency.create({
      name: name || '',
      code: code || '',
      contactEmail: contactEmail || '',
      contactPhone: contactPhone || '',
      address: address || '',
      description: description || '',
      author: req.user._id,
    });
    res.status(201).json({ success: true, data: agency });
  } catch (error) {
    next(error);
  }
};

export const updateAgency = async (req, res, next) => {
  try {
    const { name, code, contactEmail, contactPhone, address, description } = req.body;
    const agency = await Agency.findByIdAndUpdate(
      req.params.id,
      {
        name: name !== undefined ? name : undefined,
        code: code !== undefined ? code : undefined,
        contactEmail: contactEmail !== undefined ? contactEmail : undefined,
        contactPhone: contactPhone !== undefined ? contactPhone : undefined,
        address: address !== undefined ? address : undefined,
        description: description !== undefined ? description : undefined,
      },
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
