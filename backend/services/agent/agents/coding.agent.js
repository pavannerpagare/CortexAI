import { chatAgent } from "./chat.agent.js";

export const codingAgent = async (state) => {
  const roleHint = "The user wants help with code. Answer with clean, runnable, well-explained code and Markdown.";
  return chatAgent({ ...state, prompt: `${roleHint}\n\n${state.prompt}` });
};
