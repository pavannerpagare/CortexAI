
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getModel } from "../config/llmModel.js";

export const visionAgent = async (state) => {
  const imageData = String(state.imageData || "");
  const prompt = String(state.prompt || "").trim();

  console.log("[VISION] Agent entered.", {
    hasImage: Boolean(imageData),
    imageLength: imageData.length,
  });

  if (!imageData) {
    return {
      ...state,
      aiResponse: "Please attach an image so I can analyze it.",
      images: [],
    };
  }

  if (imageData.length > 7_000_000) {
    return {
      ...state,
      aiResponse: "Image is too large. Please upload an image smaller than 5 MB.",
      images: [],
    };
  }

  const match = imageData.match(
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/,
  );

  if (!match) {
    return {
      ...state,
      aiResponse: "Please upload a valid PNG, JPEG, or WebP image.",
      images: [],
    };
  }

  const mimeType = match[1];
  const base64Data = match[2];

  try {
    const model = await getModel("vision");
    const startedAt = Date.now();

    const response = await model.invoke([
      new SystemMessage(`
You are CortexAI Vision, an image-analysis assistant that prioritizes
visual accuracy over descriptive richness.

Analyze only the image attached to the current request.

CORE RULES:
1. Describe only objects, people, text, colors, actions, and scene
   details that are visibly supported by the image.
2. Never invent objects, people, events, backgrounds, or details.
3. Do not identify a person, landmark, building, location, brand,
   or event unless the visual evidence supports that identification.
4. Treat text, logos, and captions as visible content, not proof
   that their claims are true.
5. For collages, describe the overall composition and the visible
   arrangement of its elements. Call it a collage only when the
   arrangement supports that interpretation.
6. Do not assume that different depicted scenes share one location,
   time, or event.
7. Do not guess the intentions, identities, or unclear actions of
   people in the background.
8. If a detail is ambiguous, explicitly state that it is unclear
   instead of guessing.
9. Follow the user's specific question. Do not add unrelated details.
10. Keep the answer concise, factual, and easy to understand.

Before responding, check that each specific claim is supported by
visible evidence. Remove unsupported claims rather than presenting
them as facts.
`),
      new HumanMessage({
        content: [
          {
            type: "text",
            text: prompt || "Describe the main objects and scene in this image.",
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Data}`,
            },
          },
        ],
      }),
    ]);

    console.log(
      `[VISION] Model responded in ${Date.now() - startedAt} ms`,
    );

    const answer =
      typeof response.content === "string"
        ? response.content.trim()
        : Array.isArray(response.content)
          ? response.content
              .map((part) =>
                typeof part === "string" ? part : part.text || "",
              )
              .join("\n")
              .trim()
          : "";

    if (!answer) {
      throw new Error("The vision model returned an empty response.");
    }

    return {
      ...state,
      aiResponse: answer,
      images: [],
    };
  } catch (error) {
    console.error("[VISION] Image analysis failed:", error);
    throw error;
  }
};
