import mongoose from "mongoose";

const ragChunkSchema = new mongoose.Schema(
  {
    documentId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    filename: { type: String, required: true },
    chunkIndex: { type: Number, required: true },
    content: { type: String, required: true },
    embedding: { type: [Number], required: true },
  },
  { timestamps: true },
);

ragChunkSchema.index({ userId: 1, documentId: 1 });

export default mongoose.model("RagChunk", ragChunkSchema);
