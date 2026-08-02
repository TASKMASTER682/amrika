import User from '../models/User.js';
import TestAttempt from '../models/TestAttempt.js';

// Level = floor(sqrt(xp/100)) + 1
const levelForXp = (xp) => Math.floor(Math.sqrt(xp / 100)) + 1;

// Badge definitions
const BADGES = [
  { code: 'first_test', name: 'First Steps', desc: 'Submitted your first mock test.' },
  { code: 'ten_tests', name: 'Marathon Runner', desc: 'Submitted 10 tests.' },
  { code: 'perfect_accuracy', name: 'Sharp Shooter', desc: 'Scored 100% accuracy in a test.' },
  { code: 'top_three', name: 'Podium Finish', desc: 'Finished in the top 3 of a test.' },
  { code: 'seven_day_streak', name: 'Dedicated', desc: 'Reached a 7-day streak.' },
  { code: 'first_doubt', name: 'Curious Mind', desc: 'Asked your first doubt.' },
  { code: 'first_bookmark', name: 'Collector', desc: 'Bookmarked your first question.' },
];

const hasBadge = (user, code) => user.badges?.some(b => b.code === code);

const grantBadge = async (userId, code) => {
  const user = await User.findById(userId);
  if (!user) return;
  const badge = BADGES.find(b => b.code === code);
  if (!badge || hasBadge(user, code)) return;
  user.badges.push({ code, name: badge.name });
  user.xp += 50;
  await user.save();
};

// Call after a test is submitted. Awards XP + badges + updates streak.
export const awardTestSubmission = async ({ userId, attemptId }) => {
  const attempt = await TestAttempt.findById(attemptId);
  if (!attempt) return;

  const user = await User.findById(userId);
  if (!user) return;

  // Streak tracking (lastActiveDay is used for daily stats already; reuse)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const last = user.lastActiveDay ? new Date(user.lastActiveDay) : null;
  if (!last || last.getTime() !== today.getTime()) {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (last && last.getTime() === yesterday.getTime()) {
      user.streak = (user.streak || 0) + 1;
    } else {
      user.streak = 1;
    }
    if (user.streak > (user.bestStreak || 0)) user.bestStreak = user.streak;
    user.lastActiveDay = today;
  }

  // XP: base 100 for submitting + accuracy bonus
  let gained = 100;
  if (attempt.accuracy >= 90) gained += 60;
  else if (attempt.accuracy >= 75) gained += 40;
  else if (attempt.accuracy >= 50) gained += 20;
  gained += Math.round(attempt.score);

  user.xp = (user.xp || 0) + gained;
  const newLevel = levelForXp(user.xp);
  if (newLevel > (user.level || 1)) user.level = newLevel;

  await user.save();

  // Badges (fire and forget)
  const submittedCount = await TestAttempt.countDocuments({ studentId: userId, status: 'Submitted' });
  if (submittedCount === 1) grantBadge(userId, 'first_test');
  if (submittedCount >= 10) grantBadge(userId, 'ten_tests');
  if (attempt.accuracy === 100) grantBadge(userId, 'perfect_accuracy');
  if (attempt.rank && attempt.rank <= 3) grantBadge(userId, 'top_three');
  if (user.streak >= 7) grantBadge(userId, 'seven_day_streak');

  return { xp: user.xp, level: user.level, streak: user.streak, gained };
};

// Call when a doubt is created.
export const awardDoubt = async (userId) => {
  await grantBadge(userId, 'first_doubt');
};

// Call when a question is bookmarked.
export const awardBookmark = async (userId) => {
  await grantBadge(userId, 'first_bookmark');
};

export const getGamification = async (userId) => {
  const user = await User.findById(userId).select('xp level streak bestStreak badges name');
  if (!user) return null;
  const nextLevelXp = 100 * (user.level * user.level);
  const prevLevelXp = user.level > 1 ? 100 * ((user.level - 1) * (user.level - 1)) : 0;
  return {
    xp: user.xp,
    level: user.level,
    streak: user.streak,
    bestStreak: user.bestStreak,
    badges: user.badges || [],
    levelProgress: nextLevelXp > prevLevelXp ? Math.min(100, Math.round(((user.xp - prevLevelXp) / (nextLevelXp - prevLevelXp)) * 100)) : 100,
    nextLevelXp,
  };
};
