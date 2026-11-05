
import axios from "axios";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getModel } from "../config/llmModel.js";

// Cloudflare image-generation configuration.
const IMAGE_MODEL =
  process.env.CLOUDFLARE_IMAGE_MODEL ||
  "@cf/black-forest-labs/flux-1-schnell";

const MAX_IMAGE_PROMPT_LENGTH = 2048;
const MAX_GENERATED_IMAGE_SIZE = 14 * 1024 * 1024;

// --------------------------------------------------
// CLOUDFARE IMAGE GENERATION
// --------------------------------------------------

const generateImage = async (state, prompt) => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();

  if (!accountId || !apiToken) {
    throw new Error(
      "Cloudflare credentials are missing. Check CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in Agent Service .env."
    );
  }

  if (!prompt) {
    throw new Error("Please describe the image you want to generate.");
  }

  if (prompt.length > MAX_IMAGE_PROMPT_LENGTH) {
    throw new Error(
      `Image prompt cannot exceed ${MAX_IMAGE_PROMPT_LENGTH} characters.`
    );
  }

  console.log("[VISION] Starting Cloudflare image generation.", {
    model: IMAGE_MODEL,
    promptLength: prompt.length,
  });

  const startedAt = Date.now();

  try {
    const url =
      `https://api.cloudflare.com/client/v4/accounts/` +
      `${accountId}/ai/run/${IMAGE_MODEL}`;

    const response = await axios.post(
      url,
      {
        prompt,
        steps: 4,
      },
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 120000,
        maxContentLength: 20 * 1024 * 1024,
        maxBodyLength: 2 * 1024 * 1024,
      }
    );

    const responseData = response.data;

    if (responseData?.success === false) {
      const providerMessage =
        responseData.errors
          ?.map((item) => item.message)
          .filter(Boolean)
          .join("; ") || "Cloudflare image generation failed.";

      throw new Error(providerMessage);
    }

    // Cloudflare's REST response can expose the generated
    // Base64 image as result or result.image.
    const base64Data =
      typeof responseData === "string"
        ? responseData
        : typeof responseData?.result === "string"
          ? responseData.result
          : responseData?.result?.image ||
            responseData?.image ||
            responseData?.data?.result?.image;

    if (
      typeof base64Data !== "string" ||
      !base64Data.trim() ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(base64Data)
    ) {
      throw new Error(
        "Cloudflare did not return valid Base64 image data."
      );
    }

    // FLUX.1 Schnell's documented image response is JPEG.
    const mimeType = "image/jpeg";
    const extension = "jpg";

    const estimatedSize = Math.floor(
      (base64Data.length * 3) / 4
    );

    if (estimatedSize <= 0 || estimatedSize > MAX_GENERATED_IMAGE_SIZE) {
      throw new Error(
        "Generated image is empty or exceeds the allowed file size."
      );
    }

    const filename = `cortexai-image-${Date.now()}.${extension}`;

    const dataUrl =
      `data:${mimeType};base64,${base64Data}`;

    console.log(
      `[VISION] Image generated successfully in ${
        Date.now() - startedAt
      } ms.`,
      {
        filename,
        mimeType,
        size: estimatedSize,
      }
    );

    return {
      ...state,
      aiResponse:
        "Your image has been generated successfully!",
      images: [
        {
          filename,
          mimeType,
          dataUrl,
        },
      ],
    };
  } catch (error) {
    const status = error.response?.status;

    const providerMessage =
      error.response?.data?.errors
        ?.map((item) => item.message)
        .filter(Boolean)
        .join("; ") ||
      error.response?.data?.message ||
      error.message;

    console.error("[VISION] Cloudflare generation failed:", {
      status,
      message: providerMessage,
    });

    let message = providerMessage;

    if (status === 401 || status === 403) {
      message =
        "Cloudflare authentication failed. Check your API token and Workers AI permissions.";
    } else if (status === 429) {
      message =
        "Cloudflare image-generation rate limit or quota reached. Please try again later.";
    } else if (status >= 500) {
      message =
        "Cloudflare image-generation service is temporarily unavailable.";
    }

    const generationError = new Error(
      `Image generation failed: ${message}`
    );

    if (status) {
      generationError.status = status;
    }

    throw generationError;
  }
};

// --------------------------------------------------
// GEMINI IMAGE ANALYSIS
// --------------------------------------------------

const analyzeImage = async (state, imageData, prompt) => {
  if (imageData.length > 7_000_000) {
    return {
      ...state,
      aiResponse:
        "Image is too large. Please upload an image smaller than 5 MB.",
      images: [],
    };
  }

  const match = imageData.match(
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/
  );

  if (!match) {
    return {
      ...state,
      aiResponse:
        "Please upload a valid PNG, JPEG, or WebP image.",
      images: [],
    };
  }

  const mimeType = match[1];
  const base64Data = match[2];

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
          text:
            prompt ||
            "Describe the main objects and scene in this image.",
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
    `[VISION] Image analysis completed in ${
      Date.now() - startedAt
    } ms.`
  );

  const answer =
    typeof response.content === "string"
      ? response.content.trim()
      : Array.isArray(response.content)
        ? response.content
            .map((part) =>
              typeof part === "string"
                ? part
                : part?.text || ""
            )
            .join("\n")
            .trim()
        : "";

  if (!answer) {
    throw new Error(
      "The vision model returned an empty response."
    );
  }

  return {
    ...state,
    aiResponse: answer,
    images: [],
  };
};

// --------------------------------------------------
// VISION AGENT ROUTER
// --------------------------------------------------

export const visionAgent = async (state) => {
  const imageData = String(state.imageData || "");
  const prompt = String(state.prompt || "").trim();

  console.log("[VISION] Agent entered.", {
    hasImage: Boolean(imageData),
    promptLength: prompt.length,
  });

  try {
    // No uploaded image: generate from the text prompt.
    if (!imageData) {
      if (!prompt) {
        return {
          ...state,
          aiResponse:
            "Describe the image you want me to generate.",
          images: [],
        };
      }

      return await generateImage(state, prompt);
    }

    // Uploaded image: preserve existing Gemini analysis.
    return await analyzeImage(
      state,
      imageData,
      prompt
    );
  } catch (error) {
    console.error("[VISION] Request failed:", error);
    throw error;
  }
};
