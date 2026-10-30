import axios from "axios";
import { graph } from "../graph/graph.js";
import { addMessage } from "../config/memory.js";
import { retrieveRelevantChunks } from "../services/rag.service.js";

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
      message: "Not authenticated. Please sign in again.",
    };
  }

  return { ok: true, userId };
};

export const agent = async (req, res) => {
  try {
    const auth = requireGatewayIdentity(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ message: auth.message });
    }

    const { prompt, conversationId, agent } = req.body;
    const userId = auth.userId;

    const rag = await retrieveRelevantChunks({
      userId,
      query: prompt,
    });

    await axios.post(`${process.env.CHAT_SERVICE}/save-message`, {
      conversationId,
      role: "user",
      content: prompt,
    }, {
      headers: {
        "x-gateway-secret": process.env.GATEWAY_SECRET,
        "x-user-id": userId,
      },
    });

    const result = await graph.invoke({
      prompt,
      conversationId,
      agent,
      userId,
      ragContext: rag.context,
      ragSources: rag.sources,
    });

    const response = result.aiResponse;

    await addMessage(conversationId, "user", prompt);
    await addMessage(conversationId, "assistant", response);

    await axios.post(`${process.env.CHAT_SERVICE}/save-message`, {
      conversationId,
      role: "assistant",
      content: response,
      images: result.images,
      sources: rag.sources,
    }, {
      headers: {
        "x-gateway-secret": process.env.GATEWAY_SECRET,
        "x-user-id": userId,
      },
    });

    return res.status(200).json({
      answer: response,
      images: result.images,
      sources: rag.sources,
    });
  } catch (error) {
    return res.status(500).json({
      message: `agent error ${error.message}`,
    });
  }
};
