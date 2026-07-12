require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const PREFIX = '!';

// ==================== READY ====================
client.once('ready', () => {
    console.log(`✅ BLUUDUD BOT ONLINE! 🔥`);
    client.user.setActivity('fazendo moderação com meme', { type: 'WATCHING' });
});

// ==================== COMANDOS ====================
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // ==================== MODERAÇÃO ====================

    if (command === 'ping') {
        message.reply(`🏓 Pong! ${Date.now() - message.createdTimestamp}ms`);
    }

    // Clear
    if (command === 'clear' || command === 'limpar') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return message.reply('❌ Você não tem permissão pra isso, parça.');
        }
        const qtd = parseInt(args[0]) || 10;
        if (qtd < 1 || qtd > 99) return message.reply('Use um número entre 1 e 99.');
        
        await message.channel.bulkDelete(qtd + 1, true);
        const msg = await message.channel.send(`🧹 Limpei ${qtd} mensagens, tá me devendo um monster!`);
        setTimeout(() => msg.delete(), 4000);
    }

    // Kick
    if (command === 'kick' || command === 'expulsar') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return message.reply('❌ Sem permissão.');
        const membro = message.mentions.members.first();
        if (!membro) return message.reply('quem vai para prisao com o tio diddy?');
        
        const motivo = args.slice(1).join(' ') || 'Sem motivo (provavelmente meme)';
        await membro.kick(motivo);
        message.reply(`🚪 ${membro.user.tag} foi expulso. Motivo: ${motivo}`);
    }

    // Ban
    if (command === 'ban' || command === 'banir') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return message.reply('❌ Sem permissão.');
        const membro = message.mentions.members.first();
        if (!membro) return message.reply('vixi quem vai para o céu com o tio epstein?');
        
        const motivo = args.slice(1).join(' ') || 'Meme pesado demais';
        await membro.ban({ reason: motivo });
        message.reply(`🔨 ${membro.user.tag} foi banido. Motivo: ${motivo}`);
    }

    // ==================== MEMES ====================

    if (command === 'meme') {
        const memes = [
            "https://cdn.discordapp.com/attachments/1366746489610702952/1525634428787888178/IMG_8436.jpg?ex=6a541948&is=6a52c7c8&hm=81bdf4a3cbc55d6431231ca58ebe869c88b1e54cb7cff0a1e51881c13638404b&", // substitua depois por links reais
            "toctoc quem é? é o tio diddy(q bosta)",
            "https://klipy.com/gifs/shrek-rizz-shrek-meme",
            "https://cdn.discordapp.com/attachments/1366746489610702952/1525636660539166761/IMG_8430.jpg?ex=6a541b5c&is=6a52c9dc&hm=9cb6ee4b877db505a960084ad82a23820c68cc4ceb38478ab8cfaf455d02abcc",
            "https://cdn.discordapp.com/attachments/1366746489610702952/1525634427751895130/IMG_8440.jpg?ex=6a541948&is=6a52c7c8&hm=d92e6a122d3b256a7ec065ed66b025008769fe36b14d3582f9df59d70b4180a7&",
            "https://cdn.discordapp.com/attachments/1366746489610702952/1525634427450032228/IMG_8439.jpg?ex=6a541948&is=6a52c7c8&hm=59778132a5a427b2a5c14c8c806562f677517cbae80bbdd5f12ff5ad5acfc02f&"
        ];
        const random = memes[Math.floor(Math.random() * memes.length)];
        message.channel.send(random);
    }

    if (command === 'ajuda' || command === 'comandos') {
        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('🔥 BLUUDUD BOT - COMANDOS')
            .setDescription('bot guloso')
            .addFields(
                { name: '🛡️ Moderação', value: '`!clear` `!kick` `!ban`' },
                { name: '😂 Memes', value: '`!meme`' },
                { name: '📊 Outros', value: '`!ping` `!serverinfo`' }
            );
        message.reply({ embeds: [embed] });
    }
});

client.login(process.env.TOKEN);

// ==================== SERVIDOR PARA RENDER ====================
const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send('Bluudud Bot está online! 🔥');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🌐 Servidor rodando na porta ${PORT}`);
});