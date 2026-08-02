import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import { connectDB } from './config/db.js';
import { errorHandler } from './middleware/errorHandler.js';

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

// Connect to Database
connectDB();

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


const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT']
  }
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Test endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'ExamOS server is healthy and running.' });
});

// Centralized error handling (MUST be last)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`ExamOS Enterprise Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

