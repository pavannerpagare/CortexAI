import mongoose from "mongoose";

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
    content: String,
    images: [String],

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
    
    artifacts: {
      type: [
        {
          artifactId: String,
          filename: String,
          contentType: String,
          downloadUrl: String,
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

const Message = mongoose.model("Message", messageSchema);
export default Message;
