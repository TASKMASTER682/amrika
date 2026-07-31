import TestAttempt from '../models/TestAttempt.js';
import Test from '../models/Test.js';
import Question from '../models/Question.js';

/**
 * Computes all analytics parameters for a submitted test attempt.
 */
export const calculateAttemptAnalytics = async (attemptId) => {
  const attempt = await TestAttempt.findById(attemptId).populate('answers.questionId');
  if (!attempt) throw new Error('Attempt not found');

  const test = await Test.findById(attempt.testId).populate('sections.questions');
  if (!test) throw new Error('Test template not found');

  let totalScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let attemptedCount = 0;
  let totalTimeSpent = 0;

  // Track counts per section
  const sectionStats = {};
  test.sections.forEach(sec => {
    sectionStats[sec.name] = {
      sectionName: sec.name,
      score: 0,
      totalQuestions: sec.questions.length,
      attempted: 0,
      correct: 0,
      wrong: 0,
      timeSpent: 0,
    };
  });

  // Track stats per Subject, Topic, Difficulty
  const subjectStats = {};
  const topicStats = {};
  const difficultyStats = {
    Easy: { total: 0, correct: 0, attempted: 0, timeSpent: 0 },
    Medium: { total: 0, correct: 0, attempted: 0, timeSpent: 0 },
    Hard: { total: 0, correct: 0, attempted: 0, timeSpent: 0 }
  };

  const processedAnswers = [];

  // Loop through student answers
  for (const ans of attempt.answers) {
    const question = ans.questionId;
    if (!question) continue;

    const section = test.sections.find(sec => sec.questions.some(q => q._id.toString() === question._id.toString()));
    const sectionName = section ? section.name : 'Unknown';
    const sectionId = section ? section._id.toString() : 'unknown';

    const isAttempted = ans.selectedAnswer && ans.selectedAnswer.length > 0;
    let isCorrect = false;
    let marksObtained = 0;

    // Verify option answer correctness
    if (isAttempted) {
      attemptedCount++;
      totalTimeSpent += ans.timeSpent;

      // Handle correctness check based on question type
      if (question.type === 'Single Correct' || question.type === 'True False' || question.type === 'Assertion Reason') {
        isCorrect = question.correctAnswer[0] === ans.selectedAnswer[0];
      } else if (question.type === 'Multiple Correct') {
        const correctSet = new Set(question.correctAnswer);
        const userSet = new Set(ans.selectedAnswer);
        isCorrect = correctSet.size === userSet.size && [...correctSet].every(val => userSet.has(val));
      } else if (question.type === 'Integer' || question.type === 'Numerical') {
        isCorrect = Number(question.correctAnswer[0]) === Number(ans.selectedAnswer[0]);
      } else {
        isCorrect = question.correctAnswer[0]?.trim().toLowerCase() === ans.selectedAnswer[0]?.trim().toLowerCase();
      }

      if (isCorrect) {
        correctCount++;
        marksObtained = section ? section.marksPerQuestion : question.marks;
      } else {
        wrongCount++;
        marksObtained = section && section.negativeMarking ? -section.negativeMarksPerQuestion : -question.negativeMarks;
      }
    }

    totalScore += marksObtained;

    // Update Section Statistics
    if (sectionStats[sectionName]) {
      const stats = sectionStats[sectionName];
      stats.timeSpent += ans.timeSpent;
      if (isAttempted) {
        stats.attempted++;
        if (isCorrect) {
          stats.correct++;
          stats.score += section.marksPerQuestion;
        } else {
          stats.wrong++;
          stats.score -= section.negativeMarking ? section.negativeMarksPerQuestion : 0;
        }
      }
    }

    // Update Subject & Topic Statistics
    const sub = question.subject;
    const top = question.topic;
    
    if (!subjectStats[sub]) subjectStats[sub] = { total: 0, correct: 0, attempted: 0, timeSpent: 0 };
    if (!topicStats[top]) topicStats[top] = { total: 0, correct: 0, attempted: 0, timeSpent: 0 };

    subjectStats[sub].total++;
    topicStats[top].total++;
    difficultyStats[question.difficulty].total++;

    if (isAttempted) {
      subjectStats[sub].attempted++;
      subjectStats[sub].timeSpent += ans.timeSpent;
      topicStats[top].attempted++;
      topicStats[top].timeSpent += ans.timeSpent;
      difficultyStats[question.difficulty].attempted++;
      difficultyStats[question.difficulty].timeSpent += ans.timeSpent;

      if (isCorrect) {
        subjectStats[sub].correct++;
        topicStats[top].correct++;
        difficultyStats[question.difficulty].correct++;
      }
    }

    processedAnswers.push({
      questionId: question._id,
      sectionId,
      selectedAnswer: ans.selectedAnswer,
      status: ans.status,
      timeSpent: ans.timeSpent,
      isCorrect,
      marksObtained,
    });
  }

  // Calculate final ratios
  const totalQuestions = attempt.answers.length;
  const accuracy = attemptedCount > 0 ? (correctCount / attemptedCount) * 100 : 0;
  const attemptPercentage = totalQuestions > 0 ? (attemptedCount / totalQuestions) * 100 : 0;

  // Format section analyses
  const finalSectionAnalysis = Object.values(sectionStats).map(sec => ({
    ...sec,
    accuracy: sec.attempted > 0 ? (sec.correct / sec.attempted) * 100 : 0,
  }));

  // Update Attempt Record
  attempt.answers = processedAnswers;
  attempt.score = totalScore;
  attempt.accuracy = accuracy;
  attempt.attemptPercentage = attemptPercentage;
  attempt.status = 'Submitted';
  attempt.submittedAt = new Date();
  attempt.sectionAnalysis = finalSectionAnalysis;

  await attempt.save();

  // Recalculate Ranks & Percentiles for this specific Test template
  await updateRanksAndPercentiles(attempt.testId);

  // Re-fetch populated attempt for returning
  return await TestAttempt.findById(attemptId)
    .populate('answers.questionId')
    .populate('testId');
};

/**
 * Calculates and updates Rank and Percentiles for all submissions of a Test
 */
const updateRanksAndPercentiles = async (testId) => {
  const attempts = await TestAttempt.find({ testId, status: 'Submitted' }).sort({ score: -1, submittedAt: 1 });
  const totalCandidates = attempts.length;

  for (let i = 0; i < totalCandidates; i++) {
    const rank = i + 1;
    // Percentile formula: ((total - rank) / total) * 100. If 1 candidate, percentile is 100%.
    const percentile = totalCandidates > 1 ? ((totalCandidates - rank) / (totalCandidates - 1)) * 100 : 100;

    await TestAttempt.updateOne(
      { _id: attempts[i]._id },
      { $set: { rank, percentile: Math.round(percentile * 100) / 100 } }
    );
  }
};

/**
 * Generates Subject, Topic, Difficulty analytics, weak areas, and estimated exam readiness
 */
export const getAdvancedAnalytics = async (attemptId) => {
  const attempt = await TestAttempt.findById(attemptId).populate('answers.questionId');
  if (!attempt) throw new Error('Attempt not found');

  const subjectStats = {};
  const topicStats = {};
  const difficultyStats = {
    Easy: { total: 0, correct: 0, attempted: 0, timeSpent: 0 },
    Medium: { total: 0, correct: 0, attempted: 0, timeSpent: 0 },
    Hard: { total: 0, correct: 0, attempted: 0, timeSpent: 0 }
  };

  attempt.answers.forEach(ans => {
    const q = ans.questionId;
    if (!q) return;

    if (!subjectStats[q.subject]) subjectStats[q.subject] = { total: 0, correct: 0, attempted: 0, timeSpent: 0 };
    if (!topicStats[q.topic]) topicStats[q.topic] = { total: 0, correct: 0, attempted: 0, timeSpent: 0 };

    subjectStats[q.subject].total++;
    topicStats[q.topic].total++;
    difficultyStats[q.difficulty].total++;

    if (ans.selectedAnswer && ans.selectedAnswer.length > 0) {
      subjectStats[q.subject].attempted++;
      subjectStats[q.subject].timeSpent += ans.timeSpent;
      topicStats[q.topic].attempted++;
      topicStats[q.topic].timeSpent += ans.timeSpent;
      difficultyStats[q.difficulty].attempted++;
      difficultyStats[q.difficulty].timeSpent += ans.timeSpent;

      if (ans.isCorrect) {
        subjectStats[q.subject].correct++;
        topicStats[q.topic].correct++;
        difficultyStats[q.difficulty].correct++;
      }
    }
  });

  // Highlight Strong/Weak topics based on accuracy thresholds
  const weakAreas = [];
  const strongAreas = [];

  Object.entries(topicStats).forEach(([topic, stats]) => {
    const accuracy = stats.attempted > 0 ? (stats.correct / stats.attempted) * 100 : 0;
    const data = { topic, accuracy, total: stats.total, attempted: stats.attempted };
    
    if (accuracy < 50) {
      weakAreas.push(data);
    } else if (accuracy >= 75) {
      strongAreas.push(data);
    }
  });

  // Calculate Estimated Exam Readiness (EER) index: 
  // Base weights: accuracy (50%), attempt% (30%), difficulty handling (20%)
  const easyAccuracy = difficultyStats.Easy.attempted > 0 ? (difficultyStats.Easy.correct / difficultyStats.Easy.attempted) : 0;
  const mediumAccuracy = difficultyStats.Medium.attempted > 0 ? (difficultyStats.Medium.correct / difficultyStats.Medium.attempted) : 0;
  const hardAccuracy = difficultyStats.Hard.attempted > 0 ? (difficultyStats.Hard.correct / difficultyStats.Hard.attempted) : 0;

  const difficultyScore = (easyAccuracy * 0.5) + (mediumAccuracy * 0.3) + (hardAccuracy * 0.2); // Weighted difficulty compliance
  const accuracyFraction = attempt.accuracy / 100;
  const attemptFraction = attempt.attemptPercentage / 100;

  const examReadinessScore = Math.round(((accuracyFraction * 0.5) + (attemptFraction * 0.3) + (difficultyScore * 0.2)) * 100);

  return {
    subjectBreakdown: Object.entries(subjectStats).map(([name, data]) => ({ name, ...data, accuracy: data.attempted > 0 ? (data.correct / data.attempted) * 100 : 0 })),
    topicBreakdown: Object.entries(topicStats).map(([name, data]) => ({ name, ...data, accuracy: data.attempted > 0 ? (data.correct / data.attempted) * 100 : 0 })),
    difficultyBreakdown: Object.entries(difficultyStats).map(([level, data]) => ({ level, ...data, accuracy: data.attempted > 0 ? (data.correct / data.attempted) * 100 : 0 })),
    weakAreas,
    strongAreas,
    examReadinessScore, // 0 - 100 index
  };
};
