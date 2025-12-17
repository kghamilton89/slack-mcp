import { spawn } from 'child_process';
import express from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 3000;

// Store active sessions
const sessions = new Map();

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

// SSE endpoint
app.get('/sse', async (req, res) => {
  const sessionId = crypto.randomUUID();
  console.log(`New SSE connection: ${sessionId}`);
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Start the Docker container
  const dockerProcess = spawn('docker', [
    'run',
    '-i',
    '--rm',
    '-e', `SLACK_BOT_TOKEN=${process.env.SLACK_BOT_TOKEN}`,
    '-e', `SLACK_TEAM_ID=${process.env.SLACK_TEAM_ID}`,
    'slack-mcp-server:latest'
  ]);

  // Store session
  sessions.set(sessionId, { dockerProcess, res });

  // Set up SSE transport
  const transport = new SSEServerTransport(`/message?sessionId=${sessionId}`, res);
  
  // Pipe Docker container output
  dockerProcess.stdout.on('data', (data) => {
    const message = data.toString();
    console.log(`[${sessionId}] Docker output:`, message);
  });

  dockerProcess.stderr.on('data', (data) => {
    console.error(`[${sessionId}] Docker error:`, data.toString());
  });

  dockerProcess.on('close', (code) => {
    console.log(`[${sessionId}] Docker process exited with code ${code}`);
    sessions.delete(sessionId);
  });

  // Handle client disconnect
  req.on('close', () => {
    console.log(`[${sessionId}] Client disconnected, stopping Docker container`);
    dockerProcess.kill();
    sessions.delete(sessionId);
  });

  await transport.start();
});

// Message endpoint
app.post('/message', express.json(), async (req, res) => {
  const sessionId = req.query.sessionId;
  console.log(`[${sessionId}] Received message:`, req.body);
  
  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Forward message to Docker container stdin
  if (session.dockerProcess && session.dockerProcess.stdin) {
    session.dockerProcess.stdin.write(JSON.stringify(req.body) + '\n');
  }

  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`SSE MCP Server running on http://localhost:${PORT}`);
  console.log(`Connect Strawberry to: http://localhost:${PORT}/sse`);
});