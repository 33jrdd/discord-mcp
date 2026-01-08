#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { config } from "dotenv";
import { discordClient } from "./discord-client.js";
import { z } from "zod";

config();

const server = new Server(
    {
        name: "discord-mcp",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// Tool schemas
const ListGuildsSchema = z.object({});

const ListChannelsSchema = z.object({
    guildId: z.string().describe("The ID of the Discord server/guild"),
});

const ReadMessagesSchema = z.object({
    channelId: z.string().describe("The ID of the channel to read messages from"),
    limit: z.number().min(1).max(100).default(50).describe("Number of messages to fetch (1-100)"),
});

const SearchMessagesSchema = z.object({
    channelId: z.string().describe("The ID of the channel to search"),
    query: z.string().optional().describe("Text to search for in messages"),
    authorId: z.string().optional().describe("Filter by author ID"),
    before: z.string().optional().describe("Get messages before this message ID"),
    after: z.string().optional().describe("Get messages after this message ID"),
    limit: z.number().min(1).max(100).default(50).describe("Number of messages to fetch (1-100)"),
});

const GenerateReportSchema = z.object({
    channelId: z.string().describe("The ID of the channel to analyze"),
    topic: z.string().describe("The topic or question to analyze from the messages"),
    limit: z.number().min(1).max(100).default(50).describe("Number of messages to analyze (1-100)"),
});

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "list_guilds",
                description: "List all Discord servers/guilds the user is a member of",
                inputSchema: {
                    type: "object",
                    properties: {},
                    required: [],
                },
            },
            {
                name: "list_channels",
                description: "List all text channels in a Discord server/guild",
                inputSchema: {
                    type: "object",
                    properties: {
                        guildId: {
                            type: "string",
                            description: "The ID of the Discord server/guild",
                        },
                    },
                    required: ["guildId"],
                },
            },
            {
                name: "read_messages",
                description: "Read recent messages from a Discord channel",
                inputSchema: {
                    type: "object",
                    properties: {
                        channelId: {
                            type: "string",
                            description: "The ID of the channel to read messages from",
                        },
                        limit: {
                            type: "number",
                            description: "Number of messages to fetch (1-100, default 50)",
                            minimum: 1,
                            maximum: 100,
                            default: 50,
                        },
                    },
                    required: ["channelId"],
                },
            },
            {
                name: "search_messages",
                description: "Search messages in a Discord channel with filters",
                inputSchema: {
                    type: "object",
                    properties: {
                        channelId: {
                            type: "string",
                            description: "The ID of the channel to search",
                        },
                        query: {
                            type: "string",
                            description: "Text to search for in messages",
                        },
                        authorId: {
                            type: "string",
                            description: "Filter by author ID",
                        },
                        before: {
                            type: "string",
                            description: "Get messages before this message ID",
                        },
                        after: {
                            type: "string",
                            description: "Get messages after this message ID",
                        },
                        limit: {
                            type: "number",
                            description: "Number of messages to fetch (1-100, default 50)",
                            minimum: 1,
                            maximum: 100,
                            default: 50,
                        },
                    },
                    required: ["channelId"],
                },
            },
            {
                name: "generate_report",
                description: "Generate a markdown report analyzing messages from a channel about a specific topic",
                inputSchema: {
                    type: "object",
                    properties: {
                        channelId: {
                            type: "string",
                            description: "The ID of the channel to analyze",
                        },
                        topic: {
                            type: "string",
                            description: "The topic or question to analyze from the messages",
                        },
                        limit: {
                            type: "number",
                            description: "Number of messages to analyze (1-100, default 50)",
                            minimum: 1,
                            maximum: 100,
                            default: 50,
                        },
                    },
                    required: ["channelId", "topic"],
                },
            },
        ],
    };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        switch (name) {
            case "list_guilds": {
                const guilds = await discordClient.listGuilds();
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(guilds, null, 2),
                        },
                    ],
                };
            }

            case "list_channels": {
                const parsed = ListChannelsSchema.parse(args);
                const channels = await discordClient.listChannels(parsed.guildId);
                const guildName = discordClient.getGuildName(parsed.guildId);
                return {
                    content: [
                        {
                            type: "text",
                            text: `# Channels in ${guildName || parsed.guildId}\n\n${JSON.stringify(channels, null, 2)}`,
                        },
                    ],
                };
            }

            case "read_messages": {
                const parsed = ReadMessagesSchema.parse(args);
                const messages = await discordClient.readMessages(
                    parsed.channelId,
                    parsed.limit
                );
                const channelName = discordClient.getChannelName(parsed.channelId);
                return {
                    content: [
                        {
                            type: "text",
                            text: `# Messages from #${channelName || parsed.channelId}\n\n${JSON.stringify(messages, null, 2)}`,
                        },
                    ],
                };
            }

            case "search_messages": {
                const parsed = SearchMessagesSchema.parse(args);
                const messages = await discordClient.searchMessages(parsed.channelId, {
                    query: parsed.query,
                    authorId: parsed.authorId,
                    before: parsed.before,
                    after: parsed.after,
                    limit: parsed.limit,
                });
                const channelName = discordClient.getChannelName(parsed.channelId);
                return {
                    content: [
                        {
                            type: "text",
                            text: `# Search Results from #${channelName || parsed.channelId}\n\nQuery: ${parsed.query || "N/A"}\nResults: ${messages.length}\n\n${JSON.stringify(messages, null, 2)}`,
                        },
                    ],
                };
            }

            case "generate_report": {
                const parsed = GenerateReportSchema.parse(args);
                const messages = await discordClient.readMessages(
                    parsed.channelId,
                    parsed.limit
                );
                const channelName = discordClient.getChannelName(parsed.channelId);

                // Format messages for analysis
                const formattedMessages = messages
                    .reverse()
                    .map((m) => `[${m.timestamp}] ${m.author}: ${m.content}`)
                    .join("\n");

                const report = `# Report: ${parsed.topic}

## Source
- **Channel**: #${channelName || parsed.channelId}
- **Messages Analyzed**: ${messages.length}
- **Time Range**: ${messages.length > 0 ? `${messages[messages.length - 1].timestamp} to ${messages[0].timestamp}` : "N/A"}

## Topic
${parsed.topic}

## Messages Data
\`\`\`
${formattedMessages}
\`\`\`

## Analysis
Based on the ${messages.length} messages above, analyze the topic "${parsed.topic}" and provide insights.
`;

                return {
                    content: [
                        {
                            type: "text",
                            text: report,
                        },
                    ],
                };
            }

            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            content: [
                {
                    type: "text",
                    text: `Error: ${errorMessage}`,
                },
            ],
            isError: true,
        };
    }
});

// Start server
async function main() {
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
        console.error("Error: DISCORD_TOKEN environment variable is not set");
        process.exit(1);
    }

    console.error("[MCP] Starting Discord MCP server...");

    // Login to Discord
    await discordClient.login(token);
    console.error("[MCP] Discord client ready");

    // Start MCP server
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[MCP] Server connected and ready");
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
