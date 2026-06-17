require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');
const app = express();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration
    ]
});

const PREFIX = '!';
let WELCOME_CHANNEL_ID = '1411812421814849536'; // Pode ser alterado pelo painel

// ==================== READY ====================
client.once('ready', () => {
    console.log(`✅ PHANTOM Bot online como ${client.user.tag}`);
    client.user.setActivity('nas sombras 👻', { type: 'WATCHING' });
});

// ==================== WELCOME ====================
client.on('guildMemberAdd', async member => {
    const channel = await client.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
    if (channel) {
        const embed = new EmbedBuilder()
            .setColor(0x000000)
            .setTitle('👻 Novo Membro Chegou!')
            .setDescription(`Bem-vindo(a), **${member.user.tag}**!\n\nEsperamos que se divirta no servidor!`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();
        channel.send({ embeds: [embed] });
    }
});

// ==================== COMANDOS ====================
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'ajuda') {
        message.reply('**PHANTOM Bot** - Use o painel web para mais opções.');
    }
});

// ==================== PAINEL WEB ====================
app.use(express.json());
app.use(express.static('public'));

// Página principal
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// API - Mudar canal de welcome
app.post('/api/set-welcome', (req, res) => {
    const { channelId } = req.body;
    if (channelId) {
        WELCOME_CHANNEL_ID = channelId;
        res.json({ success: true, message: 'Canal de welcome atualizado!' });
    } else {
        res.status(400).json({ success: false, message: 'ID inválido' });
    }
});

// API - Enviar mensagem
app.post('/api/send-message', async (req, res) => {
    const { channelId, content } = req.body;
    try {
        const channel = await client.channels.fetch(channelId);
        await channel.send(content);
        res.json({ success: true, message: 'Mensagem enviada!' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao enviar: ' + err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Painel rodando na porta ${PORT}`));

client.login(process.env.TOKEN);
