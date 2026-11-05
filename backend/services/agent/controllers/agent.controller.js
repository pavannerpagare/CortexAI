import axios from "axios";
import mongoose from "mongoose";

import { graph } from "../graph/graph.js";
import { addMessage } from "../config/memory.js";
import { retrieveRelevantChunks } from "../services/rag.service.js";

import GeneratedArtifact from "../models/generatedArtifact.model.js";
const MAX_IMAGE_SIZE = 14 * 1024 * 1024;

const IMAGE_DATA_URL_REGEX =
  /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

const getImageExtension = (contentType) => {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
};

const sanitizeFilename = (filename, extension, index) => {
  const originalName = String(filename || "cortexai-image")
    .split(/[\\/]/)
    .pop();

  const nameWithoutExtension = originalName.replace(/\.[^.]+$/, "");

  const safeName =
    nameWithoutExtension
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .slice(0, 80) || "cortexai-image";

  return `${safeName}-${Date.now()}-${index + 1}.${extension}`;
};

// Save generated images in the existing GeneratedArtifact collection.
const saveGeneratedImages = async ({
  images,
  userId,
  conversationId,
}) => {
  if (!Array.isArray(images) || images.length === 0) {
    return [];
  }

  const savedImages = [];

  for (const [index, image] of images.entries()) {
    const dataUrl =
      typeof image === "string" ? image : image?.dataUrl;

    if (typeof dataUrl !== "string") {
      throw new Error("Generated image data is missing.");
    }

    const match = dataUrl.match(IMAGE_DATA_URL_REGEX);

    if (!match) {
      throw new Error(
        "Generated image must be a valid PNG, JPEG, or WebP data URL.",
      );
    }

    const contentType = match[1];
    const base64Data = match[2];

    // Estimate size before allocating the Buffer.
    const padding = base64Data.endsWith("==")
      ? 2
      : base64Data.endsWith("=")
        ? 1
        : 0;

    const estimatedSize =
      Math.floor((base64Data.length * 3) / 4) - padding;

    if (estimatedSize <= 0 || estimatedSize > MAX_IMAGE_SIZE) {
      throw new Error(
        "Generated image is empty or too large to store.",
      );
    }

    const buffer = Buffer.from(base64Data, "base64");

    if (!buffer.length || buffer.length > MAX_IMAGE_SIZE) {
      throw new Error("Generated image has an invalid size.");
    }

    const extension = getImageExtension(contentType);

    const filename = sanitizeFilename(
      image?.filename,
      extension,
      index,
    );

    const savedArtifact = await GeneratedArtifact.create({
      userId,
      conversationId,
      filename,
      contentType,
      data: buffer,
    });

    const artifactId = savedArtifact._id.toString();

    const previewUrl =
      `/api/agent/artifacts/${artifactId}/preview`;

    const downloadUrl =
      `/api/agent/artifacts/${artifactId}/download`;

    savedImages.push({
      artifactId,
      filename,
      contentType,
      type: "image",
      size: buffer.length,
      createdAt: savedArtifact.createdAt,
      previewUrl,
      downloadUrl,
      url: previewUrl,
    });

    console.log("[AGENT] Image artifact saved:", {
      artifactId,
      filename,
      contentType,
      size: buffer.length,
    });
  }

  console.log(
    `[AGENT] Successfully saved ${savedImages.length} image artifact(s).`,
  );

  return savedImages;
};

export const agent = async (req, res) => {
  const requestStartedAt = Date.now();

  try {
    const {
      prompt,
      conversationId,
      agent: requestedAgentInput,
      imageData,
    } = req.body;

    const userId = String(req.headers["x-user-id"] || "");

    const requestedAgent = String(
      requestedAgentInput || "auto",
    ).toLowerCase();

    // Validate request.
    if (typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({
        message: "A prompt is required.",
      });
    }

    if (!mongoose.isValidObjectId(conversationId)) {
      return res.status(400).json({
        message: "Invalid conversation ID.",
      });
    }

    if (!userId) {
      return res.status(401).json({
        message: "Not authenticated. Please sign in again.",
      });
    }

    console.log(`[AGENT] Request received: ${requestedAgent}`);

    // Skip RAG for specialized agents.
    const skipRag = [
      "coding",
      "image",
      "vision",
      "pdf",
      "ppt",
    ].includes(requestedAgent);

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
      `[AGENT] RAG stage completed in ${
        Date.now() - ragStartedAt
      } ms`,
    );

    // Save user message.
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

    // Execute LangGraph workflow.
    const graphStartedAt = Date.now();

    const result = await graph.invoke({
      prompt,
      conversationId,
      agent: requestedAgent,
      userId,
      imageData,
      ragContext: rag.context,
      ragSources: rag.sources,
    });

    console.log(
      `[AGENT] Workflow completed in ${
        Date.now() - graphStartedAt
      } ms`,
    );

    const response = result.aiResponse;

    if (typeof response !== "string" || !response.trim()) {
      throw new Error("The agent returned an empty response.");
    }

    const finalAgent = String(
      result.agent || requestedAgent,
    ).toLowerCase();

    // Preserve existing PDF, PPT and coding artifacts.
    const existingArtifacts = Array.isArray(result.artifacts)
      ? result.artifacts
      : [];

    // Only persist generated images from the Vision Agent.
    const generatedImages =
      ["image", "vision"].includes(finalAgent)
        ? await saveGeneratedImages({
            images: result.images,
            userId,
            conversationId,
          })
        : [];

    // Combine existing artifacts with newly saved images.
    const artifacts = [
      ...existingArtifacts,
      ...generatedImages,
    ];

    // Return image URLs and metadata, not Base64 strings.
    const responseImages = generatedImages;

    // Specialized agents do not return RAG citations.
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

    // Save conversation memory.
    await addMessage(conversationId, "user", prompt);
    await addMessage(conversationId, "assistant", response);

    // Save assistant message with artifact metadata.
    await axios.post(
      `${process.env.CHAT_SERVICE}/save-message`,
      {
        conversationId,
        role: "assistant",
        content: response,
        images: responseImages,
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
      `[AGENT] Total request completed in ${
        Date.now() - requestStartedAt
      } ms`,
    );

    return res.status(200).json({
      answer: response,
      images: responseImages,
      sources: responseSources,
      artifacts,
    });
  } catch (error) {
    console.error(
      `[AGENT] Request failed after ${
        Date.now() - requestStartedAt
      } ms:`,
      error,
    );

    const errorStatus =
      error.response?.status || error.status;

    const status = [400, 401, 404, 429].includes(errorStatus)
      ? errorStatus
      : 500;

    return res.status(status).json({
      message:
        status === 404
          ? "Conversation not found."
          : status === 400
            ? "Invalid agent request."
            : status === 401
              ? "Not authenticated."
              : status === 429
                ? "Agent rate limit reached. Please try again later."
                : "Unable to process the agent request.",
    });
  }
};
