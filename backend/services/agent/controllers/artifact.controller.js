import mongoose from "mongoose";
import GeneratedArtifact from "../models/generatedArtifact.model.js";

const safeFilename = (value) =>
  String(value || "cortexai-artifact").replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/\s+/g, " ").trim();

const inferArtifactType = (artifact) => {
  if (artifact.artifactType) return artifact.artifactType;

  const contentType = String(artifact.contentType || "").toLowerCase();
  const filename = String(artifact.filename || "").toLowerCase();

  if (contentType.includes("pdf") || filename.endsWith(".pdf")) return "pdf";
  if (contentType.includes("presentation") || filename.endsWith(".pptx")) return "ppt";
  if (contentType.startsWith("image/")) return "image";
  if (
    contentType.startsWith("text/") ||
    /\.(js|jsx|ts|tsx|py|cpp|c|java|html|css|sql|json|md|txt|sh)$/.test(filename)
  ) {
    return "code";
  }

  return "file";
};

const requireUserId = (req, res) => {
  const userId = String(req.headers["x-user-id"] || "");
  if (!userId) {
    res.status(401).json({ message: "Not authenticated." });
    return null;
  }
  return userId;
};

const findOwnedArtifact = async (artifactId, userId) => {
  if (!mongoose.isValidObjectId(artifactId)) return null;

  return GeneratedArtifact.findOne({
    _id: artifactId,
    userId,
  }).select("filename contentType artifactType language metadata data");
};

export const listArtifacts = async (req, res) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const filter = { userId };
    const { conversationId } = req.query;

    if (conversationId) {
      if (!mongoose.isValidObjectId(conversationId)) {
        return res.status(400).json({ message: "Invalid conversation ID." });
      }
      filter.conversationId = conversationId;
    }

    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 100;

    const artifacts = await GeneratedArtifact.find(filter)
      .select("filename contentType artifactType language metadata conversationId createdAt updatedAt")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json({
      artifacts: artifacts.map((artifact) => ({
        artifactId: String(artifact._id),
        filename: artifact.filename,
        contentType: artifact.contentType || "application/octet-stream",
        artifactType: inferArtifactType(artifact),
        language: artifact.language || "",
        metadata: artifact.metadata || {},
        conversationId: String(artifact.conversationId || ""),
        createdAt: artifact.createdAt,
        updatedAt: artifact.updatedAt,
        downloadUrl: `/api/agent/artifacts/${artifact._id}/download`,
        previewUrl: `/api/agent/artifacts/${artifact._id}/preview`,
      })),
    });
  } catch (error) {
    console.error("LIST ARTIFACTS ERROR:", error);
    return res.status(500).json({ message: "Unable to load artifacts." });
  }
};

export const previewArtifact = async (req, res) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const artifact = await findOwnedArtifact(req.params.artifactId, userId);
    if (!artifact) {
      return res.status(
        mongoose.isValidObjectId(req.params.artifactId) ? 404 : 400,
      ).json({ message: "Artifact not found." });
    }

    const allowedTypes = new Set([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
      "text/javascript",
      "application/javascript",
      "image/png",
      "image/jpeg",
      "image/webp",
    ]);
    const contentType = String(artifact.contentType || "application/octet-stream")
      .split(";")[0]
      .trim()
      .toLowerCase();

    if (!allowedTypes.has(contentType)) {
      return res.status(415).json({
        message: "Preview is not supported for this artifact type.",
      });
    }

    const filename = safeFilename(artifact.filename);
    res.set({
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Content-Length": artifact.data?.length || 0,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });

    return res.send(artifact.data);
  } catch (error) {
    console.error("PREVIEW ARTIFACT ERROR:", error);
    return res.status(500).json({ message: "Unable to preview this artifact." });
  }
};

export const downloadArtifact = async (req, res) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const artifact = await findOwnedArtifact(req.params.artifactId, userId);
    if (!artifact) {
      return res.status(
        mongoose.isValidObjectId(req.params.artifactId) ? 404 : 400,
      ).json({ message: "Artifact not found." });
    }

    const filename = safeFilename(artifact.filename);
    res.set({
      "Content-Type": artifact.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": artifact.data?.length || 0,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });

    return res.send(artifact.data);
  } catch (error) {
    console.error("DOWNLOAD ARTIFACT ERROR:", error);
    return res.status(500).json({ message: "Unable to download this artifact." });
  }
};
