# Slack MCP Server

An HTTP-based **Model Context Protocol (MCP)** server that allows MCP-compatible clients (including **Claude Connectors** and **Strawberry Browser**) to interact with a Slack workspace.

This server exposes Slack functionality (channels, messages, users, and direct messages) over the MCP protocol using a **single HTTP endpoint** and is designed to be deployed on **Railway**.

It is inspired by the original Anthropic MCP Slack example, but adapted for **remote HTTP/SSE usage** rather than local stdin/stdout.

---

## Features

- List public Slack channels
- Post messages to channels
- Read channel message history
- Find Slack users by email or name
- Send direct messages (DMs) to users
- MCP-compatible over HTTP (Claude & Strawberry compatible)
- Production-ready for Railway deployments

---

## Requirements

- A GitHub account
- A Slack workspace where you can create apps
- A Railway account

---

## Slack App Setup

### 1. Create a Slack App

1. Go to `https://api.slack.com/apps`
2. Click **Create New App**
3. Choose **From scratch**
4. Select your Slack workspace

### 2. Configure Bot Token Scopes

Navigate to **OAuth & Permissions** and add the following **Bot Token Scopes**:

- `chat:write`
- `channels:read`
- `channels:history`
- `users:read`
- `users:read.email`
- `im:write`
- `conversations:read`
- `conversations:write`

These scopes are required for posting messages, reading channels, finding users, and sending direct messages.

### 3. Install the App to Your Workspace

1. Click **Install to Workspace**
2. Authorize the app
3. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

### 4. Get Your Slack Workspace (Team) ID

1. Open Slack in a browser
2. Open any channel
3. From the URL `https://app.slack.com/client/T01234ABCD/C98765432`, the value starting with `T` is your Workspace / Team ID

---

## Deployment on Railway

### 1. Fork the Repository

1. Fork this repository into your own GitHub account

### 2. Deploy to Railway

1. Go to `https://railway.app` (sign up if needed)
2. Click **New Project**
3. Choose **Deploy from GitHub Repo**
4. Select your forked repository
5. Railway will automatically detect the Node.js app and deploy it

### 3. Configure Environment Variables

In Railway, open your service and add the following Variables:

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token-here  
SLACK_TEAM_ID=T01234567
```

| Variable | Required | Description |
|----------|----------|-------------|
| `SLACK_BOT_TOKEN` | Yes | Slack Bot User OAuth Token |
| `SLACK_TEAM_ID` | Yes | Slack Workspace / Team ID |
| `PORT` | No | Automatically set by Railway |

After saving the variables, Railway will automatically redeploy the service.

### 4. Verify the Deployment

Once deployed, your service will be available at a Railway-generated URL. You can verify the service is running with the `/health` endpoint.

---

## MCP Endpoint

The MCP server is exposed at the following path: `/sse/mcp`

Your full MCP endpoint will look like: `https://your-service-name.up.railway.app/sse/mcp`

This endpoint handles:

- MCP initialization
- Tool calls
- Streaming responses
- Session management

---

## Connecting to Claude

1. Open Claude > Settings > Connectors
2. Click **Add Connector**
3. Choose **MCP Server**
4. Enter your MCP endpoint URL:`https://your-service-name.up.railway.app/sse/mcp`
5. Save and connect

Once connected, Claude can call Slack tools directly in chat.

---

## Connecting to Strawberry Browser

1. Open Strawberry > Profile Picture Menu > Settings > Integrations > Custom MCP
2. Configure Strawberry Browser to use the MCP endpoint: `https://your-service-name.up.railway.app/sse/mcp`

---

## Available MCP Tools

### Channel & Message Tools

- `slack_list_channels` – List public Slack channels
- `slack_post_message` – Post a message to a channel
- `slack_get_channel_history` – Get recent messages from a channel

### User & Direct Message Tools

- `slack_find_user` – Find users by email or name
- `slack_open_dm` – Open a DM channel with a user
- `slack_send_dm` – Send a direct message to a user

---

## Contributing

Issues and pull requests are welcome.

## Notes

I'm just a guy on the internet and you're deploying powerful code with serious implications for the privacy of your own and others' data. Please make sure that you understand this process, including its risks, completely and protect your Railway URL from exposure as this will give anyone the ability to directly access your Slack Workspace.
