import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";

export const requireGatewayIdentity = (req) => {
  const expectedSecret = process.env.GATEWAY_SECRET;
  const gatewaySecret = req.headers["x-gateway-secret"];

  if (!expectedSecret) {
    return {
      ok: false,
      status: 500,
      message: "Gateway secret is not configured.",
    };
  }

  if (gatewaySecret !== expectedSecret) {
    return {
      ok: false,
      status: 401,
      message: "Unauthorized gateway request.",
    };
  }

  const userId = String(req.headers["x-user-id"] || "").trim();

  if (!userId) {
    return {
      ok: false,
      status: 401,
      message: "Not authenticated.",
    };
  }

  return { ok: true, userId };
};

export const createConversation = async (req, res) => {
  try {
    const auth = requireGatewayIdentity(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ message: auth.message });
    }

    const conversation = await Conversation.create({
      userId: auth.userId,
    });

    return res.status(200).json(conversation);
  } catch (error) {
    return res.status(500).json({ message: `create conversation error ${error}` });
  }
};

export const getConversations = async (req, res) => {
  try {
    const auth = requireGatewayIdentity(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ message: auth.message });
    }

    const conversations = await Conversation.find({
      userId: auth.userId,
    }).sort({ updatedAt: -1 });

    return res.status(200).json(conversations);
  } catch (error) {
    return res.status(500).json({ message: `get conversations error ${error}` });
  }
};

export const updateConversation = async (req, res) => {
  try {
    const auth = requireGatewayIdentity(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ message: auth.message });
    }

    const { id, title } = req.body;
    const cleanTitle = String(title || "").trim();

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
      { _id: id, userId: auth.userId },
      { title: cleanTitle },
      { new: true, runValidators: true },
    );

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    return res.status(200).json(conversation);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid conversation ID." });
    }

    return res.status(500).json({
      message: "Unable to update conversation.",
    });
  }
};

export const deleteConversation = async (req, res) => {
  try {
    const auth = requireGatewayIdentity(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ message: auth.message });
    }

    const { conversationId } = req.params;

    if (!conversationId) {
      return res.status(400).json({
        message: "Conversation ID is required.",
      });
    }

    const conversation = await Conversation.findOneAndDelete({
      _id: conversationId,
      userId: auth.userId,
    });

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found." });
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

    return res.status(500).json({
      message: "Unable to delete conversation.",
    });
  }
};

export const saveMessage = async (req, res) => {
  try {
    const auth = requireGatewayIdentity(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ message: auth.message });
    }

    const { conversationId, role, content, images, sources = [] } = req.body;

    const message = await Message.create({
      conversationId,
      content,
      role,
      images,
      sources,
    });

    return res.status(200).json(message);
  } catch (error) {
    return res.status(500).json({ message: `save message error ${error}` });
  }
};

export const getMessages = async (req, res) => {
  try {
    const auth = requireGatewayIdentity(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ message: auth.message });
    }

    const messages = await Message.find({
      conversationId: req.params.conversationId,
    }).sort({ createdAt: 1 });

    return res.status(200).json(messages);
  } catch (error) {
    return res.status(500).json({ message: `get message error ${error}` });
  }
};
