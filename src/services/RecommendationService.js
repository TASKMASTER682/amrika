import TestAttempt from '../models/TestAttempt.js';
import { getAdvancedAnalytics } from './AnalyticsService.js';

/**
 * Analyzes previous test attempts and returns deterministic recommendations.
 */
export const generateRecommendations = async (studentId) => {
  // Fetch last 5 test attempts
  const attempts = await TestAttempt.find({ studentId, status: 'Submitted' })
    .sort({ submittedAt: -1 })
    .limit(5);

  if (attempts.length === 0) {
    return [
      {
        type: 'General',
        title: 'Beginner Roadmap',
        description: 'Complete your first full-length Mock Test to unlock detailed topic analytics and practice recommendations.',
        action: '/dashboard',
      }
    ];
  }

  const recommendations = [];
  const lowAccuracyTopics = new Map();
  const highSolvingTimeTopics = new Map();

  for (const attempt of attempts) {
    const advanced = await getAdvancedAnalytics(attempt._id);
    
    // Check topics with low accuracy
    advanced.topicBreakdown.forEach(topic => {
      if (topic.accuracy < 50) {
        lowAccuracyTopics.set(topic.name, (lowAccuracyTopics.get(topic.name) || 0) + 1);
      }
      
      // Average solving time threshold > 90 seconds
      const avgTime = topic.attempted > 0 ? (topic.timeSpent / topic.attempted) : 0;
      if (avgTime > 90) {
        highSolvingTimeTopics.set(topic.name, avgTime);
      }
    });
  }

  // Generate recommendations for topics with recurring low accuracy
  if (lowAccuracyTopics.size > 0) {
    const sortedLowAccuracy = [...lowAccuracyTopics.entries()].sort((a, b) => b[1] - a[1]);
    sortedLowAccuracy.slice(0, 3).forEach(([topic]) => {
      recommendations.push({
        type: 'Topic Practice',
        title: `Improve Accuracy: ${topic}`,
        description: `Your accuracy in ${topic} is below 50%. Focus on fundamentals by launching a targeted practice session.`,
        action: `/practice?topic=${encodeURIComponent(topic)}&mode=accuracy`,
      });
    });
  }

  // Generate recommendations for topics that require speed optimization
  if (highSolvingTimeTopics.size > 0) {
    const sortedHighTime = [...highSolvingTimeTopics.entries()].sort((a, b) => b[1] - a[1]);
    sortedHighTime.slice(0, 2).forEach(([topic, time]) => {
      recommendations.push({
        type: 'Speed Boost',
        title: `Optimize Timing: ${topic}`,
        description: `You are spending an average of ${Math.round(time)}s per question in ${topic}. Try timed practices to improve pacing.`,
        action: `/practice?topic=${encodeURIComponent(topic)}&mode=speed`,
      });
    });
  }

  // General recommendation based on overall trend
  const latestAttempt = attempts[0];
  if (latestAttempt.accuracy < 60) {
    recommendations.push({
      type: 'Mock Test Focus',
      title: 'Analyze Explanations',
      description: 'Your latest mock test score was lower. Re-read explanations of incorrect answers in mock results before attempting a new test.',
      action: `/cbt/results/${latestAttempt._id}`,
    });
  }

  // Default recommendation if list is too small
  if (recommendations.length < 3) {
    recommendations.push({
      type: 'General Revision',
      title: 'Active Recall Check',
      description: 'Maintain your retention! Go through your pending spaced repetition queue.',
      action: '/revision',
    });
  }

  return recommendations;
};
