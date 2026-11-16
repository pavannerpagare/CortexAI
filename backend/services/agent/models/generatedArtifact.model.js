
import mongoose from "mongoose";

const generatedArtifactSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    filename: {
      type: String,
      required: true,
    },
    contentType: {
      type: String,
      default: "application/pdf",
    },
    data: {
      type: Buffer,
      required: true,
    },
  },
  { timestamps: true },
);

generatedArtifactSchema.index({
  userId: 1,
  conversationId: 1,
  createdAt: -1,
});

const GeneratedArtifact =
  mongoose.models.GeneratedArtifact ||
  mongoose.model("GeneratedArtifact", generatedArtifactSchema);

export default GeneratedArtifact;
