
import mongoose from "mongoose";

// Artifact metadata schema shared by PDF, PPT, code and image files.
const artifactSchema = new mongoose.Schema(
  {
    artifactId: {
      type: String,
    },
    filename: {
      type: String,
    },
    contentType: {
      type: String,
    },
    type: {
      type: String,
    },
    size: {
      type: Number,
    },
    createdAt: {
      type: Date,
    },
    previewUrl: {
      type: String,
    },
    downloadUrl: {
      type: String,
    },
    url: {
      type: String,
    },
  },
  {
    _id: false,
  }
);

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
    },

    role: {
      type: String,
      enum: ["user", "assistant"],
    },

    content: {
      type: String,
    },

    // Supports both legacy string images and new image metadata objects.
    images: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    sources: {
      type: [
        {
          documentId: String,
          filename: String,
          chunkIndex: Number,
          excerpt: String,
          score: Number,
        },
      ],
      default: [],
    },

    // Supports PDF, PPT, code and generated image artifacts.
    artifacts: {
      type: [artifactSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const Message =
  mongoose.models.Message ||
  mongoose.model("Message", messageSchema);

export default Message;
