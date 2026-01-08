
import { discordClient } from "./src/discord-client.js";
import { config } from "dotenv";
config();

async function debug() {
    await discordClient.login(process.env.DISCORD_TOKEN!);
    const id = "153919886471593984";
    const channel = (discordClient as any).client.channels.cache.get(id);
    const guild = (discordClient as any).client.guilds.cache.get(id);

    console.log("ID:", id);
    console.log("Channel found:", !!channel);
    if (channel) {
        console.log("Channel Type:", channel.type);
        console.log("Channel Name:", channel.name);
        console.log("Is Text:", typeof channel.isText === 'function' ? channel.isText() : 'N/A');
    }
    console.log("Guild found:", !!guild);
    if (guild) {
        console.log("Guild Name:", guild.name);
    }
    process.exit(0);
}

debug().catch(console.error);
