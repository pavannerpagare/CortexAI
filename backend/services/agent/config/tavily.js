import "dotenv/config";
import { TavilySearch } from "@langchain/tavily";

let searchToolClient;

export const getSearchTool = () => {
  if (!process.env.TAVILY_API_KEY) {
    throw new Error("TAVILY_API_KEY is required to use search.");
  }

  searchToolClient ??= new TavilySearch({
    maxResults: 5,
    topic: "general",
    includeImages: true,
  });
  return searchToolClient;
};

export const searchTool = {
  invoke: (...args) => getSearchTool().invoke(...args),
};
