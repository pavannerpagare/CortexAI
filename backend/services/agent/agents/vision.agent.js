import { chatAgent } from "./chat.agent.js";

export const visionAgent = async (state) => {
  const roleHint = "The user is asking about image generation. Explain how to generate images and describe available options.";
  return chatAgent({ ...state, prompt: `${roleHint}\n\n${state.prompt}` });
};
