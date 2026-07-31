/**
 * Deterministic, rule-based analytics + recommendations.
 * No LLM calls here on purpose: every number a student sees must be
 * reproducible and explainable, and this runs on every test submission
 * at scale, so it needs to be cheap (pure functions, O(n) over answers).
 *
 * Thresholds are intentionally named constants — tune them here, not
 * scattered through the codebase.
 */

const THRESHOLDS = {
  WEAK_ACCURACY: 50,        // below this -> "weak area"
  STRONG_ACCURACY: 75,      // above this -> "strong area"
  SLOW_TIME_MULTIPLIER: 1.5, // avg time > 1.5x the question's expected time -> "slow"
};

/**
 * Computes per-topic accuracy/speed/attempt stats from a flat list of
 * answer records. This is the single source every other analytic derives from.
 *
 * @param {Array<{questionId, topic, isCorrect, isAttempted, timeTakenSec, avgSolvingTimeSec}>} answers
 */
function computeTopicStats(answers) {
  const byTopic = new Map();

  for (const a of answers) {
    if (!byTopic.has(a.topic)) {
      byTopic.set(a.topic, { topic: a.topic, total: 0, attempted: 0, correct: 0, totalTime: 0 });
    }
    const stat = byTopic.get(a.topic);
    stat.total += 1;
    if (a.isAttempted) stat.attempted += 1;
    if (a.isCorrect) stat.correct += 1;
    stat.totalTime += a.timeTakenSec || 0;
  }

  return Array.from(byTopic.values()).map((s) => ({
    topic: s.topic,
    totalQuestions: s.total,
    attempted: s.attempted,
    correct: s.correct,
    accuracy: s.attempted ? round1((s.correct / s.attempted) * 100) : 0,
    attemptRate: round1((s.attempted / s.total) * 100),
    avgTimeSec: s.attempted ? round1(s.totalTime / s.attempted) : 0,
  }));
}

/**
 * Overall attempt-level summary: accuracy, speed, and a 0-100 "readiness"
 * score blending accuracy, attempt rate, and consistency across topics.
 */
function computeOverallSummary(answers) {
  const attempted = answers.filter((a) => a.isAttempted);
  const correct = attempted.filter((a) => a.isCorrect);
  const accuracy = attempted.length ? round1((correct.length / attempted.length) * 100) : 0;
  const attemptRate = round1((attempted.length / (answers.length || 1)) * 100);

  const topicStats = computeTopicStats(answers);
  const accuracies = topicStats.map((t) => t.accuracy);
  const consistency = computeConsistencyScore(accuracies);

  // Weighted blend — accuracy matters most, then how much of the paper
  // was attempted, then how even performance is across topics.
  const readiness = round1(accuracy * 0.5 + attemptRate * 0.3 + consistency * 0.2);

  return {
    accuracy,
    attemptRate,
    consistencyScore: consistency,
    examReadiness: readiness,
    totalQuestions: answers.length,
    attempted: attempted.length,
    correct: correct.length,
    incorrect: attempted.length - correct.length,
    skipped: answers.length - attempted.length,
  };
}

/** Lower variance across topic accuracies -> higher consistency (0-100). */
function computeConsistencyScore(accuracies) {
  if (!accuracies.length) return 0;
  const mean = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
  const variance = accuracies.reduce((a, b) => a + (b - mean) ** 2, 0) / accuracies.length;
  const stdDev = Math.sqrt(variance);
  // Map stdDev (0 = perfectly consistent) onto a 0-100 score, floored at 0.
  return round1(Math.max(0, 100 - stdDev));
}

/**
 * Deterministic recommendations derived purely from topic stats.
 * Each rule is independent and explainable — a student (or support agent)
 * can always be told exactly why a recommendation was generated.
 */
function generateRecommendations(topicStats) {
  const recommendations = [];

  for (const t of topicStats) {
    if (t.attempted === 0) continue;

    if (t.accuracy < THRESHOLDS.WEAK_ACCURACY) {
      recommendations.push({
        type: 'TOPIC_PRACTICE',
        topic: t.topic,
        reason: `Accuracy in ${t.topic} is ${t.accuracy}%, below the ${THRESHOLDS.WEAK_ACCURACY}% threshold.`,
        priority: 'high',
      });
    } else if (t.accuracy >= THRESHOLDS.STRONG_ACCURACY) {
      recommendations.push({
        type: 'MAINTAIN_STRENGTH',
        topic: t.topic,
        reason: `${t.topic} is a strong area (${t.accuracy}%) — a full-length mock will confirm speed under pressure.`,
        priority: 'low',
      });
    }
  }

  return recommendations;
}

/**
 * Spaced-repetition revision schedule for incorrectly answered questions.
 * Fixed intervals (Day 1/3/7/15/30) rather than a full SM-2 implementation —
 * simple, predictable, and easy for a student to plan around. Swap this
 * function out for a proper spaced-repetition algorithm later without
 * touching any caller.
 */
const REVISION_INTERVALS_DAYS = [1, 3, 7, 15, 30];

function buildRevisionQueue(incorrectQuestionIds, fromDate = new Date()) {
  return incorrectQuestionIds.flatMap((questionId) =>
    REVISION_INTERVALS_DAYS.map((days, stage) => ({
      questionId,
      stage: stage + 1,
      dueAt: addDays(fromDate, days),
      status: 'pending',
    }))
  );
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

module.exports = {
  THRESHOLDS,
  computeTopicStats,
  computeOverallSummary,
  computeConsistencyScore,
  generateRecommendations,
  buildRevisionQueue,
};
