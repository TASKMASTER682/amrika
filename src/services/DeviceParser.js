// Lightweight user-agent parsing — no dependency. Good enough for trend stats.
export const parseBrowser = (ua = '') => {
  const lower = ua.toLowerCase();
  if (lower.includes('edg/') || lower.includes('edge/')) return 'Edge';
  if (lower.includes('opr/') || lower.includes('opera')) return 'Opera';
  if (lower.includes('chrome') && !lower.includes('edg')) return 'Chrome';
  if (lower.includes('safari') && !lower.includes('chrome')) return 'Safari';
  if (lower.includes('firefox')) return 'Firefox';
  if (lower.includes('msie') || lower.includes('trident')) return 'IE';
  if (lower.includes('instagram')) return 'Instagram';
  if (lower.includes('whatsapp')) return 'WhatsApp';
  return 'Other';
};

export const parseDevice = (ua = '') => {
  const lower = ua.toLowerCase();
  if (/(ipad|tablet|playbook|silk|kindle)/.test(lower)) return 'Tablet';
  if (/(mobi|iphone|android|phone|blackberry|opera mini)/.test(lower)) return 'Mobile';
  return 'Desktop';
};