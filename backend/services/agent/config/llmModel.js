import "dotenv/config";
import { ChatGroq } from "@langchain/groq";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

if (!process.env.GROQ_API_KEY) {
  console.warn(
    "[llm] GROQ_API_KEY is not set. Chat/search/router agents will fail at invocation time. " +
      "Configure it in backend/services/agent/.env",
  );
}

if (!process.env.GOOGLE_API_KEY) {
  console.warn(
    "[llm] GOOGLE_API_KEY is not set. The coding agent (Gemini) will fail at invocation time. " +
      "Configure it in backend/services/agent/.env",
  );
}

const groq = new ChatGroq({
  model: "openai/gpt-oss-120b",
});

const gemini = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
});

export const getModel = async (agent) => {
  switch (agent) {
    case "chat":
      return groq;
    case "search":
      return groq;
    case "coding":
      return gemini;

    default:
      return groq;
  }
};
