import { chatAgent } from "./chat.agent.js";

export const pdfAgent = async (state) => {
  const roleHint = "The user is asking about PDF generation. Explain how to generate or work with PDF documents.";
  return chatAgent({ ...state, prompt: `${roleHint}\n\n${state.prompt}` });
};
