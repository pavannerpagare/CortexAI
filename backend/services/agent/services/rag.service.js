import { randomUUID } from "node:crypto";
import path from "node:path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import RagDocument from "../models/ragDocument.model.js";
import RagChunk from "../models/ragChunk.model.js";

const CHUNK_SIZE = 1100;
const CHUNK_OVERLAP = 160;
const MAX_DOCUMENT_CHARS = 250_000;
const MAX_CHUNKS_PER_DOCUMENT = 300;
const EMBEDDING_BATCH_SIZE = 8;
const MAX_SEARCH_CHUNKS = 3000;
const TOP_K = 4;
const MIN_SIMILARITY = 0.25;
const MAX_SCORE_GAP = 0.12;
const EMBEDDING_DIMENSIONS = 768;

function getEmbeddings() {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error(
      "GOOGLE_API_KEY is required for RAG embeddings. Configure it in backend/services/agent/.env.",
    );
  }

  return new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GOOGLE_API_KEY,
    modelName: process.env.GOOGLE_EMBEDDING_MODEL || "gemini-embedding-001",
    outputDimensionality: EMBEDDING_DIMENSIONS,
  });
}

function cleanFilename(name = "document") {
  return (
    path
      .basename(name)
      .replace(/[\r\n\0]/g, "")
      .replace(/[<>:"/\\|?*]/g, "_")
      .slice(0, 180) || "document"
  );
}

async function extractText(file) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (ext === ".txt" || ext === ".md") {
    return file.buffer.toString("utf8");
  }
  if (ext === ".pdf") {
    const result = await pdfParse(file.buffer);
    return result.text || "";
  }
  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value || "";
  }
  throw new Error(
    "Unsupported file type. Upload a PDF, TXT, Markdown (.md), or DOCX file.",
  );
}

function splitIntoChunks(input) {
  const text = input
    .replace(/\0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const chunks = [];
  let start = 0;

  while (start < text.length && chunks.length < MAX_CHUNKS_PER_DOCUMENT) {
    let end = Math.min(start + CHUNK_SIZE, text.length);

    if (end < text.length) {
      const paragraphEnd = text.lastIndexOf("\n\n", end);
      const sentenceEnd = Math.max(
        text.lastIndexOf(". ", end),
        text.lastIndexOf("? ", end),
        text.lastIndexOf("! ", end),
      );

      if (paragraphEnd > start + CHUNK_SIZE * 0.55) {
        end = paragraphEnd;
      } else if (sentenceEnd > start + CHUNK_SIZE * 0.65) {
        end = sentenceEnd + 1;
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }

  return chunks;
}

function cosineSimilarity(a, b) {
  if (
    !Array.isArray(a) ||
    !Array.isArray(b) ||
    a.length !== b.length ||
    a.length === 0
  ) {
    return -1;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (!normA || !normB) return -1;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function ingestDocument({ userId, file }) {
  if (!userId)
    throw new Error(
      "Your authenticated user ID was not forwarded to the Agent service.",
    );
  if (!file?.buffer) throw new Error("Choose a document to upload.");

  const filename = cleanFilename(file.originalname);
  let extractedText = await extractText(file);
  extractedText = extractedText.trim();
  if (!extractedText) {
    throw new Error(
      "No readable text was found. Scanned/image-only PDFs need OCR, which is not enabled yet.",
    );
  }

  const truncated = extractedText.length > MAX_DOCUMENT_CHARS;
  extractedText = extractedText.slice(0, MAX_DOCUMENT_CHARS);
  const chunks = splitIntoChunks(extractedText);
  if (!chunks.length)
    throw new Error(
      "The document did not contain enough readable text to index.",
    );

  const embeddings = getEmbeddings();
  const vectors = [];
  for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
    const batchVectors = await embeddings.embedDocuments(batch);
    vectors.push(...batchVectors);
  }

  const documentId = randomUUID();
  let createdDocument = false;

  try {
    await RagDocument.create({
      documentId,
      userId: String(userId),
      filename,
      mimeType: file.mimetype || "application/octet-stream",
      size: file.size,
      chunkCount: chunks.length,
      truncated,
    });
    createdDocument = true;

    await RagChunk.insertMany(
      chunks.map((content, chunkIndex) => ({
        documentId,
        userId: String(userId),
        filename,
        chunkIndex,
        content,
        embedding: vectors[chunkIndex],
      })),
      { ordered: true },
    );
  } catch (error) {
    await RagChunk.deleteMany({ documentId, userId: String(userId) }).catch(
      () => {},
    );
    if (createdDocument) {
      await RagDocument.deleteOne({ documentId, userId: String(userId) }).catch(
        () => {},
      );
    }
    throw error;
  }

  return {
    document: {
      documentId,
      filename,
      mimeType: file.mimetype,
      size: file.size,
      chunkCount: chunks.length,
      truncated,
    },
  };
}

export async function listUserDocuments(userId) {
  return RagDocument.find({ userId: String(userId) })
    .select("documentId filename mimeType size chunkCount truncated createdAt")
    .sort({ createdAt: -1 })
    .lean();
}

export async function deleteUserDocument({ userId, documentId }) {
  const document = await RagDocument.findOneAndDelete({
    userId: String(userId),
    documentId,
  });
  if (!document) return false;
  await RagChunk.deleteMany({ userId: String(userId), documentId });
  return true;
}

export async function retrieveRelevantChunks({ userId, query }) {
  if (!userId || !String(query || "").trim()) {
    return { context: "", sources: [] };
  }

  const hasChunks = await RagChunk.exists({ userId: String(userId) });
  if (!hasChunks) return { context: "", sources: [] };

  const embeddings = getEmbeddings();
  const queryVector = await embeddings.embedQuery(String(query).slice(0, 3000));
  const candidates = await RagChunk.find({ userId: String(userId) })
    .select("documentId filename chunkIndex content embedding")
    .limit(MAX_SEARCH_CHUNKS)
    .lean();

  const scored = candidates
    .map((chunk) => ({
      ...chunk,
      score: cosineSimilarity(queryVector, chunk.embedding),
    }))
    .filter(
      (chunk) => Number.isFinite(chunk.score) && chunk.score >= MIN_SIMILARITY,
    )
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return { context: "", sources: [] };
  }

  const bestScore = scored[0].score;

  const minimumAcceptedScore = Math.max(
    MIN_SIMILARITY,
    bestScore - MAX_SCORE_GAP,
  );

  const ranked = scored
    .filter((chunk) => chunk.score >= minimumAcceptedScore)
    .slice(0, TOP_K);

  const sources = ranked.map((chunk) => ({
    documentId: chunk.documentId,
    filename: chunk.filename,
    chunkIndex: chunk.chunkIndex + 1,
    excerpt: chunk.content.slice(0, 260),
    score: Number(chunk.score.toFixed(4)),
  }));

  const context = ranked
    .map(
      (chunk) =>
        `[Source: ${chunk.filename}, chunk ${chunk.chunkIndex + 1}]\n${chunk.content}`,
    )
    .join("\n\n---\n\n");

  return { context, sources };
}
