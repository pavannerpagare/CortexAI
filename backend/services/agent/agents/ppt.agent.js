import pptxgen from "pptxgenjs";
import mongoose from "mongoose";
import { getModel } from "../config/llmModel.js";
import GeneratedArtifact from "../models/generatedArtifact.model.js";

const MAX_PPTX_BYTES = 8 * 1024 * 1024;
const PPTX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const SLIDE_WIDTH = 13.333;

/**
 * Parses a simple Markdown-style presentation outline.
 * The first non-empty line is the presentation title; subsequent
 * level 1-3 headings start new slides.
 */
function parsePresentation(content) {
  const lines = String(content || "")
    .replace(/\r/g, "")
    .replace(/^```(?:markdown|text)?\s*/i, "")
    .replace(/\s*```$/, "")
    .split("\n");

  const firstIndex = lines.findIndex((line) => line.trim());

  if (firstIndex === -1) {
    throw new Error("Presentation content is empty.");
  }

  const title =
    lines[firstIndex]
      .replace(/^#{1,6}\s*/, "")
      .replace(/^title\s*:\s*/i, "")
      .trim()
      .slice(0, 150) || "CortexAI Presentation";

  const sections = [];
  let current = null;

  for (let i = firstIndex + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;

    const heading = line.match(/^#{1,3}\s+(.+)$/);

    if (heading) {
      current = {
        title: heading[1].trim().slice(0, 120),
        items: [],
      };
      sections.push(current);
      continue;
    }

    if (!current) {
      current = { title: "Overview", items: [] };
      sections.push(current);
    }

    const bullet = line.match(/^(?:[-*]|\d+[.)])\s+(.+)$/);
    const text = (bullet ? bullet[1] : line)
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .trim();

    if (text) {
      current.items.push({
        type: bullet ? "bullet" : "paragraph",
        text,
      });
    }
  }

  return {
    title,
    sections: sections.filter((section) => section.items.length > 0),
  };
}

/**
 * Normalizes the outline to exactly the required number of content slides.
 * If there are too many sections, it merges adjacent sections while keeping
 * their headings and content. If there are too few, it splits sections that
 * have multiple items. It never silently drops content or duplicates bullets.
 */
function extractRequestedTopics(prompt) {
  const topics = [];

  for (const rawLine of String(prompt || "").split(/\r?\n/)) {
    const match = rawLine.match(/^\s*(\d{1,2})[.)]\s+(.+?)\s*$/);
    if (!match) continue;

    const number = Number(match[1]);
    if (number !== topics.length + 1) {
      if (topics.length > 0) break;
      continue;
    }

    const topic = match[2]
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .trim()
      .slice(0, 120);

    if (topic) topics.push(topic);
  }

  return topics;
}

/**
 * Treats a numbered outline as a real slide plan. When the user supplies
 * N topics for N total slides, the first topic is placed on the cover slide
 * and the remaining N-1 topics become the content slides. This keeps the
 * requested total count without dropping the first topic.
 */
function createSlidePlan(prompt, requestedSlides) {
  const topics = extractRequestedTopics(prompt);
  const requiredSections = requestedSlides - 1;

  if (!topics.length) {
    return {
      coverTopic: null,
      sectionTitles: null,
      requestedTopics: [],
    };
  }

  if (topics.length === requestedSlides) {
    return {
      coverTopic: topics[0],
      sectionTitles: topics.slice(1),
      requestedTopics: topics,
    };
  }

  if (topics.length === requiredSections) {
    return {
      coverTopic: null,
      sectionTitles: topics,
      requestedTopics: topics,
    };
  }

  if (topics.length > requiredSections) {
    const coverTopic = topics[0];
    const contentTopics = topics.slice(1);
    const groups = [];

    for (let index = 0; index < requiredSections; index += 1) {
      const start = Math.floor((index * contentTopics.length) / requiredSections);
      const end = Math.floor(((index + 1) * contentTopics.length) / requiredSections);
      const group = contentTopics.slice(start, end);
      if (group.length) groups.push(group.join(" + ").slice(0, 120));
    }

    return {
      coverTopic,
      sectionTitles: groups,
      requestedTopics: topics,
    };
  }

  // A shorter outline is treated as required topics; the model fills any
  // remaining content slides with relevant sections rather than duplicating.
  return {
    coverTopic: null,
    sectionTitles: topics,
    requestedTopics: topics,
  };
}

function fitSectionsToSlideCount(sections, requiredSections) {
  if (!Number.isInteger(requiredSections) || requiredSections < 1) {
    throw new Error("The requested presentation slide count is invalid.");
  }

  const result = sections.map((section) => ({
    title: String(section.title || "Untitled section").slice(0, 120),
    items: (Array.isArray(section.items) ? section.items : []).map((item) => ({
      type: item.type === "bullet" ? "bullet" : "paragraph",
      text: String(item.text || "").trim(),
    })).filter((item) => item.text),
  })).filter((section) => section.items.length > 0);

  if (result.length === 0) {
    throw new Error("The presentation content did not contain usable sections.");
  }

  // Preserve all content by merging extra sections into the preceding slide.
  while (result.length > requiredSections) {
    const extra = result.pop();
    const target = result[result.length - 1];

    target.items.push({
      type: "subheading",
      text: extra.title,
    });
    target.items.push(...extra.items);
  }

  // Create additional slides by splitting existing sections, not inventing text.
  while (result.length < requiredSections) {
    let splitIndex = -1;
    let largestItemCount = 1;

    for (let i = 0; i < result.length; i += 1) {
      if (result[i].items.length > largestItemCount) {
        largestItemCount = result[i].items.length;
        splitIndex = i;
      }
    }

    if (splitIndex === -1) {
      throw new Error(
        `The requested presentation needs ${requiredSections + 1} slides, ` +
          "but there is not enough distinct content to create that many slides. " +
          "Please provide more content or request fewer slides."
      );
    }

    const section = result[splitIndex];
    const middle = Math.ceil(section.items.length / 2);

    const firstPart = {
      title: section.title,
      items: section.items.slice(0, middle),
    };

    const secondPart = {
      title: `${section.title} (continued)`.slice(0, 120),
      items: section.items.slice(middle),
    };

    result.splice(splitIndex, 1, firstPart, secondPart);
  }

  return result;
}

const CORTEXAI_TOPIC_LIBRARY = [
  {
    key: "overview",
    match: /overview|objective|introduction|background|about the project/i,
    title: "Project Overview and Objectives",
    items: [
      "CortexAI is an AI-powered assistant built with a microservices architecture.",
      "It combines conversational AI, document retrieval, and task-specific agents.",
      "Its goal is to make information retrieval and common AI-assisted tasks easier.",
      "Users interact with the system through a web-based chat interface.",
    ],
  },
  {
    key: "architecture",
    match: /architecture|system design|components|infrastructure/i,
    title: "System Architecture",
    items: [
      "React and Vite provide the frontend interface.",
      "An Express API Gateway routes requests to backend services.",
      "The Auth service handles authentication and session-related operations.",
      "The Chat service manages conversations and message history.",
      "The Agent service coordinates task-specific workflows using LangGraph.",
      "MongoDB stores application data, while Redis supports session and service operations.",
    ],
  },
  {
    key: "technology",
    match: /technology|tech stack|tools|frameworks|platform stack/i,
    title: "Technology Stack",
    items: [
      "Frontend: React, Vite, and Redux Toolkit.",
      "Backend: Node.js and Express.",
      "Data layer: MongoDB and Mongoose; Redis supports session and service operations.",
      "Authentication: Firebase Authentication and Firebase Admin.",
      "AI integrations: LangGraph, LangChain, Groq, Google Gemini, Google embeddings, and Tavily.",
    ],
  },
  {
    key: "features",
    match: /feature|rag|retrieval|document|knowledge workflow/i,
    title: "Core Features and RAG Workflow",
    items: [
      "Users can create, rename, delete, and revisit conversations.",
      "Users can upload PDF, TXT, Markdown, and DOCX documents.",
      "Uploaded documents are processed into chunks and represented with embeddings.",
      "Retrieval selects relevant document chunks for a user's question.",
      "The assistant can generate answers with document source references.",
      "Generated PDF and PowerPoint files are available through authenticated downloads.",
    ],
  },
  {
    key: "security",
    match: /security|authentication|authorization|privacy|access control/i,
    title: "Authentication and Data Security",
    items: [
      "Firebase Authentication supports user sign-in.",
      "The backend uses authenticated sessions and a Gateway-to-service secret.",
      "Conversation and document operations are scoped to the authenticated user.",
      "Generated artifact downloads are restricted to their owner.",
      "Backend integration tests cover authentication, ownership isolation, and protected routes.",
    ],
  },
  {
    key: "agents",
    match: /agent|generated output|ai capabilities|assistant modes/i,
    title: "AI Agents and Generated Outputs",
    items: [
      "The Chat agent handles general conversational questions.",
      "The Search agent uses Tavily to retrieve external information.",
      "The Coding agent supports code generation and debugging.",
      "The PDF and PPT agents create downloadable documents and presentations.",
      "The Vision workflow analyzes user-provided images and diagrams; its accuracy still needs broader validation.",
      "Agent selection is available through the chat interface.",
    ],
  },
  {
    key: "testing",
    match: /test|validation|limitations?|current status|quality assurance/i,
    title: "Testing, Limitations, and Current Status",
    items: [
      "The backend security integration suite currently passes 22 tests.",
      "Conversation, document, and artifact ownership checks are covered by tests.",
      "Basic chat persistence, RAG retrieval, and PDF generation have been manually tested.",
      "Search source quality, PPT layout accuracy, and Vision diagram interpretation need further improvement.",
      "Production deployment and broader end-to-end testing are still pending.",
    ],
  },
  {
    key: "future",
    match: /conclusion|future|roadmap|next steps|scope|recommendations/i,
    title: "Conclusion and Future Scope",
    items: [
      "CortexAI brings chat, document retrieval, and task-specific AI agents into one workspace.",
      "The core authentication, conversation, document, and artifact workflows have a tested foundation.",
      "Improve search source relevance and RAG citation precision.",
      "Enhance PPT layouts and validate Vision diagram interpretation.",
      "Complete end-to-end testing and prepare the application for deployment.",
    ],
  },
];

function findCortexAITopic(topic) {
  if (!topic) return null;
  return CORTEXAI_TOPIC_LIBRARY.find((entry) => entry.match.test(topic)) || null;
}

function toPresentationSection(topic, entry) {
  return {
    title: topic || entry.title,
    items: entry.items.map((text) => ({ type: "bullet", text })),
  };
}

function buildCortexAIContent(slidePlan, requiredSections) {
  const defaultSections = CORTEXAI_TOPIC_LIBRARY
    .filter((entry) => entry.key !== "overview")
    .map((entry) => toPresentationSection(entry.title, entry));

  if (Array.isArray(slidePlan.sectionTitles) && slidePlan.sectionTitles.length > 0) {
    if (slidePlan.sectionTitles.length !== requiredSections) {
      // Preserve shorter user outlines and let the grounded planner fill the
      // remaining slides instead of silently replacing the user's topics.
      return null;
    }

    const sections = slidePlan.sectionTitles.map((topic) => {
      const entry = findCortexAITopic(topic);
      return entry ? toPresentationSection(topic, entry) : null;
    });

    const coverEntry = slidePlan.coverTopic
      ? findCortexAITopic(slidePlan.coverTopic)
      : null;

    if (sections.every(Boolean) && (!slidePlan.coverTopic || coverEntry)) {
      return {
        title: "CortexAI: AI-Powered Assistant",
        coverSection: coverEntry
          ? toPresentationSection(slidePlan.coverTopic, coverEntry)
          : null,
        sections,
      };
    }

    // Custom/unrecognized CortexAI topics are handled by the grounded model
    // prompt below using the verified project facts as source material.
    return null;
  }

  return {
    title: "CortexAI: AI-Powered Assistant",
    coverSection: slidePlan.coverTopic
      ? (() => {
          const entry = findCortexAITopic(slidePlan.coverTopic);
          return entry ? toPresentationSection(slidePlan.coverTopic, entry) : null;
        })()
      : null,
    sections: fitSectionsToSlideCount(defaultSections, requiredSections),
  };
}

function buildCortexAISourceFacts() {
  return CORTEXAI_TOPIC_LIBRARY.map((entry) =>
    `${entry.title}:\n${entry.items.map((item) => `- ${item}`).join("\n")}`
  ).join("\n\n");
}

function addTitleSlide(pptx, title, coverSection = null) {
  const slide = pptx.addSlide();
  slide.background = { color: "F3F6FC" };

  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: SLIDE_WIDTH,
    h: 0.22,
    line: { color: "4F46E5", transparency: 100 },
    fill: { color: "4F46E5" },
  });

  slide.addShape(pptx.ShapeType.rect, {
    x: 4.9,
    y: 1.55,
    w: 3.53,
    h: 0.08,
    line: { color: "818CF8", transparency: 100 },
    fill: { color: "818CF8" },
  });

  slide.addText(title, {
    x: 0.8,
    y: 2.0,
    w: 11.75,
    h: 1.5,
    fontFace: "Aptos Display",
    fontSize: 32,
    bold: true,
    color: "172554",
    align: "center",
    valign: "mid",
    fit: "shrink",
    margin: 0.1,
  });

  slide.addText("AI-powered assistant and document workspace", {
    x: 1.2,
    y: 3.65,
    w: 10.93,
    h: 0.4,
    fontFace: "Aptos",
    fontSize: 16,
    color: "64748B",
    align: "center",
    margin: 0.03,
  });

  if (coverSection?.items?.length) {
    slide.addText(coverSection.title, {
      x: 1.0,
      y: 4.25,
      w: 11.3,
      h: 0.35,
      fontFace: "Aptos Display",
      fontSize: 15,
      bold: true,
      color: "3730A3",
      align: "center",
      margin: 0.02,
      fit: "shrink",
    });

    const coverItems = coverSection.items.slice(0, 4);
    coverItems.forEach((item, index) => {
      slide.addText(item.text, {
        x: 1.55,
        y: 4.72 + index * 0.43,
        w: 10.25,
        h: 0.34,
        fontFace: "Aptos",
        fontSize: 11,
        color: "475569",
        align: "left",
        valign: "mid",
        fit: "shrink",
        margin: 0.02,
        bullet: { indent: 12 },
        hanging: 3,
      });
    });
  }

  slide.addText("Prepared with CortexAI", {
    x: 1,
    y: 6.75,
    w: 11.3,
    h: 0.3,
    fontFace: "Aptos",
    fontSize: 11,
    color: "94A3B8",
    align: "center",
    margin: 0,
  });
}

function estimateLines(text, charsPerLine) {
  return Math.max(1, Math.ceil(String(text).length / charsPerLine));
}

function addDiagramSlideFrame(pptx, title, slideNumber, totalSlides, eyebrow) {
  const slide = pptx.addSlide();
  slide.background = { color: "F8FAFC" };

  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: SLIDE_WIDTH,
    h: 0.16,
    line: { color: "4F46E5", transparency: 100 },
    fill: { color: "4F46E5" },
  });

  slide.addText(title, {
    x: 0.65,
    y: 0.45,
    w: 11.9,
    h: 0.62,
    fontFace: "Aptos Display",
    fontSize: 25,
    bold: true,
    color: "172554",
    fit: "shrink",
    margin: 0.03,
  });

  slide.addText(eyebrow.toUpperCase(), {
    x: 0.68,
    y: 1.13,
    w: 11.8,
    h: 0.22,
    fontFace: "Aptos",
    fontSize: 8.5,
    bold: true,
    charSpacing: 1.4,
    color: "64748B",
    margin: 0,
  });

  slide.addText(`${slideNumber} / ${totalSlides}`, {
    x: 11.75,
    y: 7.08,
    w: 0.9,
    h: 0.18,
    fontFace: "Aptos",
    fontSize: 9,
    color: "94A3B8",
    align: "right",
    margin: 0,
  });

  return slide;
}

function addDiagramNode(slide, pptx, options) {
  const {
    x, y, w, h, title, subtitle = "", fill = "FFFFFF",
    line = "CBD5E1", titleColor = "1E293B", subtitleColor = "64748B",
    titleSize = 14,
  } = options;

  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h,
    rectRadius: 0.1,
    line: { color: line, width: 1.1 },
    fill: { color: fill },
    shadow: { type: "outer", color: "94A3B8", blur: 1.5, angle: 45, distance: 1, opacity: 0.08 },
  });

  slide.addText(title, {
    x: x + 0.08,
    y: y + (subtitle ? 0.16 : 0.12),
    w: w - 0.16,
    h: subtitle ? 0.3 : h - 0.24,
    fontFace: "Aptos Display",
    fontSize: titleSize,
    bold: true,
    color: titleColor,
    align: "center",
    valign: "mid",
    fit: "shrink",
    margin: 0.02,
  });

  if (subtitle) {
    slide.addText(subtitle, {
      x: x + 0.1,
      y: y + 0.48,
      w: w - 0.2,
      h: Math.max(0.2, h - 0.54),
      fontFace: "Aptos",
      fontSize: 8.5,
      color: subtitleColor,
      align: "center",
      valign: "mid",
      fit: "shrink",
      margin: 0.02,
    });
  }
}

function addDiagramLine(slide, pptx, x, y, w, h, options = {}) {
  slide.addShape(pptx.ShapeType.line, {
    x, y, w, h,
    line: {
      color: options.color || "94A3B8",
      width: options.width || 1.6,
      beginArrowType: "none",
      ...(options.arrow ? { endArrowType: "triangle" } : {}),
    },
  });
}

function addArchitectureDiagram(pptx, section, slideNumber, totalSlides) {
  const slide = addDiagramSlideFrame(
    pptx,
    section.title,
    slideNumber,
    totalSlides,
    "Request flow · services · data layer"
  );

  const labelStyle = {
    fontFace: "Aptos",
    fontSize: 8.5,
    bold: true,
    charSpacing: 1.1,
    color: "64748B",
    margin: 0,
  };

  slide.addText("CLIENT", { x: 0.75, y: 1.62, w: 1.7, h: 0.2, ...labelStyle, align: "center" });
  slide.addText("API LAYER", { x: 2.95, y: 1.62, w: 2.0, h: 0.2, ...labelStyle, align: "center" });
  slide.addText("MICROSERVICES", { x: 5.55, y: 1.62, w: 2.45, h: 0.2, ...labelStyle, align: "center" });
  slide.addText("DATA STORES", { x: 9.0, y: 1.62, w: 2.8, h: 0.2, ...labelStyle, align: "center" });

  // Group containers are drawn before connectors and nodes so that all
  // diagram elements remain editable in PowerPoint.
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 5.55, y: 1.92, w: 2.45, h: 4.55,
    rectRadius: 0.12,
    line: { color: "DBEAFE", width: 1 },
    fill: { color: "EFF6FF" },
  });
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 8.9, y: 2.15, w: 3.65, h: 4.1,
    rectRadius: 0.12,
    line: { color: "D1FAE5", width: 1 },
    fill: { color: "F0FDF4" },
  });

  // React -> API Gateway.
  addDiagramLine(slide, pptx, 2.48, 3.75, 0.42, 0, { arrow: true, color: "6366F1", width: 2 });

  // API Gateway -> Auth / Chat / Agent branch.
  addDiagramLine(slide, pptx, 4.95, 3.75, 0.4, 0, { color: "64748B" });
  addDiagramLine(slide, pptx, 5.35, 2.63, 0, 2.62, { color: "64748B" });
  [2.63, 3.94, 5.25].forEach((centerY) => {
    addDiagramLine(slide, pptx, 5.35, centerY, 0.48, 0, { arrow: true, color: "6366F1" });
  });

  // Services -> shared data layer.
  [2.63, 3.94, 5.25].forEach((centerY) => {
    addDiagramLine(slide, pptx, 7.74, centerY, 0.72, 0, { color: "64748B" });
  });
  addDiagramLine(slide, pptx, 8.46, 2.63, 0, 2.62, { color: "64748B" });
  addDiagramLine(slide, pptx, 8.46, 3.27, 0.67, 0, { arrow: true, color: "059669" });
  addDiagramLine(slide, pptx, 8.46, 4.98, 0.67, 0, { arrow: true, color: "059669" });

  addDiagramNode(slide, pptx, {
    x: 0.68, y: 3.22, w: 1.8, h: 1.06,
    title: "React",
    subtitle: "Web interface",
    fill: "EEF2FF", line: "A5B4FC", titleColor: "3730A3",
  });
  addDiagramNode(slide, pptx, {
    x: 2.9, y: 3.22, w: 2.05, h: 1.06,
    title: "API Gateway",
    subtitle: "Routes client requests",
    fill: "F5F3FF", line: "C4B5FD", titleColor: "5B21B6",
  });
  addDiagramNode(slide, pptx, {
    x: 5.84, y: 2.2, w: 1.9, h: 0.86,
    title: "Auth Service",
    subtitle: "Authentication",
    fill: "FFFFFF", line: "93C5FD", titleColor: "1D4ED8", titleSize: 12,
  });
  addDiagramNode(slide, pptx, {
    x: 5.84, y: 3.51, w: 1.9, h: 0.86,
    title: "Chat Service",
    subtitle: "Conversations & messages",
    fill: "FFFFFF", line: "93C5FD", titleColor: "1D4ED8", titleSize: 12,
  });
  addDiagramNode(slide, pptx, {
    x: 5.84, y: 4.82, w: 1.9, h: 0.86,
    title: "Agent Service",
    subtitle: "LangGraph workflows",
    fill: "FFFFFF", line: "93C5FD", titleColor: "1D4ED8", titleSize: 12,
  });
  addDiagramNode(slide, pptx, {
    x: 9.18, y: 2.78, w: 2.95, h: 0.98,
    title: "MongoDB",
    subtitle: "Users · conversations · documents",
    fill: "FFFFFF", line: "86EFAC", titleColor: "166534", titleSize: 14,
  });
  addDiagramNode(slide, pptx, {
    x: 9.18, y: 4.48, w: 2.95, h: 0.98,
    title: "Redis",
    subtitle: "Cache · session support",
    fill: "FFFFFF", line: "86EFAC", titleColor: "166534", titleSize: 14,
  });

  slide.addText("Requests flow through the gateway to specialist services, which use the data layer.", {
    x: 1.1, y: 6.68, w: 10.9, h: 0.25,
    fontFace: "Aptos", fontSize: 9.5, color: "64748B",
    align: "center", margin: 0,
  });

  return slide;
}

function addRagDiagram(pptx, section, slideNumber, totalSlides) {
  const slide = addDiagramSlideFrame(
    pptx,
    section.title,
    slideNumber,
    totalSlides,
    "Retrieval-augmented generation · document-to-answer pipeline"
  );

  const steps = [
    { title: "Document Upload", subtitle: "PDF · TXT · DOCX", fill: "EEF2FF", border: "A5B4FC", accent: "4F46E5" },
    { title: "Chunking", subtitle: "Split into passages", fill: "F5F3FF", border: "C4B5FD", accent: "7C3AED" },
    { title: "Embeddings", subtitle: "Convert chunks to vectors", fill: "EFF6FF", border: "93C5FD", accent: "2563EB" },
    { title: "Retrieval", subtitle: "Find relevant chunks", fill: "ECFDF5", border: "86EFAC", accent: "059669" },
    { title: "AI Answer", subtitle: "Generate with retrieved context", fill: "FFF7ED", border: "FDBA74", accent: "EA580C" },
  ];

  const startX = 0.58;
  const cardW = 2.1;
  const gap = 0.47;
  const cardY = 2.78;
  const cardH = 1.75;
  const centerY = cardY + cardH / 2;

  // Draw connectors first so they sit behind the process nodes.
  for (let index = 0; index < steps.length - 1; index += 1) {
    const x = startX + index * (cardW + gap) + cardW;
    addDiagramLine(slide, pptx, x + 0.03, centerY, gap - 0.06, 0, {
      arrow: true,
      color: "64748B",
      width: 1.8,
    });
  }

  steps.forEach((step, index) => {
    const x = startX + index * (cardW + gap);

    slide.addShape(pptx.ShapeType.ellipse, {
      x: x + cardW / 2 - 0.22,
      y: 2.42,
      w: 0.44,
      h: 0.44,
      line: { color: step.accent, transparency: 100 },
      fill: { color: step.accent },
    });
    slide.addText(String(index + 1), {
      x: x + cardW / 2 - 0.15,
      y: 2.51,
      w: 0.3,
      h: 0.16,
      fontFace: "Aptos",
      fontSize: 10,
      bold: true,
      color: "FFFFFF",
      align: "center",
      margin: 0,
    });

    addDiagramNode(slide, pptx, {
      x, y: cardY, w: cardW, h: cardH,
      title: step.title,
      subtitle: step.subtitle,
      fill: step.fill,
      line: step.border,
      titleColor: "1E293B",
      subtitleColor: "475569",
      titleSize: 12,
    });
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 1.25, y: 5.25, w: 10.85, h: 0.82,
    rectRadius: 0.1,
    line: { color: "CBD5E1", width: 0.8 },
    fill: { color: "F1F5F9" },
  });
  slide.addText("Relevant retrieved chunks are passed to the model as context for a grounded answer.", {
    x: 1.55, y: 5.48, w: 10.25, h: 0.28,
    fontFace: "Aptos", fontSize: 11, color: "334155",
    bold: true, align: "center", valign: "mid", fit: "shrink", margin: 0.02,
  });

  return slide;
}

function addAgentsDiagram(pptx, section, slideNumber, totalSlides) {
  const slide = addDiagramSlideFrame(
    pptx,
    section.title,
    slideNumber,
    totalSlides,
    "LangGraph routing · six specialist capabilities"
  );

  addDiagramNode(slide, pptx, {
    x: 4.72, y: 1.55, w: 3.9, h: 0.78,
    title: "LangGraph Agent Router",
    subtitle: "Selects a specialist for each request",
    fill: "EEF2FF", line: "A5B4FC", titleColor: "3730A3", titleSize: 14,
  });

  addDiagramLine(slide, pptx, 6.67, 2.33, 0, 0.44, {
    arrow: true,
    color: "6366F1",
    width: 1.9,
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.72, y: 2.88, w: 11.9, h: 3.55,
    rectRadius: 0.14,
    line: { color: "CBD5E1", width: 1 },
    fill: { color: "F8FAFC" },
  });
  slide.addText("SPECIALIST AGENTS", {
    x: 1.02, y: 3.06, w: 3.2, h: 0.2,
    fontFace: "Aptos", fontSize: 8.5, bold: true,
    charSpacing: 1.3, color: "64748B", margin: 0,
  });

  const agents = [
    { name: "Chat", detail: "General conversation and Q&A", code: "01", fill: "EEF2FF", accent: "4F46E5" },
    { name: "Coding", detail: "Code generation and debugging", code: "02", fill: "F5F3FF", accent: "7C3AED" },
    { name: "Search", detail: "External web information and research", code: "03", fill: "EFF6FF", accent: "2563EB" },
    { name: "PDF", detail: "PDF and document workflows", code: "04", fill: "ECFDF5", accent: "059669" },
    { name: "PPT", detail: "PowerPoint slide generation", code: "05", fill: "FFF7ED", accent: "EA580C" },
    { name: "Vision", detail: "User-provided image understanding", code: "06", fill: "FDF2F8", accent: "DB2777" },
  ];

  const cardW = 3.48;
  const cardH = 1.05;
  const colGap = 0.34;
  const rowGap = 0.32;
  const startX = 1.02;
  const startY = 3.52;

  agents.forEach((agent, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = startX + column * (cardW + colGap);
    const y = startY + row * (cardH + rowGap);

    slide.addShape(pptx.ShapeType.roundRect, {
      x, y, w: cardW, h: cardH,
      rectRadius: 0.1,
      line: { color: "D7DEE9", width: 0.8 },
      fill: { color: "FFFFFF" },
    });
    slide.addShape(pptx.ShapeType.ellipse, {
      x: x + 0.18, y: y + 0.26, w: 0.48, h: 0.48,
      line: { color: agent.accent, transparency: 100 },
      fill: { color: agent.fill },
    });
    slide.addText(agent.code, {
      x: x + 0.22, y: y + 0.41, w: 0.4, h: 0.12,
      fontFace: "Aptos", fontSize: 8, bold: true,
      color: agent.accent, align: "center", margin: 0,
    });
    slide.addText(agent.name, {
      x: x + 0.82, y: y + 0.2, w: cardW - 1.0, h: 0.28,
      fontFace: "Aptos Display", fontSize: 14, bold: true,
      color: "1E293B", margin: 0.01,
    });
    slide.addText(agent.detail, {
      x: x + 0.82, y: y + 0.54, w: cardW - 1.0, h: 0.24,
      fontFace: "Aptos", fontSize: 9.5,
      color: "64748B", fit: "shrink", margin: 0.01,
    });
  });

  return slide;
}

function addContentSlide(pptx, section, slideNumber, totalSlides) {
  const normalizedTitle = String(section.title || "").toLowerCase();

  if (/architecture|system design/.test(normalizedTitle)) {
    return addArchitectureDiagram(pptx, section, slideNumber, totalSlides);
  }

  if (/\brag\b|retrieval/.test(normalizedTitle)) {
    return addRagDiagram(pptx, section, slideNumber, totalSlides);
  }

  if (/\b(?:ai\s+)?agents?\b/.test(normalizedTitle)) {
    return addAgentsDiagram(pptx, section, slideNumber, totalSlides);
  }

  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };

  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: SLIDE_WIDTH,
    h: 0.16,
    line: { color: "4F46E5", transparency: 100 },
    fill: { color: "4F46E5" },
  });

  slide.addText(section.title, {
    x: 0.65,
    y: 0.48,
    w: 12,
    h: 0.7,
    fontFace: "Aptos Display",
    fontSize: 25,
    bold: true,
    color: "172554",
    fit: "shrink",
    margin: 0.03,
  });

  slide.addShape(pptx.ShapeType.line, {
    x: 0.68,
    y: 1.3,
    w: 1.15,
    h: 0,
    line: { color: "6366F1", width: 2.5 },
  });

  const items = section.items;
  const useTwoColumns = items.length > 4;
  const columns = useTwoColumns ? 2 : 1;
  const rows = Math.ceil(items.length / columns);
  const startY = 1.62;
  const bottomY = 6.78;
  const rowGap = 0.16;
  const columnGap = 0.22;
  const contentWidth = 11.98;
  const cardWidth = (contentWidth - columnGap * (columns - 1)) / columns;
  const availableHeight = bottomY - startY;
  const cardHeight = Math.min(
    1.18,
    (availableHeight - rowGap * (rows - 1)) / rows
  );

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const column = useTwoColumns ? index % 2 : 0;
    const row = useTwoColumns ? Math.floor(index / 2) : index;
    const x = 0.68 + column * (cardWidth + columnGap);
    const y = startY + row * (cardHeight + rowGap);
    const isSubheading = item.type === "subheading";
    const isBullet = item.type === "bullet";

    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w: cardWidth,
      h: cardHeight,
      rectRadius: 0.08,
      line: { color: "E2E8F0", width: 0.7 },
      fill: { color: isSubheading ? "EEF2FF" : "F8FAFC" },
    });

    slide.addShape(pptx.ShapeType.rect, {
      x,
      y: y + 0.06,
      w: 0.055,
      h: Math.max(0.2, cardHeight - 0.12),
      line: { color: "6366F1", transparency: 100 },
      fill: { color: "6366F1" },
    });

    const textX = x + 0.22;
    const textY = y + 0.08;
    const textW = cardWidth - 0.38;
    const textH = cardHeight - 0.16;
    const charsPerLine = useTwoColumns ? 58 : 112;
    const lineCount = estimateLines(item.text, charsPerLine);
    const baseFontSize = isSubheading ? 14 : useTwoColumns ? 14 : 16;

    slide.addText(item.text, {
      x: textX,
      y: textY,
      w: textW,
      h: textH,
      fontFace: "Aptos",
      fontSize: Math.max(11, baseFontSize - Math.max(0, lineCount - 2)),
      bold: isSubheading,
      color: isSubheading ? "3730A3" : "334155",
      valign: "mid",
      fit: "shrink",
      margin: 0.04,
      ...(isBullet ? { bullet: { indent: 13 }, hanging: 3 } : {}),
    });
  }

  slide.addText(`${slideNumber} / ${totalSlides}`, {
    x: 11.75,
    y: 7.08,
    w: 0.9,
    h: 0.18,
    fontFace: "Aptos",
    fontSize: 9,
    color: "94A3B8",
    align: "right",
    margin: 0,
  });
}

function safeFilename(title) {
  const slug = String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

  return `${slug || "cortexai-presentation"}.pptx`;
}

function extractText(response) {
  if (typeof response?.content === "string") {
    return response.content.trim();
  }

  if (Array.isArray(response?.content)) {
    return response.content
      .map((part) =>
        typeof part === "string" ? part : part?.text || ""
      )
      .join("\n")
      .trim();
  }

  return "";
}

function isRefusal(text) {
  return /^\s*(?:i(?:'m| am)\s+sorry|i\s+(?:cannot|can't)\s+help|unable to assist)/i.test(
    text
  );
}

async function generateGenericContent(
  prompt,
  requestedSlides,
  slidePlan,
  sourceFacts = ""
) {
  const contentSections = requestedSlides - 1;
  const outlineLines = Array.isArray(slidePlan.sectionTitles)
    ? slidePlan.sectionTitles.map((title) => `- ${title}`).join("\n")
    : "No explicit slide headings were supplied; create a logical sequence.";

  const coverInstruction = slidePlan.coverTopic
    ? `Before the content slides, add one heading exactly as:\n## COVER: ${slidePlan.coverTopic}\nAdd 2 to 4 short bullets for this topic. These bullets will appear on the title slide and do not count as separate slides.`
    : "Do not add a cover-topic section; the title slide is a title-only slide.";

  const contentPrompt = `
You are preparing accurate, concise content for a PowerPoint presentation.

User request:
${prompt}

${sourceFacts ? `Use ONLY these verified project facts for claims about CortexAI. Do not add capabilities or results that are not supported here:\n${sourceFacts}\n` : "Use reliable general knowledge, and do not invent specific statistics or citations."}

The presentation must contain exactly ${requestedSlides} slides total:
- One title slide.
- Exactly ${contentSections} content slides, one section per slide.

Requested content-slide outline, in order:
${outlineLines}

${coverInstruction}

Output rules:
- First non-empty line: presentation title.
- Use a Markdown heading (## Heading) for every content slide.
- When outline headings are supplied, use those exact headings in the same order and cover each requested topic.
- If fewer than ${contentSections} headings were supplied, add relevant headings to reach exactly ${contentSections} content slides.
- Include 3 to 5 concise bullet points under each heading.
- Use short, presentation-friendly wording; no long paragraphs.
- Avoid Markdown tables and code fences.
- Do not explain how to create a presentation.
- Do not claim that a file has already been generated.
- Do not invent unsupported facts, statistics, citations, product capabilities, or test results.
- Include a conclusion/future-scope slide when requested.
`;

  const isValidGeneratedOutline = (candidate) => {
    try {
      const parsed = parsePresentation(candidate);
      const expectedCount = contentSections + (slidePlan.coverTopic ? 1 : 0);
      const hasCoverTopic = !slidePlan.coverTopic || parsed.sections.some(
        (section) => section.title.toLowerCase().startsWith("cover:")
      );
      return parsed.sections.length === expectedCount && hasCoverTopic;
    } catch {
      return false;
    }
  };

  let content = "";

  try {
    const startedAt = Date.now();
    const model = await getModel("search");
    const response = await model.invoke(contentPrompt);
    content = extractText(response);

    console.log(
      `[PPT] Primary model completed in ${Date.now() - startedAt} ms`
    );
  } catch (error) {
    console.warn("[PPT] Primary model failed:", error.message);
  }

  if (!content || isRefusal(content) || !isValidGeneratedOutline(content)) {
    console.warn("[PPT] Primary response was unusable; trying Gemini fallback.");

    const startedAt = Date.now();
    const gemini = await getModel("coding");
    const response = await gemini.invoke(contentPrompt);
    content = extractText(response);

    console.log(
      `[PPT] Fallback model completed in ${Date.now() - startedAt} ms`
    );
  }

  if (!content || isRefusal(content) || !isValidGeneratedOutline(content)) {
    throw new Error(
      "The AI model could not generate the requested slide outline. " +
        "Please retry or simplify the requested topics."
    );
  }

  return content;
}

function prepareGeneratedPresentation(content, slidePlan, requiredSections) {
  const parsed = parsePresentation(content);
  let sections = [...parsed.sections];
  let coverSection = null;

  if (slidePlan.coverTopic) {
    const coverIndex = sections.findIndex((section) =>
      section.title.toLowerCase().startsWith("cover:")
    );

    if (coverIndex === -1) {
      throw new Error("The generated presentation is missing its cover-topic content.");
    }

    coverSection = sections.splice(coverIndex, 1)[0];
    coverSection.title = slidePlan.coverTopic;
  }

  if (sections.length !== requiredSections) {
    throw new Error(
      `The content planner returned ${sections.length} content sections; ` +
        `${requiredSections} were required.`
    );
  }

  if (Array.isArray(slidePlan.sectionTitles) &&
      slidePlan.sectionTitles.length === requiredSections) {
    sections = sections.map((section, index) => ({
      ...section,
      title: slidePlan.sectionTitles[index],
    }));
  }

  return {
    title: parsed.title,
    coverSection,
    sections,
  };
}

export const pptAgent = async (state) => {
  const userId = String(state.userId || "");
  const conversationId = String(state.conversationId || "");
  const prompt = String(state.prompt || "").trim();

  if (!userId) {
    throw new Error(
      "Authentication is required to generate a presentation."
    );
  }

  if (!mongoose.isValidObjectId(conversationId)) {
    throw new Error("A valid conversation is required to generate a presentation.");
  }

  if (!prompt) {
    throw new Error("Please describe the presentation you want to create.");
  }

  const countMatch = prompt.match(/\b(\d{1,2})\s*[- ]?\s*slides?\b/i);
  const requestedSlides = countMatch
    ? Math.max(2, Math.min(20, Number(countMatch[1])))
    : 6;

  const requiredSections = requestedSlides - 1;
  const slidePlan = createSlidePlan(prompt, requestedSlides);
  const isCortexAIRequest = /\bcortexai\b/i.test(prompt);

  let title;
  let coverSection = null;
  let sectionsForSlides;

  if (isCortexAIRequest) {
    const curated = buildCortexAIContent(slidePlan, requiredSections);

    if (curated) {
      title = curated.title;
      coverSection = curated.coverSection;
      sectionsForSlides = curated.sections;
      console.log(
        `[PPT] Using verified CortexAI content with ${sectionsForSlides.length} planned content slides.`
      );
    } else {
      console.log("[PPT] Custom CortexAI outline detected; generating from verified project facts.");
      const content = await generateGenericContent(
        prompt,
        requestedSlides,
        slidePlan,
        buildCortexAISourceFacts()
      );
      const prepared = prepareGeneratedPresentation(
        content,
        slidePlan,
        requiredSections
      );
      title = prepared.title;
      coverSection = prepared.coverSection;
      sectionsForSlides = prepared.sections;
    }
  } else {
    const content = await generateGenericContent(
      prompt,
      requestedSlides,
      slidePlan
    );
    const prepared = prepareGeneratedPresentation(
      content,
      slidePlan,
      requiredSections
    );
    title = prepared.title;
    coverSection = prepared.coverSection;
    sectionsForSlides = prepared.sections;
  }

  if (sectionsForSlides.length !== requiredSections) {
    throw new Error(
      `Slide planner returned ${sectionsForSlides.length} content slides; ` +
        `${requiredSections} are required.`
    );
  }

  console.log(
    `[PPT] Final slide plan: 1 cover + ${sectionsForSlides.length} content slides.`
  );

  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "CortexAI";
  pptx.subject = prompt.slice(0, 250);
  pptx.title = title;
  pptx.company = "CortexAI";
  pptx.lang = "en-US";
  pptx.theme = {
    headFontFace: "Aptos Display",
    bodyFontFace: "Aptos",
    lang: "en-US",
  };

  addTitleSlide(pptx, title, coverSection);

  for (let i = 0; i < sectionsForSlides.length; i += 1) {
    addContentSlide(
      pptx,
      sectionsForSlides[i],
      i + 2,
      requestedSlides
    );
  }

  if (pptx._slides.length !== requestedSlides) {
    throw new Error(
      `PowerPoint slide count mismatch: expected ${requestedSlides}, ` +
        `created ${pptx._slides.length}.`
    );
  }

  const pptBuffer = await pptx.write({ outputType: "nodebuffer" });

  if (!Buffer.isBuffer(pptBuffer) || pptBuffer.length === 0) {
    throw new Error("PowerPoint generation returned an invalid file.");
  }

  if (pptBuffer.length > MAX_PPTX_BYTES) {
    throw new Error("The generated presentation exceeds the 8 MB limit.");
  }

  const filename = safeFilename(title);

  const artifact = await GeneratedArtifact.create({
    userId,
    conversationId,
    filename,
    contentType: PPTX_CONTENT_TYPE,
    data: pptBuffer,
  });

  return {
    ...state,
    aiResponse: `Your PowerPoint presentation "${filename}" has been generated with exactly ${requestedSlides} slides. Use the download option to retrieve the file.`,
    artifacts: [
      {
        artifactId: String(artifact._id),
        filename,
        contentType: PPTX_CONTENT_TYPE,
        downloadUrl: `/api/agent/artifacts/${artifact._id}/download`,
      },
    ],
  };
};
