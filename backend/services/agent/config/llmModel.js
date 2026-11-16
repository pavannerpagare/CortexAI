import "dotenv/config";
import { ChatGroq } from "@langchain/groq";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

let groq;
let groqSearch;
let groqVision;
let gemini;

const requireApiKey = (name) => {
  if (!process.env[name]) {
    throw new Error(`${name} is required to use this agent.`);
  }
};

export const getModel = async (agent) => {
  switch (agent) {
    // General Chat Agent
    case "chat": {
      requireApiKey("GROQ_API_KEY");

      groq ??= new ChatGroq({
        model: "openai/gpt-oss-120b",
        timeout: 30000,
        maxRetries: 1,
      });

      return groq;
    }

    // Search Agent and Router
    // Use Qwen instead of GPT-OSS to avoid unwanted
    // built-in browser-search and code-execution calls.
    case "search":
    case "router": {
      requireApiKey("GROQ_API_KEY");

      groqSearch ??= new ChatGroq({
        model: "qwen/qwen3.8-27b",
        temperature: 0.2,
        maxTokens: 850,
        timeout: 30000,
        maxRetries: 1,
      });

      return groqSearch;
    }

    // Coding Agent
    case "coding": {
      requireApiKey("GOOGLE_API_KEY");

      gemini ??= new ChatGoogleGenerativeAI({
        model: "gemini-3.5-flash-lite",
        maxOutputTokens: 2048,
        maxRetries: 0,
        timeout: 45000,
      });

      return gemini;
    }

    // Vision Agent
    case "vision": {
      requireApiKey("GROQ_API_KEY");

      groqVision ??= new ChatGroq({
        model: "qwen/qwen3.8-27b",
        temperature: 0.2,
        maxTokens: 800,
        timeout: 30000,
        maxRetries: 0,
      });

      return groqVision;
    }

    default:
      return getModel("chat");
  }
};
