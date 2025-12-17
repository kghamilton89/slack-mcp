# Slack MCP Server for Strawberry Browser 🍓

A Dockerized MCP (Model Context Protocol) server that enables Strawberry Browser to interact with Slack workspaces. Based on the [official Anthropic MCP Slack server](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/slack).

## Features

- 📬 List channels and get channel history
- 💬 Post messages and reply to threads
- 👍 Add emoji reactions
- 👥 Get user information and profiles
- 🔒 Secure token-based authentication

## Prerequisites

- Docker installed on your system
- A Slack workspace where you can create apps
- Strawberry Browser (or any other MCP-compatible client)

## Setup

### 1. Get Your Slack Workspace ID

1. Go to `https://app.slack.com`
2. Open any channel in your workspace
3. Look at the URL in your browser address bar:

    ```bash
    https://app.slack.com/client/T01234ABCD/C98765432
    ```

4. The part starting with **T** (e.g., `T01234ABCD`) is your Workspace ID

### 2. Create a Slack App

1. Visit the [Slack Apps page](https://api.slack.com/apps)
2. Click **"Create New App"**
3. Choose **"From scratch"**
4. Name your app and select your workspace

### 3. Configure Bot Token Scopes

Navigate to **"OAuth & Permissions"** and add these scopes:

- `channels:history` - View messages and other content in public channels
- `channels:read` - View basic channel information
- `channels:join` - Join public channels
- `chat:write` - Send messages as the app
- `reactions:write` - Add emoji reactions to messages
- `reactions:read` - Read emoji reactions to messages
- `users:read` - View users and their basic information
- `users.profile:read` - View detailed profiles about users

### 4. Install App to Workspace

1. Click **"Install to Workspace"** and authorize the app
2. Save the **"Bot User OAuth Token"** (starts with `xoxb-`)

## Usage

### Using Docker Compose

1. Clone this repository
2. Create a `.env` file in the project root (you can use `.env.example` as a template):

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_TEAM_ID=T01234567
```

3. Start the server:

```bash
docker compose up
```

### Using Pre-built Image from Docker Hub

```bash
docker pull kghamilton89/slack-mcp-server:latest
```

## Connecting to Strawberry Browser

Configure Strawberry Browser to connect to this MCP server endpoint. The server communicates via stdin/stdout using the MCP protocol.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SLACK_BOT_TOKEN` | Yes | Your Slack Bot User OAuth Token (starts with `xoxb-`) |
| `SLACK_TEAM_ID` | Yes | Your Slack Workspace/Team ID (starts with `T`) |
| `SLACK_CHANNEL_IDS` | No | Comma-separated list of channel IDs to restrict access (e.g., `C01234567,C76543210`) |

## Available MCP Tools

- `slack_list_channels` - List public or pre-defined channels
- `slack_post_message` - Post a new message to a channel
- `slack_reply_to_thread` - Reply to a specific message thread
- `slack_add_reaction` - Add an emoji reaction to a message
- `slack_get_channel_history` - Get recent messages from a channel
- `slack_get_thread_replies` - Get all replies in a message thread
- `slack_get_users` - Get list of workspace users
- `slack_get_user_profile` - Get detailed profile for a specific user

## Building from Source

```bash
# Clone the repository
git clone https://github.com/kghamilton89/slack-mcp.git
cd slack-mcp

# Build the Docker image
docker build -t slack-mcp-server:latest .

# Run it
docker compose up
```

## Contributing

Issues and pull requests welcome!
