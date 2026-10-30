import { successResponse } from "../../utils/response.js";
import {
  getRecommendationsFromDB,
  processAIChatPrompt,
  saveConversationSession,
  getUserConversationHistory,
} from "./ai.service.js";

export const chatWithAIController = async (req, res, next) => {
  try {
    const { prompt, preferences, activeProductId, messages } = req.body || {};
    const reply = await processAIChatPrompt({
      prompt,
      user: req.user || null,
      preferences,
      activeProductId,
    });

    if (req.user?._id && Array.isArray(messages)) {
      await saveConversationSession({
        userId: req.user._id,
        title: String(prompt || "Hội thoại tư vấn ReUse AI").slice(0, 60),
        messages: [...messages, reply],
        preferences,
      });
    }

    return successResponse(res, "AI phản hồi thành công", reply);
  } catch (error) {
    return next(error);
  }
};

export const getAIRecommendationsController = async (req, res, next) => {
  try {
    const { days, maxBudget, type, keyword, limit } = req.query;
    const items = await getRecommendationsFromDB({
      days: Number(days) || 4,
      maxBudget: Number(maxBudget) || 300000,
      type: type || "ALL",
      keyword: keyword || "",
      limit: Number(limit) || 6,
    });
    return successResponse(res, "Lấy danh sách gợi ý AI thành công", items);
  } catch (error) {
    return next(error);
  }
};

export const getAISessionsController = async (req, res, next) => {
  try {
    const sessions = await getUserConversationHistory(req.user?._id);
    return successResponse(res, "Lấy lịch sử hội thoại AI thành công", sessions);
  } catch (error) {
    return next(error);
  }
};

