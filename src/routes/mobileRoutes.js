import express from 'express';
import QRCode from 'qrcode';
import crypto from 'crypto';
import os from 'os';

const router = express.Router();

// Store active connection tokens (in production, use Redis)
const connectionTokens = new Map();

/**
 * Get local network IP address (192.168.x.x)
 */
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  // Fallback
  return process.env.LOCAL_IP || 'localhost';
}

/**
 * Generate QR code for mobile app connection
 * GET /api/mobile/qr-connect
 *
 * Returns a QR code that mobile can scan to get:
 * - Server IP address
 * - Port
 * - Temporary connection token (for initial setup)
 */
router.get('/qr-connect', async (req, res, next) => {
  try {
    const localIP = getLocalIP();
    const port = process.env.PORT || 5000;
    const baseUrl = `http://${localIP}:${port}/api`;

    // Generate temporary connection token (expires in 5 minutes)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 5 * 60 * 1000;

    connectionTokens.set(token, { expiresAt, used: false });

    // Clean up expired tokens
    for (const [key, value] of connectionTokens.entries()) {
      if (value.expiresAt < Date.now()) {
        connectionTokens.delete(key);
      }
    }

    const connectionData = {
      apiUrl: baseUrl,
      ip: localIP,
      port,
      token,
      expiresAt,
      timestamp: Date.now(),
    };

    // Generate QR code as data URL
    const qrDataUrl = await QRCode.toDataURL(JSON.stringify(connectionData), {
      errorCorrectionLevel: 'M',
      width: 400,
      margin: 2,
    });

    res.json({
      success: true,
      data: {
        qrCode: qrDataUrl,
        apiUrl: baseUrl,
        ip: localIP,
        port,
        expiresIn: 300, // 5 minutes in seconds
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Verify connection token
 * POST /api/mobile/verify-token
 * Body: { token }
 *
 * Mobile app calls this after scanning QR to verify the token
 */
router.post('/verify-token', async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required',
      });
    }

    const tokenData = connectionTokens.get(token);

    if (!tokenData) {
      return res.status(404).json({
        success: false,
        message: 'Invalid token',
      });
    }

    if (tokenData.expiresAt < Date.now()) {
      connectionTokens.delete(token);
      return res.status(400).json({
        success: false,
        message: 'Token expired',
      });
    }

    if (tokenData.used) {
      return res.status(400).json({
        success: false,
        message: 'Token already used',
      });
    }

    // Mark token as used
    tokenData.used = true;

    res.json({
      success: true,
      data: {
        verified: true,
        message: 'Connection successful',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get server info for mobile app
 * GET /api/mobile/info
 *
 * Returns basic server information for mobile app
 */
router.get('/info', (req, res) => {
  const localIP = getLocalIP();
  const port = process.env.PORT || 5000;

  res.json({
    success: true,
    data: {
      serverName: 'ExamOS Backend',
      version: '1.0.0',
      apiUrl: `http://${localIP}:${port}/api`,
      ip: localIP,
      port,
      timestamp: Date.now(),
      env: process.env.NODE_ENV || 'development',
    },
  });
});

export default router;
