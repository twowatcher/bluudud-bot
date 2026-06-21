require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
<<<<<<< HEAD
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
=======
>>>>>>> fd9a5f56e0e3473ccd5e371d5bfa81928c9f6047
const express = require('express');
const app = express();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const PREFIX = '!';
<<<<<<< HEAD
const queue = new Map();

// READY
client.once('ready', () => {
    console.log(`✅ PHANTOM Bot (Música) online! 👻`);
    client.user.setActivity('Spotify & YouTube', { type: 'LISTENING' });
});

// PLAY
=======
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
>>>>>>> fd9a5f56e0e3473ccd5e371d5bfa81928c9f6047
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const guildQueue = queue.get(message.guild.id);

<<<<<<< HEAD
    if (command === 'play') {
        if (!args[0]) return message.reply('❌ Use: `!play <link ou nome>`');

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.reply('❌ Entre em um canal de voz!');

        let query = args.join(' ');

        if (!guildQueue) {
            const queueConstruct = { voiceChannel, textChannel: message.channel, connection: null, songs: [] };
            queue.set(message.guild.id, queueConstruct);

            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator,
            });
            queueConstruct.connection = connection;

            queueConstruct.songs.push(query);
            playSong(message.guild.id);
        } else {
            guildQueue.songs.push(query);
            message.reply(`✅ Adicionado à fila: **${query}**`);
        }
    }

    if (command === 'skip') {
        if (guildQueue && guildQueue.songs.length > 0) {
            guildQueue.songs.shift();
            playSong(message.guild.id);
            message.reply('⏭️ Pulou a música!');
        }
    }

    if (command === 'stop') {
        if (guildQueue) {
            guildQueue.connection.destroy();
            queue.delete(message.guild.id);
        }
        message.reply('⏹️ Parado!');
    }

    if (command === 'ajuda') {
        message.reply('**Comandos de Música:**\n`!play <link>`\n`!skip`\n`!stop`');
    }
});

async function playSong(guildId) {
    const guildQueue = queue.get(guildId);
    if (!guildQueue || guildQueue.songs.length === 0) {
        if (guildQueue) guildQueue.connection.destroy();
        queue.delete(guildId);
        return;
    }

    const song = guildQueue.songs[0];
    try {
        const resource = createAudioResource(ytdl(song, { filter: 'audioonly' }));
        const player = createAudioPlayer();
        guildQueue.connection.subscribe(player);
        player.play(resource);

        player.on(AudioPlayerStatus.Idle, () => {
            guildQueue.songs.shift();
            playSong(guildId);
        });
    } catch (e) {
        console.error(e);
        guildQueue.songs.shift();
        playSong(guildId);
    }
}

client.login(process.env.TOKEN);

app.use(express.static('public'));
app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Painel rodando`));
=======
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
>>>>>>> fd9a5f56e0e3473ccd5e371d5bfa81928c9f6047
