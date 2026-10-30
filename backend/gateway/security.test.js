import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import express from 'express';
import http from 'node:http';
import axios from 'axios';

import redis from '../shared/redis/redis.js';
import protect from './middleware/auth.middleware.js';
import { proxyWithHeader } from './utils/proxyWithHeader.js';
import * as chatController from '../services/chat/controllers/chat.controller.js';
import * as agentController from '../services/agent/controllers/agent.controller.js';
import * as authController from '../services/controllers/auth.controller.js';
import * as ragService from '../services/agent/services/rag.service.js';
import * as memory from '../services/agent/config/memory.js';
import { graph } from '../services/agent/graph/graph.js';

const originalEnv = { ...process.env };
const createRes = () => {
  const res = {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    clearCookie(name, options) {
      this.headers.cookie = `${name}=; Max-Age=0; Path=${options?.path || '/'};`; 
      return this;
    },
  };
  return res;
};

describe('backend gateway security tests', () => {
  beforeEach(() => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.GATEWAY_SECRET = 'test-gateway-secret';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    mock.restoreAll();
  });

  it('1. rejects requests without a session cookie', async () => {
    const req = { cookies: {}, headers: {} };
    const res = createRes();

    await protect(req, res, () => {
      assert.fail('next should not be called when session is missing');
    });

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { message: 'unauthorized' });
  });

  it('2. rejects invalid session ids', async () => {
    const req = { cookies: { session: 'does-not-exist' }, headers: {} };
    const res = createRes();
    mock.method(redis, 'get', async () => null);

    await protect(req, res, () => {
      assert.fail('next should not be called for invalid sessions');
    });

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { message: 'session expired' });
  });

  it('3. strips forged x-user-id headers and keeps the authenticated user', async () => {
    const req = {
      cookies: { session: 'valid-session' },
      headers: { 'x-user-id': 'attacker-user' },
    };
    const res = createRes();
    mock.method(redis, 'get', async () => JSON.stringify({ userId: 'real-user-123' }));

    await protect(req, res, () => {
      assert.equal(req.user.userId, 'real-user-123');
      assert.equal(req.headers['x-user-id'], undefined);
    });

    assert.equal(res.statusCode, 200);
  });

  it('4. gateway injects the authenticated user identity into downstream requests', async () => {
    const target = http.createServer((targetReq, targetRes) => {
      const captured = {
        'x-user-id': targetReq.headers['x-user-id'],
        'x-gateway-secret': targetReq.headers['x-gateway-secret'],
      };
      targetRes.writeHead(200, { 'content-type': 'application/json' });
      targetRes.end(JSON.stringify(captured));
    });

    await new Promise((resolve) => target.listen(0, resolve));
    const port = target.address().port;

    const app = express();
    app.use((req, _res, next) => {
      req.user = { userId: 'gateway-user-456' };
      req.headers['x-user-id'] = 'attacker-user';
      next();
    });
    app.use('/api', proxyWithHeader(`http://127.0.0.1:${port}`));

    const appServer = app.listen(0);
    await new Promise((resolve) => appServer.listen(0, resolve));
    const appPort = appServer.address().port;

    const response = await fetch(`http://127.0.0.1:${appPort}/api/test`, {
      headers: { accept: 'application/json' },
    });
    const data = await response.json();

    assert.equal(data['x-user-id'], 'gateway-user-456');
    assert.equal(data['x-gateway-secret'], 'test-gateway-secret');

    await new Promise((resolve) => appServer.close(resolve));
    await new Promise((resolve) => target.close(resolve));
  });

  it('5. rejects direct downstream requests without the gateway secret', () => {
    const req = { headers: { 'x-user-id': 'user-123' } };
    const auth = chatController.requireGatewayIdentity(req);

    assert.equal(auth.ok, false);
    assert.equal(auth.status, 401);
    assert.equal(auth.message, 'Unauthorized gateway request.');
  });

  it('6. accepts valid gateway-to-service identity headers', () => {
    const auth = chatController.requireGatewayIdentity({
      headers: {
        'x-gateway-secret': 'test-gateway-secret',
        'x-user-id': 'user-123',
      },
    });

    assert.equal(auth.ok, true);
    assert.equal(auth.userId, 'user-123');
  });

  it('7. agent-to-chat internal requests include the trusted user identity and gateway secret', async () => {
    const req = {
      headers: {
        'x-gateway-secret': 'test-gateway-secret',
        'x-user-id': 'user-123',
      },
      body: {
        prompt: 'hello',
        conversationId: 'conv-1',
        agent: 'chat',
      },
    };
    const res = createRes();

    const postCalls = [];
    mock.method(axios, 'post', async (...args) => {
      postCalls.push(args);
      return { data: { ok: true } };
    });
    mock.method(ragService, 'retrieveRelevantChunks', async () => ({
      context: 'retrieved context',
      sources: [{ documentId: 'doc-1', filename: 'notes.txt', chunkIndex: 0, score: 0.99 }],
    }));
    mock.method(memory, 'addMessage', async () => undefined);
    mock.method(graph, 'invoke', async () => ({ aiResponse: 'assistant reply', images: [] }));

    await agentController.agent(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.answer, 'assistant reply');
    assert.equal(postCalls.length, 2);
    assert.deepEqual(postCalls[0][0], `${process.env.CHAT_SERVICE}/save-message`);
    assert.deepEqual(postCalls[0][1], {
      conversationId: 'conv-1',
      role: 'user',
      content: 'hello',
    });
    assert.equal(postCalls[0][2].headers['x-gateway-secret'], 'test-gateway-secret');
    assert.equal(postCalls[0][2].headers['x-user-id'], 'user-123');
  });

  it('8. logout invalidates the active session', async () => {
    const req = {
      cookies: { session: 'logout-session' },
    };
    const res = createRes();
    const delMethod = mock.method(redis, 'del', async () => 1);

    await authController.logOut(req, res);

    assert.equal(delMethod.mock.calls.length, 1);
    assert.equal(delMethod.mock.calls[0].arguments[0], 'session-logout-session');
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { message: 'logout successfully' });
  });
});
