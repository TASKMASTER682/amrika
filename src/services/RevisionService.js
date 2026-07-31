import RevisionQueue from '../models/RevisionQueue.js';

// Intervals corresponding to Spaced Repetition stages:
// Stage 1: 1 day, Stage 2: 3 days, Stage 3: 7 days, Stage 4: 15 days, Stage 5: 30 days
const STAGE_INTERVALS = {
  1: 1 * 24 * 60 * 60 * 1000,
  2: 3 * 24 * 60 * 60 * 1000,
  3: 7 * 24 * 60 * 60 * 1000,
  4: 15 * 24 * 60 * 60 * 1000,
  5: 30 * 24 * 60 * 60 * 1000,
};

/**
 * Queue wrong answers from a test attempt to spaced repetition
 */
export const queueFailedQuestions = async (studentId, answers) => {
  const incorrectAnswers = answers.filter(ans => ans.isCorrect === false && ans.selectedAnswer.length > 0);

  const bulkOps = incorrectAnswers.map(ans => {
    return {
      updateOne: {
        filter: { studentId, questionId: ans.questionId },
        update: {
          $setOnInsert: {
            studentId,
            questionId: ans.questionId,
            stage: 1,
            dueDate: new Date(Date.now() + STAGE_INTERVALS[1]),
            status: 'Active',
          }
        },
        upsert: true,
      }
    };
  });

  if (bulkOps.length > 0) {
    await RevisionQueue.bulkWrite(bulkOps);
  }
};

/**
 * Handles a student's answer submission on a revision item
 */
export const processRevisionAttempt = async (studentId, questionId, wasCorrect) => {
  const item = await RevisionQueue.findOne({ studentId, questionId });
  if (!item) return null;

  item.attemptsCount += 1;

  if (wasCorrect) {
    if (item.stage < 5) {
      item.stage += 1;
      item.dueDate = new Date(Date.now() + STAGE_INTERVALS[item.stage]);
      item.status = 'Active';
    } else {
      item.status = 'Mastered'; // Student passed Stage 5 (30 Days retention)
    }
  } else {
    // Repeated mistake: reset to Stage 1 and schedule for tomorrow
    item.stage = 1;
    item.dueDate = new Date(Date.now() + STAGE_INTERVALS[1]);
    item.status = 'Active';
  }

  await item.save();
  return item;
};

/**
 * Fetches revision items due today or past due
 */
export const getPendingRevisions = async (studentId) => {
  return await RevisionQueue.find({
    studentId,
    status: 'Active',
    dueDate: { $lte: new Date() },
  }).populate('questionId');
};
