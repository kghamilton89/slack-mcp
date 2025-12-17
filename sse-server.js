import express from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebClient } from '@slack/web-api';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Slack client
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const SLACK_TEAM_ID = process.env.SLACK_TEAM_ID;

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.get('/sse', async (req, res) => {
  console.log('New SSE connection established');
  
  const transport = new SSEServerTransport('/message', res);
  const server = new Server(
    {
      name: 'slack-mcp-server',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Define tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'slack_list_channels',
        description: 'List public channels in the workspace',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Maximum number of channels', default: 100 }
          }
        }
      },
      {
        name: 'slack_post_message',
        description: 'Post a message to a Slack channel',
        inputSchema: {
          type: 'object',
          properties: {
            channel_id: { type: 'string', description: 'Channel ID' },
            text: { type: 'string', description: 'Message text' }
          },
          required: ['channel_id', 'text']
        }
      },
      {
        name: 'slack_get_channel_history',
        description: 'Get recent messages from a channel',
        inputSchema: {
          type: 'object',
          properties: {
            channel_id: { type: 'string', description: 'Channel ID' },
            limit: { type: 'number', description: 'Number of messages', default: 10 }
          },
          required: ['channel_id']
        }
      }
    ]
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      switch (request.params.name) {
        case 'slack_list_channels': {
          const result = await slack.conversations.list({
            team_id: SLACK_TEAM_ID,
            limit: request.params.arguments?.limit || 100,
            types: 'public_channel'
          });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result.channels, null, 2)
            }]
          };
        }
        
        case 'slack_post_message': {
          const result = await slack.chat.postMessage({
            channel: request.params.arguments.channel_id,
            text: request.params.arguments.text
          });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        }
        
        case 'slack_get_channel_history': {
          const result = await slack.conversations.history({
            channel: request.params.arguments.channel_id,
            limit: request.params.arguments?.limit || 10
          });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result.messages, null, 2)
            }]
          };
        }
        
        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error: ${error.message}`
        }],
        isError: true
      };
    }
  });

  await server.connect(transport);
  console.log('MCP server connected to SSE transport');

  req.on('close', () => {
    console.log('Client disconnected');
  });
});

app.post('/message', express.json(), async (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`SSE MCP Server running on port ${PORT}`);
  console.log(`SSE endpoint available at /sse`);
});