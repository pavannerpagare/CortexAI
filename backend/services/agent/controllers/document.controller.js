import {
  deleteUserDocument,
  ingestDocument,
  listUserDocuments,
} from "../services/rag.service.js";

function getUserId(req) {
  return req.headers["x-user-id"] ? String(req.headers["x-user-id"]) : "";
}

export async function uploadRagDocument(req, res) {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Not authenticated. Please sign in again." });
  if (!req.file) return res.status(400).json({ message: "Select a file to upload." });

  try {
    const result = await ingestDocument({ userId, file: req.file });
    return res.status(201).json({
      message: result.document.truncated
        ? "Document indexed, but its text was capped at 250,000 characters."
        : "Document indexed successfully. You can now ask questions about it.",
      ...result,
    });
  } catch (error) {
    console.error("[RAG] upload failed:", error.message);
    return res.status(400).json({ message: error.message || "Unable to index this document." });
  }
}

export async function getRagDocuments(req, res) {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Not authenticated." });
  try {
    const documents = await listUserDocuments(userId);
    return res.status(200).json({ documents });
  } catch (error) {
    console.error("[RAG] list failed:", error.message);
    return res.status(500).json({ message: "Unable to load your documents." });
  }
}

export async function removeRagDocument(req, res) {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: "Not authenticated." });
  try {
    const deleted = await deleteUserDocument({
      userId,
      documentId: req.params.documentId,
    });
    if (!deleted) return res.status(404).json({ message: "Document not found." });
    return res.status(200).json({ message: "Document and its indexed chunks were deleted." });
  } catch (error) {
    console.error("[RAG] delete failed:", error.message);
    return res.status(500).json({ message: "Unable to delete this document." });
  }
}
