import Question from '../models/Question.js';
import * as RecommendationService from '../services/RecommendationService.js';

export const generatePracticeSet = async (req, res, next) => {
  try {
    const { subject, topic, difficulty, limit = 10 } = req.query;

    const filter = { active: true, approvalStatus: 'Approved' };
    if (subject) filter.subject = subject;
    if (topic) filter.topic = topic;
    if (difficulty) filter.difficulty = difficulty;

    // Use MongoDB aggregation to randomly select questions matching filter
    const questions = await Question.aggregate([
      { $match: filter },
      { $sample: { size: Number(limit) } }
    ]);

    res.json({
      success: true,
      data: questions,
    });
  } catch (error) {
    next(error);
  }
};

export const getRecommendations = async (req, res, next) => {
  try {
    const list = await RecommendationService.generateRecommendations(req.user._id);
    res.json({
      success: true,
      data: list,
    });
  } catch (error) {
    next(error);
  }
};
