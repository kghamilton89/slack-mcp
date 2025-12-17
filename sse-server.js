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
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, MCP-Session-Id"
  );
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
      {
        name: "slack_find_user",
        description: "Find a Slack user by email or name and return matching user IDs",
        inputSchema: {
          type: "object",
          properties: {
            email: { type: "string", description: "User email address" },
            query: { type: "string", description: "Name or handle fragment" },
            limit: { type: "number", description: "Max results", default: 10 },
          },
        },
      },
      {
        name: "slack_open_dm",
        description:
          "Open or find a direct message (IM) channel with a user and return the DM channel ID",
        inputSchema: {
          type: "object",
          properties: {
            user_id: {
              type: "string",
              description: "Slack user ID (e.g., U012ABCDEF)",
            },
          },
          required: ["user_id"],
        },
      },
      {
        name: "slack_send_dm",
        description: "Send a direct message to a user (by user_id)",
        inputSchema: {
          type: "object",
          properties: {
            user_id: {
              type: "string",
              description: "Slack user ID (e.g., U012ABCDEF)",
            },
            text: { type: "string", description: "Message text" },
          },
          required: ["user_id", "text"],
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
            content: [
              { type: "text", text: JSON.stringify(result.channels, null, 2) },
            ],
          };
        }

        case "slack_post_message": {
          const { channel_id, text } = request.params.arguments || {};
          if (!channel_id || !text) {
            throw new Error("Missing required arguments: channel_id, text");
          }
          const result = await slack.chat.postMessage({
            channel: channel_id,
            text,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "slack_get_channel_history": {
          const { channel_id } = request.params.arguments || {};
          const limit = request.params.arguments?.limit || 10;
          if (!channel_id) {
            throw new Error("Missing required argument: channel_id");
          }
          const result = await slack.conversations.history({
            channel: channel_id,
            limit,
          });
          return {
            content: [
              { type: "text", text: JSON.stringify(result.messages, null, 2) },
            ],
          };
        }

        case "slack_find_user": {
          const { email, query, limit = 10 } = request.params.arguments || {};
          if (!email && !query) {
            throw new Error("Provide either email or query");
          }

          if (email) {
            const r = await slack.users.lookupByEmail({ email });
            return {
              content: [{ type: "text", text: JSON.stringify({ user: r.user }, null, 2) }],
            };
          }

          const list = await slack.users.list({ limit: 200 });
          const q = String(query).toLowerCase();

          const matches = (list.members || [])
            .filter((u) => !u.deleted && !u.is_bot)
            .filter((u) => {
              const fields = [
                u.name,
                u.real_name,
                u.profile?.display_name,
                u.profile?.real_name,
                u.profile?.email,
              ]
                .filter(Boolean)
                .map((s) => String(s).toLowerCase());
              return fields.some((f) => f.includes(q));
            })
            .slice(0, limit);

          return {
            content: [{ type: "text", text: JSON.stringify({ matches }, null, 2) }],
          };
        }

        case "slack_open_dm": {
          const { user_id } = request.params.arguments || {};
          if (!user_id) throw new Error("Missing required argument: user_id");

          const r = await slack.conversations.open({ users: user_id });
          const channelId = r.channel?.id;
          if (!channelId) throw new Error("Failed to open DM channel");

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  { channel_id: channelId, channel: r.channel },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case "slack_send_dm": {
          const { user_id, text } = request.params.arguments || {};
          if (!user_id || !text) {
            throw new Error("Missing required arguments: user_id, text");
          }

          const open = await slack.conversations.open({ users: user_id });
          const channelId = open.channel?.id;
          if (!channelId) throw new Error("Failed to open DM channel");

          const result = await slack.chat.postMessage({
            channel: channelId,
            text,
          });

          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
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
        error: {
          code: -32000,
          message: "Bad Request: No valid session; initialize required",
        },
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
        error: {
          code: -32000,
          message: `Internal Server Error: ${err?.message || err}`,
        },
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
