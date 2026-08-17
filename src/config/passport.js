import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { googleClientId, googleClientSecret, googleCallbackUrl } from '../config/env.js';
import { googleCallback as handleGoogleCallback } from '../services/AuthService.js';

const hasGoogleCreds = googleClientId && googleClientSecret;

if (hasGoogleCreds) {
  GoogleStrategy.prototype.name = 'google';

  const callbackUrl = googleCallbackUrl || `/api/auth/google/callback`;

  passport.use(new GoogleStrategy({
    clientID: googleClientId,
    clientSecret: googleClientSecret,
    callbackURL: callbackUrl,
  }, (accessToken, refreshToken, profile, done) => {
    return handleGoogleCallback(profile, done);
  }));

  console.log('[Passport] Google OAuth strategy configured.');
} else {
  console.warn('[Passport] Google OAuth credentials not set — Google login disabled. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env');
}

export default passport;
