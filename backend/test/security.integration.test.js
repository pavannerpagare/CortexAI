import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";

const requireGateway = createRequire(
  new URL("../gateway/package.json", import.meta.url),
);
const requireChat = createRequire(
  new URL("../services/chat/package.json", import.meta.url),
);
const requireAgent = createRequire(
  new URL("../services/agent/package.json", import.meta.url),
);
const express = requireGateway("express");
const cookieParser = requireGateway("cookie-parser");
const mongoose = requireChat("mongoose");
const agentMongoose = requireAgent("mongoose");

const REDIS_URL = "redis://127.0.0.1:6380/15";
const MONGODB_URI = "mongodb://127.0.0.1:27017/cortexai_security_test";
const gatewaySecret = randomBytes(32).toString("hex");
const createdSessionKeys = [];
const createdConversationIds = [];
const createdMemoryKeys = [];
const createdDocumentIds = [];
const createdArtifactIds = [];

let redis;
let gatewayServer;
let chatServer;
let agentServer;
let authServer;
let gatewayUrl;
let chatUrl;
let originalGraphInvoke;
let graph;
let defaultTestGraphInvoke;
let Conversation;
let Message;
let RagDocument;
let RagChunk;
let GeneratedArtifact;
let getAgentMessages;

const startServer = (app) =>
  new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
    server.once("error", reject);
  });

const serverUrl = (server) =>
  `http://127.0.0.1:${server.address().port}`;

const closeServer = async (server) => {
  if (!server) return;
  server.closeAllConnections();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
};

const createSession = async (userId) => {
  const sessionId = randomUUID();
  const key = `session-${sessionId}`;
  createdSessionKeys.push(key);
  await redis.set(key, JSON.stringify({ userId }), "EX", 120);
  return sessionId;
};

const gatewayRequest = (path, sessionId, options = {}) => {
  const headers = new Headers(options.headers);
  if (sessionId) headers.set("cookie", `session=${sessionId}`);
  return fetch(`${gatewayUrl}${path}`, { ...options, headers });
};

const serviceRequest = (server, path, options = {}) => {
  const headers = new Headers(options.headers);
  headers.set("x-gateway-secret", gatewaySecret);
  return fetch(`${serverUrl(server)}${path}`, { ...options, headers });
};

before(async () => {
  const redisTarget = new URL(REDIS_URL);
  const mongoTarget = new URL(MONGODB_URI);
  assert.ok(["127.0.0.1", "localhost"].includes(redisTarget.hostname));
  assert.equal(redisTarget.pathname, "/15");
  assert.ok(["127.0.0.1", "localhost"].includes(mongoTarget.hostname));
  assert.equal(mongoTarget.pathname, "/cortexai_security_test");

  process.env.REDIS_URL = REDIS_URL;
  process.env.MONGODB_URI = MONGODB_URI;
  process.env.GATEWAY_SECRET = gatewaySecret;
  process.env.GROQ_API_KEY = "security-test-placeholder";
  process.env.GOOGLE_API_KEY = "security-test-placeholder";
  process.env.TAVILY_API_KEY = "security-test-placeholder";
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  await agentMongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });

  const [{ default: redisClient }, { default: requireGatewaySecret }] =
    await Promise.all([
      import("../shared/redis/redis.js"),
      import("../shared/middleware/requireGateway.js"),
    ]);
  redis = redisClient;
  assert.equal(await redis.ping(), "PONG");

  const [{ default: chatRouter }, conversationModel, messageModel] =
    await Promise.all([
      import("../services/chat/routes/chat.routes.js"),
      import("../services/chat/models/conversation.model.js"),
      import("../services/chat/models/message.model.js"),
    ]);
  Conversation = conversationModel.default;
  Message = messageModel.default;

  const chatApp = express();
  chatApp.use(requireGatewaySecret);
  chatApp.use(express.json());
  chatApp.use("/", chatRouter);
  chatServer = await startServer(chatApp);
  chatUrl = serverUrl(chatServer);
  process.env.CHAT_SERVICE = chatUrl;

  const { graph: agentGraph } = await import("../services/agent/graph/graph.js");
  const { default: agentRouter } = await import("../services/agent/routes/agent.route.js");
  const { getMessages } = await import("../services/agent/utils/getMessages.js");
  const ragDocumentModel = await import("../services/agent/models/ragDocument.model.js");
  const ragChunkModel = await import("../services/agent/models/ragChunk.model.js");
  const artifactModel = await import("../services/agent/models/generatedArtifact.model.js");
  graph = agentGraph;
  originalGraphInvoke = graph.invoke;
  defaultTestGraphInvoke = async (state) => ({
    ...state,
    aiResponse: "security integration test response",
    agent: "pdf",
    artifacts: [],
  });
  graph.invoke = defaultTestGraphInvoke;
  getAgentMessages = getMessages;
  RagDocument = ragDocumentModel.default;
  RagChunk = ragChunkModel.default;
  GeneratedArtifact = artifactModel.default;

  const agentApp = express();
  agentApp.use(requireGatewaySecret);
  agentApp.use(express.json({ limit: "8mb" }));
  agentApp.use("/", agentRouter);
  agentServer = await startServer(agentApp);

  const { default: authRouter } = await import("../services/routes/auth.route.js");
  const authApp = express();
  authApp.use(cookieParser());
  authApp.use(requireGatewaySecret);
  authApp.use("/", authRouter);
  authServer = await startServer(authApp);

  const [{ default: protect }, { proxyWithHeader }] = await Promise.all([
    import("../gateway/middleware/auth.middleware.js"),
    import("../gateway/utils/proxyWithHeader.js"),
  ]);
  const gatewayApp = express();
  gatewayApp.use(cookieParser());
  gatewayApp.use("/api/auth", proxyWithHeader(serverUrl(authServer)));
  gatewayApp.use(
    "/api/chat",
    protect,
    proxyWithHeader(chatUrl),
  );
  gatewayApp.use(
    "/api/agent",
    protect,
    proxyWithHeader(serverUrl(agentServer)),
  );
  gatewayServer = await startServer(gatewayApp);
  gatewayUrl = serverUrl(gatewayServer);
});

after(async () => {
  await closeServer(gatewayServer);
  await closeServer(authServer);
  await closeServer(agentServer);
  await closeServer(chatServer);

  if (createdConversationIds.length) {
    await Message.deleteMany({
      conversationId: { $in: createdConversationIds },
    });
    await Conversation.deleteMany({
      _id: { $in: createdConversationIds },
    });
  }
  if (createdDocumentIds.length) {
    await RagChunk.deleteMany({ documentId: { $in: createdDocumentIds } });
    await RagDocument.deleteMany({ documentId: { $in: createdDocumentIds } });
  }
  if (createdArtifactIds.length) {
    await GeneratedArtifact.deleteMany({ _id: { $in: createdArtifactIds } });
  }
  if (createdSessionKeys.length) await redis.del(...createdSessionKeys);
  if (createdMemoryKeys.length) await redis.del(...createdMemoryKeys);

  if (originalGraphInvoke) {
    const { graph } = await import("../services/agent/graph/graph.js");
    graph.invoke = originalGraphInvoke;
  }
  if (redis) await redis.quit();
  await agentMongoose.disconnect();
  await mongoose.disconnect();
});

test("missing session is rejected with 401", async () => {
  const response = await gatewayRequest("/api/chat/get-conversations");
  assert.equal(response.status, 401);
});

test("invalid session is rejected with 401", async () => {
  const response = await gatewayRequest(
    "/api/chat/get-conversations",
    randomUUID(),
  );
  assert.equal(response.status, 401);
});

test("downstream chat rejects requests without the gateway secret", async () => {
  const response = await fetch(`${chatUrl}/create-conversation`);
  assert.equal(response.status, 401);
});

test("direct auth service requests without the gateway secret return 401", async () => {
  const response = await fetch(`${serverUrl(authServer)}/logout`, {
    method: "POST",
  });
  assert.equal(response.status, 401);
});

test("direct agent service requests without the gateway secret return 401", async () => {
  const response = await fetch(`${serverUrl(agentServer)}/documents`);
  assert.equal(response.status, 401);
});

test("auth middleware accepts the gateway secret on a valid logout request", async () => {
  const sessionId = await createSession(`auth-secret-${randomUUID()}`);
  const response = await serviceRequest(authServer, "/logout", {
    method: "POST",
    headers: { cookie: `session=${sessionId}` },
  });
  assert.equal(response.status, 200);
  assert.equal(await redis.get(`session-${sessionId}`), null);
});

test("chat middleware accepts the gateway secret on a valid route", async () => {
  const response = await serviceRequest(chatServer, "/create-conversation", {
    headers: { "x-user-id": `chat-secret-${randomUUID()}` },
  });
  assert.equal(response.status, 200);
  const conversation = await response.json();
  createdConversationIds.push(conversation._id);
  assert.ok(conversation._id);
});

test("agent middleware accepts the gateway secret and reaches chat", async () => {
  const userId = `direct-agent-${randomUUID()}`;
  const conversationResponse = await serviceRequest(
    chatServer,
    "/create-conversation",
    { headers: { "x-user-id": userId } },
  );
  assert.equal(conversationResponse.status, 200);
  const conversation = await conversationResponse.json();
  createdConversationIds.push(conversation._id);
  createdMemoryKeys.push(`messages.${conversation._id}`);

  const response = await serviceRequest(agentServer, "/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": userId,
    },
    body: JSON.stringify({
      prompt: "direct service security test",
      conversationId: conversation._id,
      agent: "pdf",
    }),
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.answer, "security integration test response");

  const messages = await getAgentMessages(conversation._id, userId);
  assert.equal(messages.length, 2);
});

test("valid gateway request reaches the chat service", async () => {
  const sessionId = await createSession(`gateway-valid-${randomUUID()}`);
  const response = await gatewayRequest(
    "/api/chat/create-conversation",
    sessionId,
  );
  assert.equal(response.status, 200);
  const conversation = await response.json();
  createdConversationIds.push(conversation._id);
  assert.ok(conversation._id);
});

test("forged x-user-id is replaced by the authenticated session identity", async () => {
  const authenticatedUserId = `trusted-${randomUUID()}`;
  const sessionId = await createSession(authenticatedUserId);
  const response = await gatewayRequest(
    "/api/chat/create-conversation",
    sessionId,
    { headers: { "x-user-id": "forged-user" } },
  );
  assert.equal(response.status, 200);
  const conversation = await response.json();
  createdConversationIds.push(conversation._id);
  assert.equal(conversation.userId, authenticatedUserId);

  const storedConversation = await Conversation.findById(conversation._id);
  assert.equal(storedConversation.userId, authenticatedUserId);
});

test("agent-to-chat requests save and retrieve messages with the gateway secret", async () => {
  const userId = `agent-test-${randomUUID()}`;
  const sessionId = await createSession(userId);
  const conversationResponse = await gatewayRequest(
    "/api/chat/create-conversation",
    sessionId,
  );
  assert.equal(conversationResponse.status, 200);
  const conversation = await conversationResponse.json();
  createdConversationIds.push(conversation._id);
  createdMemoryKeys.push(`messages.${conversation._id}`);

  const agentResponse = await gatewayRequest("/api/agent/chat", sessionId, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": "forged-agent-user",
    },
    body: JSON.stringify({
      prompt: "security integration test prompt",
      conversationId: conversation._id,
      agent: "pdf",
    }),
  });
  assert.equal(agentResponse.status, 200);
  const result = await agentResponse.json();
  assert.equal(result.answer, "security integration test response");

  const messages = await getAgentMessages(conversation._id, userId);
  assert.deepEqual(
    messages.map(({ role }) => role),
    ["user", "assistant"],
  );
  assert.equal(messages[0].content, "security integration test prompt");
  assert.equal(messages[1].content, "security integration test response");
});

test("logout deletes the Redis session and subsequent gateway requests fail", async () => {
  const sessionId = await createSession(`logout-${randomUUID()}`);
  const logoutResponse = await gatewayRequest(
    "/api/auth/logout",
    sessionId,
    { method: "POST" },
  );
  assert.equal(logoutResponse.status, 200);
  assert.equal(await redis.get(`session-${sessionId}`), null);

  const protectedResponse = await gatewayRequest(
    "/api/chat/get-conversations",
    sessionId,
  );
  assert.equal(protectedResponse.status, 401);
});

test("conversation creation, rename, and deletion operate on the owner's data", async () => {
  const userId = `lifecycle-${randomUUID()}`;
  const sessionId = await createSession(userId);
  const createResponse = await gatewayRequest(
    "/api/chat/create-conversation",
    sessionId,
  );
  assert.equal(createResponse.status, 200);
  const conversation = await createResponse.json();
  createdConversationIds.push(conversation._id);
  assert.equal(conversation.userId, userId);

  const renameResponse = await gatewayRequest(
    "/api/chat/update-conversation",
    sessionId,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: conversation._id, title: "Renamed test chat" }),
    },
  );
  assert.equal(renameResponse.status, 200);
  assert.equal((await renameResponse.json()).title, "Renamed test chat");

  await Message.create({
    conversationId: conversation._id,
    role: "user",
    content: "delete cascade fixture",
  });
  const deleteResponse = await gatewayRequest(
    `/api/chat/delete-conversation/${conversation._id}`,
    sessionId,
    { method: "DELETE" },
  );
  assert.equal(deleteResponse.status, 200);
  assert.equal(await Conversation.findById(conversation._id), null);
  assert.equal(await Message.countDocuments({ conversationId: conversation._id }), 0);
});

test("messages persist and history retrieval returns them in order", async () => {
  const sessionId = await createSession(`history-${randomUUID()}`);
  const createResponse = await gatewayRequest(
    "/api/chat/create-conversation",
    sessionId,
  );
  assert.equal(createResponse.status, 200);
  const conversation = await createResponse.json();
  createdConversationIds.push(conversation._id);

  for (const [role, content] of [
    ["user", "first persisted message"],
    ["assistant", "second persisted message"],
  ]) {
    const saveResponse = await gatewayRequest("/api/chat/save-message", sessionId, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: conversation._id, role, content }),
    });
    assert.equal(saveResponse.status, 200);
  }

  const historyResponse = await gatewayRequest(
    `/api/chat/get-messages/${conversation._id}`,
    sessionId,
  );
  assert.equal(historyResponse.status, 200);
  const history = await historyResponse.json();
  assert.deepEqual(history.map(({ content }) => content), [
    "first persisted message",
    "second persisted message",
  ]);
});

test("user A cannot list, rename, delete, or retrieve user B's conversation", async () => {
  const userA = `conversation-a-${randomUUID()}`;
  const userB = `conversation-b-${randomUUID()}`;
  const sessionA = await createSession(userA);
  const conversationB = await Conversation.create({
    userId: userB,
    title: "private conversation fixture",
  });
  createdConversationIds.push(String(conversationB._id));
  await Message.create({
    conversationId: conversationB._id,
    role: "assistant",
    content: "private history fixture",
  });

  const listResponse = await gatewayRequest("/api/chat/get-conversations", sessionA);
  assert.equal(listResponse.status, 200);
  const conversations = await listResponse.json();
  assert.ok(conversations.every(({ userId }) => userId === userA));
  assert.ok(conversations.every(({ _id }) => _id !== String(conversationB._id)));

  const renameResponse = await gatewayRequest("/api/chat/update-conversation", sessionA, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: String(conversationB._id), title: "stolen" }),
  });
  assert.equal(renameResponse.status, 404);

  const deleteResponse = await gatewayRequest(
    `/api/chat/delete-conversation/${conversationB._id}`,
    sessionA,
    { method: "DELETE" },
  );
  assert.equal(deleteResponse.status, 404);
  assert.ok(await Conversation.findById(conversationB._id));

  const initialMessageCount = await Message.countDocuments({
    conversationId: conversationB._id,
  });
  const writeResponse = await gatewayRequest("/api/chat/save-message", sessionA, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      conversationId: String(conversationB._id),
      role: "user",
      content: "unauthorized write fixture",
    }),
  });
  assert.equal(writeResponse.status, 404);

  const historyResponse = await gatewayRequest(
    `/api/chat/get-messages/${conversationB._id}`,
    sessionA,
  );
  assert.equal(historyResponse.status, 404);

  const agentResponse = await gatewayRequest("/api/agent/chat", sessionA, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt: "unauthorized agent fixture",
      conversationId: String(conversationB._id),
      agent: "pdf",
    }),
  });
  assert.equal(agentResponse.status, 404);
  assert.equal(
    await Message.countDocuments({ conversationId: conversationB._id }),
    initialMessageCount,
  );
});

test("user A cannot retrieve user B's documents", async () => {
  const userA = `documents-a-${randomUUID()}`;
  const userB = `documents-b-${randomUUID()}`;
  const documentIdA = randomUUID();
  const documentIdB = randomUUID();
  createdDocumentIds.push(documentIdA, documentIdB);
  await RagDocument.create([
    { documentId: documentIdA, userId: userA, filename: "a.txt", mimeType: "text/plain", size: 1, chunkCount: 1 },
    { documentId: documentIdB, userId: userB, filename: "b.txt", mimeType: "text/plain", size: 1, chunkCount: 1 },
  ]);

  const sessionA = await createSession(userA);
  const response = await gatewayRequest("/api/agent/documents", sessionA);
  assert.equal(response.status, 200);
  const { documents } = await response.json();
  assert.deepEqual(documents.map(({ documentId }) => documentId), [documentIdA]);
});

test("user A cannot delete user B's document", async () => {
  const userA = `delete-document-a-${randomUUID()}`;
  const userB = `delete-document-b-${randomUUID()}`;
  const documentId = randomUUID();
  createdDocumentIds.push(documentId);
  await RagDocument.create({
    documentId,
    userId: userB,
    filename: "owned-by-b.txt",
    mimeType: "text/plain",
    size: 4,
    chunkCount: 1,
  });
  await RagChunk.create({
    documentId,
    userId: userB,
    filename: "owned-by-b.txt",
    chunkIndex: 0,
    content: "test fixture",
    embedding: [0.1],
  });

  const sessionA = await createSession(userA);
  const response = await gatewayRequest(
    `/api/agent/documents/${documentId}`,
    sessionA,
    { method: "DELETE" },
  );
  assert.equal(response.status, 404);
  assert.ok(await RagDocument.findOne({ documentId, userId: userB }));
  assert.ok(await RagChunk.findOne({ documentId, userId: userB }));
});

test("generated artifacts can be downloaded only by their owner", async () => {
  const ownerId = `artifact-owner-${randomUUID()}`;
  const otherUserId = `artifact-other-${randomUUID()}`;
  const conversation = await Conversation.create({ userId: ownerId });
  createdConversationIds.push(String(conversation._id));
  const artifact = await GeneratedArtifact.create({
    userId: ownerId,
    conversationId: conversation._id,
    filename: "private-test.pdf",
    contentType: "application/pdf",
    data: Buffer.from("isolated artifact fixture"),
  });
  createdArtifactIds.push(String(artifact._id));

  const ownerSession = await createSession(ownerId);
  const ownerResponse = await gatewayRequest(
    `/api/agent/artifacts/${artifact._id}/download`,
    ownerSession,
  );
  assert.equal(ownerResponse.status, 200);
  assert.equal(await ownerResponse.text(), "isolated artifact fixture");

  const otherSession = await createSession(otherUserId);
  const otherResponse = await gatewayRequest(
    `/api/agent/artifacts/${artifact._id}/download`,
    otherSession,
  );
  assert.equal(otherResponse.status, 404);
});

test("invalid and malformed request bodies return 400", async () => {
  const sessionId = await createSession(`invalid-body-${randomUUID()}`);
  const invalidFieldsResponse = await gatewayRequest(
    "/api/chat/update-conversation",
    sessionId,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "", title: "" }),
    },
  );
  assert.equal(invalidFieldsResponse.status, 400);

  const malformedJsonResponse = await gatewayRequest(
    "/api/chat/update-conversation",
    sessionId,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ invalid json",
    },
  );
  assert.equal(malformedJsonResponse.status, 400);

  const invalidMessageResponse = await gatewayRequest(
    "/api/chat/save-message",
    sessionId,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: randomUUID(),
        role: "system",
        content: "invalid role",
      }),
    },
  );
  assert.equal(invalidMessageResponse.status, 400);

  const invalidAgentResponse = await gatewayRequest("/api/agent/chat", sessionId, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ conversationId: "not-an-object-id", agent: "pdf" }),
  });
  assert.equal(invalidAgentResponse.status, 400);
});

test("agent graph failures return controlled errors and leave the service responsive", async () => {
  const sessionId = await createSession(`agent-failure-${randomUUID()}`);
  const conversationResponse = await gatewayRequest(
    "/api/chat/create-conversation",
    sessionId,
  );
  assert.equal(conversationResponse.status, 200);
  const conversation = await conversationResponse.json();
  createdConversationIds.push(conversation._id);

  graph.invoke = async () => {
    throw new Error("simulated provider failure");
  };
  try {
    const response = await gatewayRequest("/api/agent/chat", sessionId, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "failure-path test",
        conversationId: conversation._id,
        agent: "pdf",
      }),
    });
    assert.equal(response.status, 500);
    assert.equal(
      (await response.json()).message,
      "Unable to process the agent request.",
    );
  } finally {
    graph.invoke = defaultTestGraphInvoke;
  }

  const healthResponse = await gatewayRequest(
    "/api/chat/get-conversations",
    sessionId,
  );
  assert.equal(healthResponse.status, 200);
});

test("missing Groq credentials return a controlled response without stopping the service", async () => {
  const sessionId = await createSession(`missing-groq-${randomUUID()}`);
  const conversationResponse = await gatewayRequest(
    "/api/chat/create-conversation",
    sessionId,
  );
  assert.equal(conversationResponse.status, 200);
  const conversation = await conversationResponse.json();
  createdConversationIds.push(conversation._id);
  createdMemoryKeys.push(`messages.${conversation._id}`);

  const configuredKey = process.env.GROQ_API_KEY;
  graph.invoke = originalGraphInvoke;
  process.env.GROQ_API_KEY = "";
  try {
    const response = await gatewayRequest("/api/agent/chat", sessionId, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "provider key failure test",
        conversationId: conversation._id,
        agent: "chat",
      }),
    });
    assert.equal(response.status, 500);
    assert.equal(
      (await response.json()).message,
      "Unable to process the agent request.",
    );
  } finally {
    process.env.GROQ_API_KEY = configuredKey;
    graph.invoke = defaultTestGraphInvoke;
  }

  const healthResponse = await gatewayRequest(
    "/api/chat/get-conversations",
    sessionId,
  );
  assert.equal(healthResponse.status, 200);
});

test("agent graph loads without provider keys and missing keys fail in a controlled way", () => {
  const graphUrl = new URL("../services/agent/graph/graph.js", import.meta.url).href;
  const modelUrl = new URL("../services/agent/config/llmModel.js", import.meta.url).href;
  const tavilyUrl = new URL("../services/agent/config/tavily.js", import.meta.url).href;
  const script = `
    await import(${JSON.stringify(graphUrl)});
    const { getModel } = await import(${JSON.stringify(modelUrl)});
    const { getSearchTool } = await import(${JSON.stringify(tavilyUrl)});
    for (const [invoke, key] of [[() => getModel("chat"), "GROQ_API_KEY"], [() => getModel("coding"), "GOOGLE_API_KEY"], [() => getSearchTool(), "TAVILY_API_KEY"]]) {
      try {
        await invoke();
        process.exitCode = 2;
        break;
      } catch (error) {
        if (!error.message.includes(key)) {
          process.exitCode = 3;
          break;
        }
      }
    }
    process.exit(process.exitCode || 0);
  `;
  const env = {
    ...process.env,
    REDIS_URL: REDIS_URL,
    GROQ_API_KEY: "",
    GOOGLE_API_KEY: "",
    TAVILY_API_KEY: "",
  };
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: new URL("..", import.meta.url),
    env,
    encoding: "utf8",
    timeout: 10000,
  });
  assert.equal(result.error, undefined, "agent graph import should not crash or time out");
  assert.equal(result.status, 0, "missing provider keys should produce controlled errors");
});