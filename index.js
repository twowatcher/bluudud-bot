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
        GatewayIntentBits.GuildVoiceStates
    ]
});

const PREFIX = '!';

// ==================== BOT INICIANDO ====================
client.once('ready', () => {
    console.log(`✅ PHANTOM Bot ONLINE! 👻`);
    client.user.setActivity('nas sombras 👻', { type: 'WATCHING' });
});

// ==================== COMANDOS ====================
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // 1. PING
    if (command === 'ping') {
        message.reply(`🏓 Pong! Latência: ${Date.now() - message.createdTimestamp}ms`);
    }

    // 2. AVATAR (Mostra a foto de perfil do usuário ou do mencionado)
    if (command === 'avatar') {
        const usuario = message.mentions.users.first() || message.author;
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`📸 Avatar de ${usuario.username}`)
            .setImage(usuario.displayAvatarURL({ dynamic: true, size: 1024 }));
        
        message.reply({ embeds: [embed] });
    }

    // 3. SERVERINFO (Informações sobre o servidor)
    if (command === 'serverinfo') {
        const { guild } = message;
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`ℹ️ Informações do Servidor: ${guild.name}`)
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .addFields(
                { name: '🆔 ID do Servidor', value: guild.id, inline: true },
                { name: '👑 Dono', value: `<@${guild.ownerId}>`, inline: true },
                { name: '👥 Membros', value: `${guild.memberCount}`, inline: true },
                { name: '📅 Criado em', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }
            );

        message.reply({ embeds: [embed] });
    }

    // 4. USERINFO (Informações sobre um usuário)
    if (command === 'userinfo') {
        const membro = message.mentions.members.first() || message.member;
        const embed = new EmbedBuilder()
            .setColor(0x00FFFF)
            .setTitle(`👤 Informações de ${membro.user.username}`)
            .setThumbnail(membro.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: 'Tag', value: membro.user.tag, inline: true },
                { name: 'ID', value: membro.id, inline: true },
                { name: 'Entrou no Servidor', value: `<t:${Math.floor(membro.joinedTimestamp / 1000)}:R>`, inline: false },
                { name: 'Conta Criada', value: `<t:${Math.floor(membro.user.createdTimestamp / 1000)}:R>`, inline: false }
            );

        message.reply({ embeds: [embed] });
    }

    // 5. CLEAR / LIMPAR (Deleta até 99 mensagens)
    if (command === 'clear' || command === 'limpar') {
        if (!message.member.permissions.has('ManageMessages')) {
            return message.reply('❌ Você não tem permissão para gerenciar mensagens.');
        }

        const quantidade = parseInt(args[0]);
        if (isNaN(quantidade) || quantidade < 1 || quantidade > 99) {
            return message.reply('⚠️ Insira um número entre 1 e 99.');
        }

        try {
            const mensagensDeletadas = await message.channel.bulkDelete(quantidade + 1, true);
            const aviso = await message.channel.send(`🧹 Limpei ${mensagensDeletadas.size - 1} mensagens!`);
            setTimeout(() => aviso.delete(), 3000); // Apaga o aviso depois de 3 segundos
        } catch (error) {
            message.reply('❌ Ocorreu um erro ao tentar limpar as mensagens (mensagens com mais de 14 dias não podem ser apagadas em massa).');
        }
    }

    // 6. KICK / EXPULSAR
    if (command === 'kick' || command === 'expulsar') {
        if (!message.member.permissions.has('KickMembers')) return message.reply('❌ Permissão insuficiente.');
        const membro = message.mentions.members.first();
        if (!membro) return message.reply('⚠️ Mencione um usuário válido para expulsar.');
        if (!membro.kickable) return message.reply('❌ Eu não posso expulsar este usuário.');

        const motivo = args.slice(1).join(' ') || 'Nenhum motivo fornecido.';
        await membro.kick(motivo);
        message.reply(`🚪 **${membro.user.tag}** foi expulso. Motivo: ${motivo}`);
    }

    // 7. BAN / BANIR
    if (command === 'ban' || command === 'banir') {
        if (!message.member.permissions.has('BanMembers')) return message.reply('❌ Permissão insuficiente.');
        const membro = message.mentions.members.first();
        if (!membro) return message.reply('⚠️ Mencione um usuário válido para banir.');
        if (!membro.bannable) return message.reply('❌ Eu não posso banir este usuário.');

        const motivo = args.slice(1).join(' ') || 'Nenhum motivo fornecido.';
        await membro.ban({ reason: motivo });
        message.reply(`🔨 **${membro.user.tag}** foi banido permanentemente. Motivo: ${motivo}`);
    }

    // 8. DADO (Gira um dado de 6 lados ou o número que você escolher)
    if (command === 'dado') {
        const lados = parseInt(args[0]) || 6;
        const resultado = Math.floor(Math.random() * lados) + 1;
        message.reply(`🎲 Você jogou um dado de ${lados} lados e caiu: **${resultado}**`);
    }

    // 9. COINFLIP / CARA OU COROA
    if (command === 'coinflip' || command === 'caraoucoroa') {
        const escolhas = ['Cara', 'Coroa'];
        const resultado = escolhas[Math.floor(Math.random() * escolhas.length)];
        message.reply(`🪙 Moeda lançada! Resultado: **${resultado}**`);
    }

    // 10. REPETIR / SAY (Faz o bot repetir o que você falar)
    if (command === 'say' || command === 'falar') {
        const texto = args.join(' ');
        if (!texto) return message.reply('⚠️ Digite o texto que deseja que eu fale.');
        message.delete(); // Deleta a mensagem do usuário que enviou o comando
        message.channel.send(texto);
    }

    // 11. ABRAÇO / HUG
    if (command === 'abraco' || command === 'hug') {
        const usuario = message.mentions.users.first();
        if (!usuario) return message.reply('⚠️ Mencione alguém para abraçar!');
        if (usuario.id === message.author.id) return message.reply('Você não pode se abraçar sozinho... Mas toma um abraço meu virtual! 🤗');
        
        message.channel.send(`🤗 <@${message.author.id}> deu um forte abraço em <@${usuario.id}>!`);
    }

    // 12. AJUDA ATUALIZADO
    if (command === 'ajuda' || command === 'comandos') {
        const embed = new EmbedBuilder()
            .setColor(0x000000)
            .setTitle('👻 PHANTOM Bot - Painel de Comandos')
            .setDescription('Prefixo atual: `!`\n\n' +
                '**🛠️ Utilitários:**\n' +
                '`!ping` - Mostra a latência do bot.\n' +
                '`!avatar [@user]` - Mostra a foto de perfil.\n' +
                '`!serverinfo` - Informações sobre o servidor.\n' +
                '`!userinfo [@user]` - Informações sobre um usuário.\n\n' +
                '**🎲 Diversão:**\n' +
                '`!dado [lados]` - Joga um dado (padrão 6 lados).\n' +
                '`!coinflip` - Joga uma moeda (Cara ou Coroa).\n' +
                '`!falar [texto]` - Faz o bot repetir uma mensagem.\n' +
                '`!abraco [@user]` - Dá um abraço em alguém.\n\n' +
                '**🛡️ Moderação:**\n' +
                '`!limpar [1-99]` - Apaga mensagens do chat.\n' +
                '`!expulsar [@user] [motivo]` - Expulsa um membro.\n' +
                '`!banir [@user] [motivo]` - Bane um membro.');
        
        message.reply({ embeds: [embed] });
    }
});

client.login(process.env.TOKEN);

// ==================== SITE ====================
app.use(express.static('public'));
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🌐 Site rodando na porta ${PORT}`);
});