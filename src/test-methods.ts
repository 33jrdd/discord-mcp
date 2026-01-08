import { Client } from 'discord.js-selfbot-v13';
import { config } from 'dotenv';
config();

const client = new Client();

client.on('ready', () => {
    console.log('--- Client Methods ---');
    console.log(Object.getOwnPropertyNames(client).filter(m => m.toLowerCase().includes('search')));

    const guild = client.guilds.cache.first();
    if (guild) {
        console.log('--- Guild Methods ---');
        console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(guild)).filter(m => m.toLowerCase().includes('search')));

        const channel = guild.channels.cache.find(c => c.isText());
        if (channel) {
            console.log('--- Channel Methods ---');
            console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(channel)).filter(m => m.toLowerCase().includes('search')));
        }
    }
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
