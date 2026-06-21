require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const app = express();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const PREFIX = '!';

// Bot pronto
client.once('ready', () => {
    console.log(`✅ PHANTOM Bot ONLINE! 👻`);
    client.user.setActivity('nas sombras 👻', { type: 'WATCHING' });
});

client.on('messageCreate', message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    if (message.content.toLowerCase() === '!ping') {
        message.reply('🏓 Pong!');
    }
});

client.login(process.env.TOKEN);

// Site
app.use(express.static('public'));
app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Site rodando`));