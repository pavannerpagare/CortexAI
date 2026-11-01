import axios from "axios";
import mongoose from "mongoose";
import { graph } from "../graph/graph.js";
import { addMessage } from "../config/memory.js";
import { retrieveRelevantChunks } from "../services/rag.service.js";

export const agent = async (req, res) => {
  const requestStartedAt = Date.now();

  try {
    const { prompt, conversationId, agent, imageData } = req.body;
    const userId = String(req.headers["x-user-id"] || "");
    const requestedAgent = String(agent || "auto").toLowerCase();

    if (typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ message: "A prompt is required." });
    }
    if (!mongoose.isValidObjectId(conversationId)) {
      return res.status(400).json({ message: "Invalid conversation ID." });
    }

    console.log(`[AGENT] Request received: ${requestedAgent}`);

    if (!userId) {
      return res.status(401).json({
        message: "Not authenticated. Please sign in again.",
      });
    }

    // Image analysis, PDF generation, and PPT generation
    // do not need document retrieval for their normal workflow.
    const skipRag = ["coding", "image", "vision", "pdf", "ppt"].includes(
      requestedAgent,
    );

    let rag = {
      context: "",
      sources: [],
    };

    const ragStartedAt = Date.now();

    if (skipRag) {
      console.log(`[AGENT] Skipping RAG for ${requestedAgent}.`);
    } else {
      rag = await retrieveRelevantChunks({
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
    }

    console.log(
      `[AGENT] RAG stage completed in ${Date.now() - ragStartedAt} ms`,
    );

    await axios.post(
      `${process.env.CHAT_SERVICE}/save-message`,
      {
        conversationId,
        role: "user",
        content: prompt,
      },
      {
        headers: {
          "x-gateway-secret": process.env.GATEWAY_SECRET,
          "x-user-id": userId,
        },
      },
    );

    console.log("[AGENT] User message saved; invoking workflow.");

    const graphStartedAt = Date.now();

    const result = await graph.invoke({
      prompt,
      conversationId,
      agent,
      userId,
      imageData,
      ragContext: rag.context,
      ragSources: rag.sources,
    });

    console.log(
      `[AGENT] Workflow completed in ${Date.now() - graphStartedAt} ms`,
    );

    const response = result.aiResponse;
    const artifacts = result.artifacts ?? [];

    const finalAgent = String(result.agent || requestedAgent).toLowerCase();

    const responseSources = [
      "coding",
      "search",
      "pdf",
      "ppt",
      "image",
      "vision",
    ].includes(finalAgent)
      ? []
      : rag.sources;

    await addMessage(conversationId, "user", prompt);
    await addMessage(conversationId, "assistant", response);

    await axios.post(
      `${process.env.CHAT_SERVICE}/save-message`,
      {
        conversationId,
        role: "assistant",
        content: response,
        images: result.images,
        sources: responseSources,
        artifacts,
      },
      {
        headers: {
          "x-gateway-secret": process.env.GATEWAY_SECRET,
          "x-user-id": userId,
        },
      },
    );

    console.log(
      `[AGENT] Total request completed in ${Date.now() - requestStartedAt} ms`,
    );

    return res.status(200).json({
      answer: response,
      images: result.images,
      sources: responseSources,
      artifacts,
    });
  } catch (error) {
    console.error(
      `[AGENT] Request failed after ${
        Date.now() - requestStartedAt
      } ms: ${error.message}`,
    );

    const status = [400, 401, 404, 429].includes(error.response?.status)
      ? error.response.status
      : 500;
    return res.status(status).json({
      message:
        status === 404
          ? "Conversation not found."
          : status === 400
            ? "Invalid agent request."
            : status === 401
              ? "Not authenticated."
              : "Unable to process the agent request.",
    });
  }
};
