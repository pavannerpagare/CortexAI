import mongoose from "mongoose";

const ragDocumentSchema = new mongoose.Schema(
  {
    documentId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    chunkCount: { type: Number, required: true },
    truncated: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default mongoose.model("RagDocument", ragDocumentSchema);
