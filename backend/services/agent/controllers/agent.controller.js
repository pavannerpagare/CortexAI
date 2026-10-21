import axios from "axios";
import { graph } from "../graph/graph.js";
import { addMessage } from "../config/memory.js";
import { retrieveRelevantChunks } from "../services/rag.service.js";

export const agent = async (req, res) => {
  try {
    const { prompt, conversationId, agent } = req.body;
    const userId = String(req.headers["x-user-id"] || "");

    if (!userId) {
      return res
        .status(401)
        .json({ message: "Not authenticated. Please sign in again." });
    }

    const rag = await retrieveRelevantChunks({
      userId,
      query: prompt,
    });

    console.log(
      "RAG SOURCES FOR CURRENT QUESTION:",
      rag.sources.map(({ filename, chunkIndex, score }) => ({
        filename,
        chunkIndex,
        score,
      })),
    );

    await axios.post(`${process.env.CHAT_SERVICE}/save-message`, {
      conversationId,
      role: "user",
      content: prompt,
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
    });

    return res.status(200).json({
      answer: response,
      images: result.images,
      sources: rag.sources,
    });
  } catch (error) {
    console.error("AGENT ERROR:", error);

    return res.status(500).json({
      message: `agent error ${error.message}`,
    });
  }
};
