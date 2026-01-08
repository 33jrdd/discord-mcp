import { Client } from "discord.js-selfbot-v13";

export interface GuildInfo {
    id: string;
    name: string;
    memberCount: number;
}

export interface ChannelInfo {
    id: string;
    name: string;
    type: string;
}

export interface MessageInfo {
    id: string;
    author: string;
    authorId: string;
    content: string;
    timestamp: string;
    attachments: string[];
}

class RateLimiter {
    private lastRequest: number = 0;
    private minInterval: number = 100; // 100ms between requests

    async wait(): Promise<void> {
        const now = Date.now();
        const elapsed = now - this.lastRequest;
        if (elapsed < this.minInterval) {
            await new Promise((resolve) =>
                setTimeout(resolve, this.minInterval - elapsed)
            );
        }
        this.lastRequest = Date.now();
    }
}

export class DiscordClient {
    private client: Client;
    private rateLimiter: RateLimiter;
    private isReady: boolean = false;

    constructor() {
        this.client = new Client();
        this.rateLimiter = new RateLimiter();

        this.client.on("ready", () => {
            this.isReady = true;
            console.error(`[Discord] Logged in as ${this.client.user?.tag}`);
        });
    }

    async login(token: string): Promise<void> {
        if (this.isReady) return;

        await this.client.login(token);

        // Wait for ready event
        await new Promise<void>((resolve) => {
            if (this.isReady) {
                resolve();
            } else {
                this.client.once("ready", () => resolve());
            }
        });
    }

    async listGuilds(): Promise<GuildInfo[]> {
        await this.rateLimiter.wait();

        return this.client.guilds.cache.map((guild) => ({
            id: guild.id,
            name: guild.name,
            memberCount: guild.memberCount,
        }));
    }

    async listChannels(guildId: string): Promise<ChannelInfo[]> {
        await this.rateLimiter.wait();

        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) {
            throw new Error(`Guild not found: ${guildId}`);
        }

        return guild.channels.cache
            .filter((channel) => {
                if (!channel.isText()) return false;
                const permissions = (channel as any).permissionsFor(this.client.user!);
                return permissions?.has("VIEW_CHANNEL");
            })
            .map((channel) => ({
                id: channel.id,
                name: (channel as any).name || "Unknown",
                type: channel.type,
            }));
    }

    async readMessages(
        channelId: string,
        limit: number = 50
    ): Promise<MessageInfo[]> {
        await this.rateLimiter.wait();

        const channel = this.client.channels.cache.get(channelId);
        if (!channel || !channel.isText()) {
            throw new Error(`Text channel not found: ${channelId}`);
        }

        const permissions = (channel as any).permissionsFor(this.client.user!);
        if (!permissions?.has("VIEW_CHANNEL")) {
            throw new Error(`Missing VIEW_CHANNEL permission for channel: ${channelId}`);
        }
        if (!permissions?.has("READ_MESSAGE_HISTORY")) {
            throw new Error(`Missing READ_MESSAGE_HISTORY permission for channel: ${channelId}`);
        }

        const messages = await channel.messages.fetch({ limit: Math.min(limit, 100) });

        return messages.map((msg) => ({
            id: msg.id,
            author: msg.author.username,
            authorId: msg.author.id,
            content: msg.content,
            timestamp: msg.createdAt.toISOString(),
            attachments: msg.attachments.map((a) => a.url),
        }));
    }

    async searchMessages(
        channelId: string,
        options: {
            query?: string;
            authorId?: string;
            before?: string;
            after?: string;
            limit?: number;
        }
    ): Promise<MessageInfo[]> {
        await this.rateLimiter.wait();

        const channel: any = this.client.channels.cache.get(channelId);
        if (!channel || (!channel.isText() && !channel.isThread())) {
            throw new Error(`Text channel or thread not found: ${channelId}`);
        }

        const permissions = channel.permissionsFor(this.client.user!);
        if (!permissions?.has("VIEW_CHANNEL")) {
            throw new Error(`Missing VIEW_CHANNEL permission for channel: ${channelId}`);
        }
        if (!permissions?.has("READ_MESSAGE_HISTORY")) {
            throw new Error(`Missing READ_MESSAGE_HISTORY permission for channel: ${channelId}`);
        }

        const guildId = channel.guild?.id;
        if (!guildId) {
            throw new Error(`Guild context not found for channel: ${channelId}`);
        }

        try {
            // Use raw API to hit the search endpoint since .search() might be missing in library
            // Endpoint: /guilds/{guildId}/messages/search
            const searchParams: any = {};
            if (options.query) searchParams.content = options.query;
            if (options.authorId) searchParams.author_id = options.authorId;
            if (channelId) searchParams.channel_id = channelId;
            if (options.before) searchParams.max_id = options.before;
            if (options.after) searchParams.min_id = options.after;

            const response = await (this.client as any).api.guilds(guildId).messages.search.get({
                query: searchParams
            });

            // The response for search is complex: { total_results: number, messages: [[{...}], [...]] }
            const rawMessages = response.messages || [];
            const messages = rawMessages.map((m: any) => Array.isArray(m) ? m[0] : m);

            return messages.slice(0, options.limit || 50).map((msg: any) => ({
                id: msg.id,
                author: msg.author.username,
                authorId: msg.author.id,
                content: msg.content,
                timestamp: msg.timestamp || new Date().toISOString(),
                attachments: msg.attachments ? msg.attachments.map((a: any) => a.url) : [],
            }));
        } catch (error: any) {
            console.error(`[Discord] Native search failed: ${error.message}. Falling back to fetch.`);

            // Fallback to fetch if native search fails or is restricted
            const fetchOptions: any = { limit: Math.min(options.limit || 50, 100) };
            if (options.before) fetchOptions.before = options.before;
            if (options.after) fetchOptions.after = options.after;

            const fetchedMessages = await channel.messages.fetch(fetchOptions);
            let filtered = [...fetchedMessages.values()];

            if (options.query) {
                const q = options.query.toLowerCase();
                filtered = filtered.filter((m: any) => m.content.toLowerCase().includes(q));
            }

            if (options.authorId) {
                filtered = filtered.filter((m: any) => m.author.id === options.authorId);
            }

            return filtered.map((msg: any) => ({
                id: msg.id,
                author: msg.author.username,
                authorId: msg.author.id,
                content: msg.content,
                timestamp: msg.createdAt.toISOString(),
                attachments: msg.attachments.map((a: any) => a.url),
            }));
        }
    }

    getGuildName(guildId: string): string | undefined {
        return this.client.guilds.cache.get(guildId)?.name;
    }

    getChannelName(channelId: string): string | undefined {
        const channel = this.client.channels.cache.get(channelId);
        return channel && "name" in channel ? (channel.name ?? undefined) : undefined;
    }
}

export const discordClient = new DiscordClient();
