import RazorpayConfig from '../models/RazorpayConfig.js';
import { clearRazorpayCache } from './OrderController.js';

export const getRazorpayConfig = async (req, res, next) => {
  try {
    const config = await RazorpayConfig.findOne({});
    if (!config) {
      return res.json({
        success: true,
        data: {
          keyId: process.env.RAZORPAY_KEY_ID || null,
          keySecret: process.env.RAZORPAY_KEY_SECRET || null,
        },
      });
    }
    res.json({
      success: true,
      data: {
        keyId: config.keyId,
        keySecret: config.keySecret,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const saveRazorpayConfig = async (req, res, next) => {
  try {
    const { keyId, keySecret } = req.body;
    
    if (!keyId || !keySecret) {
      return res.status(400).json({ success: false, message: 'Both Key ID and Key Secret are required.' });
    }
    
    if (!keyId.startsWith('rzp_test_') && !keyId.startsWith('rzp_live_')) {
      return res.status(400).json({ success: false, message: 'Invalid Key ID format. Must start with rzp_test_ or rzp_live_.' });
    }

    await RazorpayConfig.findOneAndUpdate(
      {},
      { keyId, keySecret },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    clearRazorpayCache();

    res.json({ success: true, message: 'Razorpay configuration saved.' });
  } catch (error) {
    next(error);
  }
};