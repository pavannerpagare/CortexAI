
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getModel } from "../config/llmModel.js";
import GeneratedArtifact from "../models/generatedArtifact.model.js";

const MAX_PROMPT_CHARS = 30000;

const LANGUAGE_EXTENSIONS = {
  javascript: "js",
  js: "js",
  jsx: "jsx",
  typescript: "ts",
  ts: "ts",
  tsx: "tsx",
  python: "py",
  py: "py",
  cpp: "cpp",
  "c++": "cpp",
  c: "c",
  java: "java",
  csharp: "cs",
  "c#": "cs",
  html: "html",
  css: "css",
  sql: "sql",
  json: "json",
  bash: "sh",
  shell: "sh",
  sh: "sh",
  markdown: "md",
  md: "md",
};

const safeCodeFilename = (value) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 90);

async function saveCodeArtifacts({ content, userId, conversationId }) {
  if (!userId || !conversationId) return [];

  const blocks = [];
  const codeBlockRegex = /```([^\r\n`]*)\r?\n([\s\S]*?)```/g;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null && blocks.length < 8) {
    const info = String(match[1] || "").trim();
    const language = (info.split(/\s+/)[0] || "text").toLowerCase();
    const filenameMatch = info.match(/(?:filename|file)=?["']?([^\s"']+)/i);
    const code = String(match[2] || "").replace(/\s+$/, "");

    if (!code.trim() || Buffer.byteLength(code, "utf8") > 500_000) continue;

    const extension = LANGUAGE_EXTENSIONS[language] || "txt";
    const requestedName = safeCodeFilename(filenameMatch?.[1]);
    const filename = requestedName
      ? (requestedName.includes(".") ? requestedName : `${requestedName}.${extension}`)
      : `generated-code-${blocks.length + 1}.${extension}`;

    blocks.push({ language, filename, code });
  }

  const artifacts = [];
  for (const block of blocks) {
    const artifact = await GeneratedArtifact.create({
      userId,
      conversationId,
      filename: block.filename,
      contentType: "text/plain; charset=utf-8",
      artifactType: "code",
      language: block.language,
      data: Buffer.from(block.code, "utf8"),
    });

    artifacts.push({
      artifactId: String(artifact._id),
      filename: artifact.filename,
      contentType: artifact.contentType,
      artifactType: "code",
      language: artifact.language,
      downloadUrl: `/api/agent/artifacts/${artifact._id}/download`,
      previewUrl: `/api/agent/artifacts/${artifact._id}/preview`,
    });
  }

  return artifacts;
}

const SYSTEM_PROMPT = `
You are CortexAI Coding Agent, an expert software developer and programming assistant.

YOUR RESPONSIBILITIES:
- Generate clean, correct, readable and runnable code.
- Debug existing code and explain the corrections.
- Help users build frontend applications and software projects.
- Explain algorithms, data structures and programming concepts.
- Provide appropriate time and space complexity analysis.

CODING RULES:
1. Understand the user's actual requirements before generating code.
2. Follow the programming language requested by the user.
3. Never replace the requested language with another language.
4. Use meaningful variable and function names.
5. Handle important edge cases and invalid inputs.
6. Avoid unnecessary dependencies.
7. Include comments where they improve understanding.
8. Do not invent APIs, library methods or package names.
9. Do not claim that code was executed or tested unless it actually was.
10. If requirements are incomplete, state reasonable assumptions.

WEB DEVELOPMENT:
When generating HTML, CSS and JavaScript:
- Provide separate, clearly labelled files.
- Use HTML for structure.
- Use CSS for styling.
- Use JavaScript for functionality.
- Make the interface responsive.
- Include all necessary code to make the example usable.
- Explain how to run the project.

RESPONSE FORMAT:
For code-generation requests:
1. Briefly explain the solution.
2. Identify the filenames.
3. Provide complete code in correctly labelled Markdown code blocks.
4. Explain how to run the code.
5. Include important edge cases where appropriate.
6. Include time and space complexity for algorithm problems.

For debugging requests:
1. Identify the problem.
2. Explain why it occurs.
3. Provide corrected code.
4. Explain the changes.

IMPORTANT:
- Never return empty code blocks.
- Never truncate code intentionally.
- Do not return fake source citations.
- Do not add irrelevant RAG document citations.
- Do not return JSON pretending that the frontend supports code previews.
- Return readable Markdown.
`;

function extractResponseText(content) {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  return "";
}

export const codingAgent = async (state = {}) => {
  const prompt =
    typeof state.prompt === "string" ? state.prompt.trim() : "";

  if (!prompt) {
    throw new Error("Please provide a coding request.");
  }

  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new Error(
      `Coding request is too large. Please keep it below ${MAX_PROMPT_CHARS} characters.`,
    );
  }

  try {
    // Use the configured Gemini coding model.
    const model = await getModel("coding");

    const messages = [
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(prompt),
    ];

    const response = await model.invoke(messages);

    const aiResponse = extractResponseText(response?.content);

    if (!aiResponse) {
      throw new Error("The coding model returned an empty response.");
    }

    const codeArtifacts = await saveCodeArtifacts({
      content: aiResponse,
      userId: state.userId,
      conversationId: state.conversationId,
    });

    return {
      ...state,
      aiResponse,
      images: [],
      artifacts: [
        ...(Array.isArray(state.artifacts) ? state.artifacts : []),
        ...codeArtifacts,
      ],
      ragSources: [],
    };
  } catch (error) {
    console.error(
      `[Coding Agent] Generation failed: ${error?.message || "Unknown error"}`,
    );

    throw new Error(
      "Coding Agent could not generate a response. Check Google API credentials, model availability and API quota.",
      { cause: error },
    );
  }
};
