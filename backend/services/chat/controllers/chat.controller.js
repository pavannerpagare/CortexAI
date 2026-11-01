import mongoose from "mongoose";
import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";

const getUserId = (req) => String(req.headers["x-user-id"] || "");

export const createConversation = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated." });

    const conversation = await Conversation.create({
      userId: userId,
    });

    return res.status(200).json(conversation);
  } catch (error) {
    return res
      .status(500)
      .json({ message: `create conversation error ${error}` });
  }
};

export const getConversations = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated." });

    const conversations = await Conversation.find({
      userId: userId,
    }).sort({ updatedAt: -1 });

    return res.status(200).json(conversations);
  } catch (error) {
    return res
      .status(500)
      .json({ message: `create conversation error ${error}` });
  }
};

export const updateConversation = async (req, res) => {
  try {
    const { id, title } = req.body;
    const userId = String(req.headers["x-user-id"] || "");
    const cleanTitle = String(title || "").trim();

    if (!userId) {
      return res.status(401).json({ message: "Not authenticated." });
    }

    if (!id || !cleanTitle) {
      return res.status(400).json({
        message: "Conversation ID and title are required.",
      });
    }

    if (cleanTitle.length > 100) {
      return res.status(400).json({
        message: "Conversation title must be 100 characters or fewer.",
      });
    }

    const conversation = await Conversation.findOneAndUpdate(
      { _id: id, userId },
      { title: cleanTitle },
      { new: true, runValidators: true },
    );

    if (!conversation) {
      return res.status(404).json({
        message: "Conversation not found.",
      });
    }

    return res.status(200).json(conversation);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid conversation ID." });
    }

    console.error("UPDATE CONVERSATION ERROR:", error);
    return res.status(500).json({
      message: "Unable to update conversation.",
    });
  }
};

export const deleteConversation = async (req, res) => {
  try {
    const userId = String(req.headers["x-user-id"] || "");
    const { conversationId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Not authenticated." });
    }

    if (!conversationId) {
      return res.status(400).json({
        message: "Conversation ID is required.",
      });
    }

    const conversation = await Conversation.findOneAndDelete({
      _id: conversationId,
      userId,
    });

    if (!conversation) {
      return res.status(404).json({
        message: "Conversation not found.",
      });
    }

    await Message.deleteMany({ conversationId: conversation._id });

    return res.status(200).json({
      message: "Conversation and its messages deleted successfully.",
      conversationId: String(conversation._id),
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid conversation ID." });
    }

    console.error("DELETE CONVERSATION ERROR:", error);
    return res.status(500).json({
      message: "Unable to delete conversation.",
    });
  }
};

export const saveMessage = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { conversationId, role, content, images, sources = [], artifacts = [] } = req.body;

    if (!userId) return res.status(401).json({ message: "Not authenticated." });
    if (!mongoose.isValidObjectId(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation ID." });
    }
    if (!['user', 'assistant'].includes(role) || typeof content !== "string") {
      return res.status(400).json({ message: "Invalid message body." });
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      userId,
    });
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    const message = await Message.create({
      conversationId,
      content,
      role,
      images,
      sources,
      artifacts,
    });

    return res.status(200).json(message);
  } catch (error) {
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({ message: "Invalid message body." });
    }
    return res.status(500).json({
      message: "Unable to save message.",
    });
  }
};

export const getMessages = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated." });
    const { conversationId } = req.params;
    if (!mongoose.isValidObjectId(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation ID." });
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      userId,
    });
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    const messages = await Message.find({
      conversationId,
    }).sort({ createdAt: 1 });
    return res.status(200).json(messages);
  } catch (error) {
    return res.status(500).json({ message: "Unable to load messages." });
  }
};
