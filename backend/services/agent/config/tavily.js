import "dotenv/config";
import { TavilySearch } from "@langchain/tavily";

if (!process.env.TAVILY_API_KEY) {
  console.warn(
    "[tavily] TAVILY_API_KEY is not set. The search agent will fail at invocation time. " +
      "Configure it in backend/services/agent/.env",
  );
}

export const searchTool = new TavilySearch({
  maxResults: 5,
  topic: "general",
  includeImages: true,
});
