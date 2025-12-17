import { spawn } from 'child_process';
import express from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

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
  
  // Run the MCP server directly (not via Docker)
  const serverProcess = spawn('node', [join(__dirname, 'dist', 'index.js')], {
    env: {
      ...process.env,
      SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
      SLACK_TEAM_ID: process.env.SLACK_TEAM_ID
    }
  });

  // Set up SSE transport
  const transport = new SSEServerTransport('/message', res);
  
  // Pipe server output to transport
  serverProcess.stdout.on('data', (data) => {
    const message = data.toString();
    console.log('MCP output:', message);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error('MCP error:', data.toString());
  });

  serverProcess.on('close', (code) => {
    console.log(`MCP process exited with code ${code}`);
  });

  // Handle client disconnect
  req.on('close', () => {
    console.log('Client disconnected, stopping MCP server');
    serverProcess.kill();
  });

  await transport.start();
});

app.post('/message', express.json(), async (req, res) => {
  console.log('Received message:', req.body);
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`SSE MCP Server running on http://localhost:${PORT}`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
});