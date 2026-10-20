import { chatAgent } from "./chat.agent.js";

export const pptAgent = async (state) => {
  const roleHint = "The user is asking about presentation (PPT) generation. Explain how to generate or build presentations.";
  return chatAgent({ ...state, prompt: `${roleHint}\n\n${state.prompt}` });
};
