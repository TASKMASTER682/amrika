import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import passport from './config/passport.js';
import { connectDB } from './config/db.js';
import { applySecurity } from './middleware/security.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { CLIENT_URLS, env, port } from './config/env.js';

// Load routes
import authRoutes from './routes/authRoutes.js';
import questionRoutes from './routes/questionRoutes.js';
import testRoutes from './routes/testRoutes.js';
import attemptRoutes from './routes/attemptRoutes.js';
import bookmarkRoutes from './routes/bookmarkRoutes.js';
import practiceRoutes from './routes/practiceRoutes.js';
import agencyRoutes from './routes/agencyRoutes.js';
import examRoutes from './routes/examRoutes.js';
import testSeriesRoutes from './routes/testSeriesRoutes.js';
import enrollmentRoutes from './routes/enrollmentRoutes.js';
import userRoutes from './routes/userRoutes.js';
import planRoutes from './routes/planRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import couponRoutes from './routes/couponRoutes.js';
import announcementRoutes from './routes/announcementRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import razorpayRoutes from './routes/razorpayRoutes.js';
import leaderboardRoutes from './routes/leaderboardRoutes.js';
import studyMaterialRoutes from './routes/studyMaterialRoutes.js';
import doubtRoutes from './routes/doubtRoutes.js';
import studentAnalyticsRoutes from './routes/studentAnalyticsRoutes.js';
import blogRoutes from './routes/blogRoutes.js';
import errorLogRoutes from './routes/errorLogRoutes.js';
import { startKeepAlive } from './jobs/keepAlive.js';

// Connect to Database
connectDB().then(() => {
  import('./models/Test.js')
    .then(({ normalizeTestStatus }) => normalizeTestStatus())
    .catch((err) => console.error('[migration] Test status normalization failed:', err?.message || err));
});

// Model bootstrap: ensure all referenced models are registered before any populate()
// (Fixes MissingSchemaError during populate of examId/testSeriesId/etc.)
import './models/Agency.js';
import './models/Exam.js';
import './models/TestSeries.js';
import './models/Test.js';
import './models/Question.js';
import './models/Enrollment.js';
import './models/Plan.js';
import './models/Order.js';
import './models/Coupon.js';
import './models/Announcement.js';
import './models/Referral.js';
import './models/RazorpayConfig.js';
import './models/StudyMaterial.js';
import './models/Doubt.js';
import './models/DoubtReply.js';
import './models/Blog.js';
import './models/ErrorLog.js';
import './models/AnalyticsEvent.js';

const app = express();
const server = http.createServer(app);

// Trust the reverse-proxy hop in production so req.ip is the real client IP.
// Without this, every user behind Nginx/Cloudflare shares the proxy IP and the
// rate-limiter buckets collapse into a single bucket → global "too many attempts".
// Override with TRUST_PROXY env: 'false' disables, a number = number of proxy hops,
// a token like 'loopback' follows Express trust-proxy semantics.
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy !== undefined) {
  app.set('trust proxy', trustProxy === 'false' ? false : trustProxy === 'true' ? 1 : Number(trustProxy) || 1);
} else {
  app.set('trust proxy', env === 'production' ? 1 : false);
}

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: CLIENT_URLS,
    methods: ['GET', 'POST', 'PUT'],
  },
});

// Baseline security (helmet, strict CORS, mongo operator sanitizer)
applySecurity(app);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize Passport for Google OAuth
app.use(passport.initialize());

// General API rate limiter, plus a tighter one for auth credentials (mounted per-route in authRoutes)
// The analytics track endpoint is skipped here — it has its own tighter limiter and must never
// consume the shared per-IP bucket (a busy shared network would otherwise 429 everyone).
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/analytics/track')) return next();
  apiLimiter(req, res, next);
});

// Socket.io CBT heartbeat monitoring
io.on('connection', (socket) => {
  console.log(`Socket client connected: ${socket.id}`);

  // Join a room for a specific test attempt
  socket.on('join_attempt', (attemptId) => {
    socket.join(attemptId);
    console.log(`Socket joined attempt room: ${attemptId}`);
  });

  socket.on('disconnect', () => {
    console.log(`Socket client disconnected: ${socket.id}`);
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/bookmarks', bookmarkRoutes);
app.use('/api/practice', practiceRoutes);
app.use('/api/agencies', agencyRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/test-series', testSeriesRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/razorpay', razorpayRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/materials', studyMaterialRoutes);
app.use('/api/doubts', doubtRoutes);
app.use('/api/my-analytics', studentAnalyticsRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/errors', errorLogRoutes);

// Test endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'ExamOS server is healthy and running.' });
});

// Lightweight health endpoint (used by the keep-alive job / uptime monitors)
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'ExamOS server is healthy and running.', uptime: Math.floor(process.uptime()) });
});

// Centralized error handling (MUST be last)
app.use(errorHandler);

server.listen(port, () => {
  console.log(`ExamOS Enterprise Server running in ${process.env.NODE_ENV} mode on port ${port}`);
  startKeepAlive();
});