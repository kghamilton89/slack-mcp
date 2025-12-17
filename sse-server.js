import express from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebClient } from "@slack/web-api";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";

const app = express();

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";

app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, MCP-Session-Id");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", message: "Slack MCP Server is running" });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    uptime_s: Math.round(process.uptime()),
    hasSlackBotToken: Boolean(process.env.SLACK_BOT_TOKEN),
    hasSlackTeamId: Boolean(process.env.SLACK_TEAM_ID),
  });
});

function getSlackClient() {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("Missing SLACK_BOT_TOKEN env var");
  return new WebClient(token);
}

function getSlackTeamId() {
  const teamId = process.env.SLACK_TEAM_ID;
  if (!teamId) throw new Error("Missing SLACK_TEAM_ID env var");
  return teamId;
}

function createMcpServer() {
  const server = new Server(
    { name: "slack-mcp-server", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "slack_list_channels",
        description: "List public channels in the workspace",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Maximum number of channels",
              default: 100,
            },
          },
        },
      },
      {
        name: "slack_post_message",
        description: "Post a message to a Slack channel",
        inputSchema: {
          type: "object",
          properties: {
            channel_id: { type: "string", description: "Channel ID" },
            text: { type: "string", description: "Message text" },
          },
          required: ["channel_id", "text"],
        },
      },
      {
        name: "slack_get_channel_history",
        description: "Get recent messages from a channel",
        inputSchema: {
          type: "object",
          properties: {
            channel_id: { type: "string", description: "Channel ID" },
            limit: {
              type: "number",
              description: "Number of messages",
              default: 10,
            },
          },
          required: ["channel_id"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const slack = getSlackClient();
      const SLACK_TEAM_ID = getSlackTeamId();

      switch (request.params.name) {
        case "slack_list_channels": {
          const limit = request.params.arguments?.limit || 100;
          const result = await slack.conversations.list({
            team_id: SLACK_TEAM_ID,
            limit,
            types: "public_channel",
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result.channels, null, 2) }],
          };
        }

        case "slack_post_message": {
          const { channel_id, text } = request.params.arguments || {};
          if (!channel_id || !text) throw new Error("Missing required arguments: channel_id, text");
          const result = await slack.chat.postMessage({ channel: channel_id, text });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "slack_get_channel_history": {
          const { channel_id } = request.params.arguments || {};
          const limit = request.params.arguments?.limit || 10;
          if (!channel_id) throw new Error("Missing required argument: channel_id");
          const result = await slack.conversations.history({ channel: channel_id, limit });
          return {
            content: [{ type: "text", text: JSON.stringify(result.messages, null, 2) }],
          };
        }

        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error?.message || error}` }],
        isError: true,
      };
    }
  });

  return server;
}

const transports = new Map();

function getSessionId(req) {
  const raw = req.headers["mcp-session-id"] ?? req.headers["MCP-Session-Id"];
  if (!raw) return undefined;
  return Array.isArray(raw) ? raw[0] : String(raw);
}

async function handleMcp(req, res) {
  const sessionId = getSessionId(req);
  let transport = sessionId ? transports.get(sessionId) : undefined;

  if (!transport) {
    const body = req.body;

    if (!isInitializeRequest(body)) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: No valid session; initialize required" },
        id: body?.id ?? null,
      });
      return;
    }

    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId) => {
        transports.set(newSessionId, transport);
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) transports.delete(transport.sessionId);
    };

    const server = createMcpServer();
    await server.connect(transport);
  }

  if (req.method === "POST") {
    await transport.handleRequest(req, res, req.body);
    return;
  }

  await transport.handleRequest(req, res);
}

app.post("/sse/mcp", (req, res) => {
  handleMcp(req, res).catch((err) => {
    try {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: `Internal Server Error: ${err?.message || err}` },
        id: req.body?.id ?? null,
      });
    } catch (_) {}
  });
});

app.get("/sse/mcp", (req, res) => {
  handleMcp(req, res).catch(() => {
    try {
      res.status(500).end();
    } catch (_) {}
  });
});

app.delete("/sse/mcp", (req, res) => {
  handleMcp(req, res).catch(() => {
    try {
      res.status(500).end();
    } catch (_) {}
  });
});

const httpServer = app.listen(PORT, HOST, () => {
  console.log(`MCP Server running on http://${HOST}:${PORT}`);
  console.log("MCP endpoint available at /sse/mcp");
});

httpServer.keepAliveTimeout = 65_000;
httpServer.headersTimeout = 66_000;
