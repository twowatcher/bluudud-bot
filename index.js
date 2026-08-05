require('dotenv').config();
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    PermissionsBitField,
    ApplicationCommandOptionType,
    ChannelType
} = require('discord.js');
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

// ==================== CLIENT ====================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ]
});

// ==================== PERSISTÊNCIA SIMPLES ====================
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJSON(file, fallback = {}) {
    try {
        const p = path.join(DATA_DIR, file);
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
        console.error(`Erro ao carregar ${file}:`, e.message);
    }
    return fallback;
}

function saveJSON(file, data) {
    try {
        fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(`Erro ao salvar ${file}:`, e.message);
    }
}

const bancoData = loadJSON('banco.json', {});
const configBoasVindasData = loadJSON('config.json', {});
const warnsData = loadJSON('warns.json', {});

const banco = new Map(Object.entries(bancoData));
const configBoasVindas = new Map(Object.entries(configBoasVindasData));
const warns = new Map(Object.entries(warnsData));
const cooldowns = new Map();
const afkMap = new Map();

function persistBanco() {
    const obj = Object.fromEntries(banco);
    saveJSON('banco.json', obj);
}
function persistConfig() {
    const obj = Object.fromEntries(configBoasVindas);
    saveJSON('config.json', obj);
}
function persistWarns() {
    const obj = Object.fromEntries(warns);
    saveJSON('warns.json', obj);
}

const iniciarConta = (id) => {
    if (!banco.has(id)) {
        banco.set(id, { carteira: 100, banco: 0 });
        persistBanco();
    }
    return banco.get(id);
};

// ==================== BLUUDUD GIFS / IMAGES ====================
const BLUU = {
    color: 0x4db8ff,
    dance: 'https://forsaken.wiki/Special:FilePath/Emotec00lbluudud_CurrentDance.gif',
    face: 'https://forsaken.wiki/Special:FilePath/VeeronicaGrafitti_Bluudud.png',
    render: 'https://forsaken.wiki/Special:FilePath/Skinc00l_bluudud_InvIcon.png',
    thumb: 'https://forsaken.wiki/Special:FilePath/VeeronicaGrafitti_Bluudud.png'
};

const randomBluuGif = () => BLUU.dance;

function emb(title, desc, opts = {}) {
    const e = new EmbedBuilder()
        .setColor(opts.color ?? BLUU.color)
        .setTimestamp();
    if (title) e.setTitle(title);
    if (desc) e.setDescription(desc);
    if (opts.footer) e.setFooter({ text: opts.footer });
    if (opts.thumb) e.setThumbnail(opts.thumb);
    if (opts.image) e.setImage(opts.image);
    if (opts.fields) e.addFields(opts.fields);
    if (opts.author) e.setAuthor(opts.author);
    return e;
}

// ==================== GROQ (só usado no site) ====================
async function askGroq(prompt, systemExtra = '') {
    const key = process.env.GROQ_API_KEY;
    if (!key) {
        return '⚠️ GROQ_API_KEY não configurada. Coloque a chave no Render (Environment).';
    }
    const system = `Você é o Bluudud, o personagem azul de Forsaken (Roblox). 
Fale em português brasileiro, de forma divertida, meio streamer, meio troll inocente.
Use frases como "mwehehe".
Seja útil mas mantenha a personalidade. Respostas curtas a médias.
${systemExtra}`.trim();

    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.8,
                max_tokens: 600
            })
        });
        if (!res.ok) {
            const err = await res.text();
            console.error('Groq error:', err);
            return 'Eugh... a IA deu tilt. Tenta de novo!';
        }
        const data = await res.json();
        return data.choices?.[0]?.message?.content?.trim() || 'Sem resposta...';
    } catch (e) {
        console.error('Groq fetch:', e);
        return 'Falha ao conectar na IA.';
    }
}

// ==================== COOLDOWN ====================
function checkCd(userId, cmd, ms) {
    const key = `${userId}:${cmd}`;
    const now = Date.now();
    if (cooldowns.has(key) && now < cooldowns.get(key)) {
        return Math.ceil((cooldowns.get(key) - now) / 1000);
    }
    cooldowns.set(key, now + ms);
    return 0;
}

function formatTime(seconds) {
    if (seconds >= 3600) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${h}h ${m}m`;
    }
    if (seconds >= 60) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}m ${s}s`;
    }
    return `${seconds}s`;
}

// ==================== SLASH COMMANDS (sem IA) ====================
const commandsData = [
    // Config
    { name: 'config-boasvindas', description: 'Define o canal de boas-vindas', options: [{ name: 'canal', description: 'Canal de texto', type: ApplicationCommandOptionType.Channel, channelTypes: [ChannelType.GuildText], required: true }] },
    { name: 'config-mensagem', description: 'Mensagem de boas-vindas', options: [{ name: 'mensagem', description: 'Use {membro} {servidor} {total}', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'config-cargo', description: 'Cargo automático de boas-vindas', options: [{ name: 'cargo', description: 'Cargo', type: ApplicationCommandOptionType.Role, required: true }] },
    // Util
    { name: 'ping', description: 'Latência do bot' },
    { name: 'ajuda', description: 'Lista de comandos' },
    { name: 'serverinfo', description: 'Info do servidor' },
    { name: 'userinfo', description: 'Info de um usuário', options: [{ name: 'usuario', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'avatar', description: 'Avatar de alguém', options: [{ name: 'usuario', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'uptime', description: 'Tempo online do bot' },
    { name: 'convite', description: 'Link de convite do bot' },
    { name: 'falar', description: 'Bot fala algo', options: [{ name: 'texto', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'calculadora', description: 'Calcula expressão', options: [{ name: 'expressao', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'sorteio', description: 'Sorteia entre opções', options: [{ name: 'opcoes', description: 'Separe por vírgula', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'regras', description: 'Mostra regras sugeridas' },
    { name: 'links', description: 'Links úteis' },
    // Mod
    { name: 'limpar', description: 'Apaga mensagens', options: [{ name: 'quantidade', type: ApplicationCommandOptionType.Integer, required: true, min_value: 1, max_value: 100 }] },
    { name: 'expulsar', description: 'Expulsa um membro', options: [{ name: 'usuario', type: ApplicationCommandOptionType.User, required: true }, { name: 'motivo', type: ApplicationCommandOptionType.String, required: false }] },
    { name: 'banir', description: 'Bane um membro', options: [{ name: 'usuario', type: ApplicationCommandOptionType.User, required: true }, { name: 'motivo', type: ApplicationCommandOptionType.String, required: false }] },
    { name: 'desbanir', description: 'Remove ban', options: [{ name: 'id', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'mutar', description: 'Timeout (minutos)', options: [{ name: 'usuario', type: ApplicationCommandOptionType.User, required: true }, { name: 'minutos', type: ApplicationCommandOptionType.Integer, required: true, min_value: 1, max_value: 40320 }, { name: 'motivo', type: ApplicationCommandOptionType.String, required: false }] },
    { name: 'desmutar', description: 'Remove timeout', options: [{ name: 'usuario', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'lock', description: 'Tranca o canal' },
    { name: 'unlock', description: 'Destranca o canal' },
    { name: 'modolento', description: 'Slowmode em segundos', options: [{ name: 'segundos', type: ApplicationCommandOptionType.Integer, required: true, min_value: 0, max_value: 21600 }] },
    { name: 'warn', description: 'Avisa um membro', options: [{ name: 'usuario', type: ApplicationCommandOptionType.User, required: true }, { name: 'motivo', type: ApplicationCommandOptionType.String, required: false }] },
    { name: 'setnick', description: 'Muda apelido', options: [{ name: 'usuario', type: ApplicationCommandOptionType.User, required: true }, { name: 'apelido', type: ApplicationCommandOptionType.String, required: true }] },
    // Economia
    { name: 'saldo', description: 'Seu saldo', options: [{ name: 'usuario', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'daily', description: 'Recompensa diária' },
    { name: 'trabalhar', description: 'Trabalha e ganha coins' },
    { name: 'apostar', description: 'Aposta coins', options: [{ name: 'valor', type: ApplicationCommandOptionType.Integer, required: true, min_value: 1 }] },
    { name: 'doar', description: 'Doa coins', options: [{ name: 'usuario', type: ApplicationCommandOptionType.User, required: true }, { name: 'valor', type: ApplicationCommandOptionType.Integer, required: true, min_value: 1 }] },
    { name: 'roubar', description: 'Tenta roubar alguém', options: [{ name: 'usuario', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'crime', description: 'Comete um crime (risco/recompensa)' },
    { name: 'slots', description: 'Caça-níqueis', options: [{ name: 'valor', type: ApplicationCommandOptionType.Integer, required: true, min_value: 10 }] },
    { name: 'ranking', description: 'Top ricos do servidor' },
    { name: 'depositar', description: 'Deposita no banco', options: [{ name: 'valor', type: ApplicationCommandOptionType.Integer, required: true, min_value: 1 }] },
    { name: 'sacar', description: 'Saca do banco', options: [{ name: 'valor', type: ApplicationCommandOptionType.Integer, required: true, min_value: 1 }] },
    // Diversão
    { name: 'meme', description: 'Meme aleatório' },
    { name: 'dado', description: 'Rola um dado', options: [{ name: 'lados', type: ApplicationCommandOptionType.Integer, required: false, min_value: 2, max_value: 100 }] },
    { name: 'moeda', description: 'Cara ou coroa' },
    { name: '8ball', description: 'Pergunta mágica', options: [{ name: 'pergunta', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'ship', description: 'Ship de dois usuários', options: [{ name: 'user1', type: ApplicationCommandOptionType.User, required: true }, { name: 'user2', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'abracar', description: 'Abraça alguém', options: [{ name: 'usuario', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'beijar', description: 'Beija alguém', options: [{ name: 'usuario', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'tapa', description: 'Dá um tapa', options: [{ name: 'usuario', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'cantada', description: 'Cantada aleatória' },
    { name: 'piada', description: 'Piada aleatória' },
    { name: 'elogiar', description: 'Elogia alguém', options: [{ name: 'usuario', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'zoar', description: 'Zoa alguém', options: [{ name: 'usuario', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'howgay', description: 'Medidor how gay', options: [{ name: 'usuario', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'rizz', description: 'Nível de rizz', options: [{ name: 'usuario', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'qi', description: 'QI aleatório', options: [{ name: 'usuario', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'gado', description: 'Nível de gado', options: [{ name: 'usuario', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'chances', description: 'Chances de algo', options: [{ name: 'texto', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'escolha', description: 'Escolhe entre opções', options: [{ name: 'opcoes', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'diga', description: 'Repete em TTS-style', options: [{ name: 'texto', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'votar', description: 'Cria enquete rápida', options: [{ name: 'pergunta', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'reverso', description: 'Inverte o texto', options: [{ name: 'texto', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'jokenpo', description: 'Pedra papel tesoura', options: [{ name: 'escolha', type: ApplicationCommandOptionType.String, required: true, choices: [{ name: 'Pedra', value: 'pedra' }, { name: 'Papel', value: 'papel' }, { name: 'Tesoura', value: 'tesoura' }] }] },
    { name: 'roleta', description: 'Roleta russa' },
    { name: 'adivinhe', description: 'Adivinhe o número 1-10', options: [{ name: 'numero', type: ApplicationCommandOptionType.Integer, required: true, min_value: 1, max_value: 10 }] },
    { name: 'bluudanc', description: 'Bluudud dançando (GIF)' },
    { name: 'bluudud', description: 'Info / GIF do Bluudud' },
    { name: 'senha', description: 'Gera senha forte', options: [{ name: 'tamanho', type: ApplicationCommandOptionType.Integer, required: false, min_value: 6, max_value: 64 }] },
    // AFK
    { name: 'afk', description: 'Define status AFK', options: [{ name: 'motivo', type: ApplicationCommandOptionType.String, required: false }] }
];

// ==================== READY ====================
client.once('ready', async () => {
    console.log(`💙 Bluudud online como ${client.user.tag}`);

    try {
        const GUILD_ID = process.env.GUILD_ID; // coloque no .env / Render
        if (GUILD_ID) {
            const guild = client.guilds.cache.get(GUILD_ID);
            if (guild) {
                await guild.commands.set(commandsData);
                console.log(`✅ ${commandsData.length} comandos registrados no servidor ${guild.name}`);
            } else {
                console.log('❌ GUILD_ID definido, mas servidor não encontrado.');
            }
        } else {
            // fallback global (pode demorar até 1h)
            await client.application.commands.set(commandsData);
            console.log(`✅ ${commandsData.length} comandos registrados globalmente`);
        }
    } catch (e) {
        console.error('Erro ao registrar comandos:', e);
    }

    client.user.setActivity('tem bluudude get in nowww!!!', { type: 3 });
});

// ==================== WELCOME ====================
client.on('guildMemberAdd', async (member) => {
    const cfg = configBoasVindas.get(member.guild.id);
    if (!cfg?.canalId) return;
    const ch = member.guild.channels.cache.get(cfg.canalId);
    if (!ch) return;

    let msg = cfg.mensagem || 'Seja bem-vindo(a) {membro} ao {servidor}! Agora somos {total}!';
    msg = msg
        .replace(/{membro}/g, `<@${member.id}>`)
        .replace(/{servidor}/g, member.guild.name)
        .replace(/{total}/g, member.guild.memberCount);

    const embed = emb('✨ Nova chegada!', msg, {
        image: randomBluuGif(),
        thumb: member.user.displayAvatarURL({ size: 128 }),
        footer: 'Bluudud Bot · Forsaken vibes'
    });

    try {
        await ch.send({ embeds: [embed] });
        if (cfg.cargoId) {
            const role = member.guild.roles.cache.get(cfg.cargoId);
            if (role) await member.roles.add(role).catch(() => {});
        }
    } catch (e) {
        console.error('Welcome error:', e.message);
    }
});

// ==================== AFK MENTION ====================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // Remove AFK se a pessoa falou
    if (afkMap.has(message.author.id)) {
        afkMap.delete(message.author.id);
        message.reply({ embeds: [emb('👋 Bem-vindo de volta!', 'Seu status AFK foi removido.', { thumb: BLUU.face })] }).catch(() => {});
    }

    // Avisa se mencionou alguém AFK
    if (message.mentions.users.size > 0) {
        for (const [, user] of message.mentions.users) {
            if (afkMap.has(user.id)) {
                const motivo = afkMap.get(user.id);
                message.reply({ embeds: [emb('💤 Usuário AFK', `**${user.username}** está AFK: ${motivo}`, { thumb: BLUU.face })] }).catch(() => {});
            }
        }
    }
});

// ==================== INTERACTIONS ====================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName: cmd, options, member, guild, user } = interaction;

    try {
        // ---- CONFIG ----
        if (cmd === 'config-boasvindas') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            }
            const canal = options.getChannel('canal');
            if (!configBoasVindas.has(guild.id)) configBoasVindas.set(guild.id, {});
            configBoasVindas.get(guild.id).canalId = canal.id;
            persistConfig();
            return interaction.reply({ embeds: [emb('✅ Canal definido', `Boas-vindas em ${canal}`, { image: BLUU.dance })] });
        }
        if (cmd === 'config-mensagem') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            }
            if (!configBoasVindas.has(guild.id)) configBoasVindas.set(guild.id, {});
            configBoasVindas.get(guild.id).mensagem = options.getString('mensagem');
            persistConfig();
            return interaction.reply({ embeds: [emb('✅ Mensagem salva', options.getString('mensagem'), { thumb: BLUU.face })] });
        }
        if (cmd === 'config-cargo') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            }
            if (!configBoasVindas.has(guild.id)) configBoasVindas.set(guild.id, {});
            configBoasVindas.get(guild.id).cargoId = options.getRole('cargo').id;
            persistConfig();
            return interaction.reply({ embeds: [emb('✅ Cargo definido', `${options.getRole('cargo')}`, { thumb: BLUU.face })] });
        }

        // ---- UTIL ----
        if (cmd === 'ping') {
            const sent = await interaction.reply({ embeds: [emb('🏓 Pong', `API: **${client.ws.ping}ms**`, { thumb: BLUU.face })], fetchReply: true });
            const lag = sent.createdTimestamp - interaction.createdTimestamp;
            return interaction.editReply({ embeds: [emb('🏓 Pong', `API: **${client.ws.ping}ms**\nLatência: **${lag}ms**`, { image: BLUU.dance })] });
        }
        if (cmd === 'ajuda') {
            return interaction.reply({
                embeds: [emb('📘 Comandos Bluudud', null, {
                    image: BLUU.dance,
                    fields: [
                        { name: '⚙️ Config', value: '`/config-boasvindas` `/config-mensagem` `/config-cargo`' },
                        { name: '🛡️ Mod', value: '`/limpar` `/expulsar` `/banir` `/mutar` `/lock` `/warn`' },
                        { name: '💰 Eco', value: '`/saldo` `/daily` `/trabalhar` `/apostar` `/roubar` `/slots` `/ranking`' },
                        { name: '😂 Fun', value: '`/meme` `/8ball` `/ship` `/bluudanc` `/jokenpo` `/zoar`' },
                        { name: 'ℹ️ Util', value: '`/ping` `/serverinfo` `/userinfo` `/avatar` `/uptime`' }
                    ]
                })]
            });
        }
        if (cmd === 'serverinfo') {
            return interaction.reply({
                embeds: [emb(guild.name, null, {
                    thumb: guild.iconURL({ size: 128 }),
                    image: BLUU.dance,
                    fields: [
                        { name: 'Membros', value: `${guild.memberCount}`, inline: true },
                        { name: 'Criado', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
                        { name: 'Dono', value: `<@${guild.ownerId}>`, inline: true }
                    ]
                })]
            });
        }
        if (cmd === 'userinfo') {
            const u = options.getUser('usuario') || user;
            const m = await guild.members.fetch(u.id).catch(() => null);
            return interaction.reply({
                embeds: [emb(u.tag, null, {
                    thumb: u.displayAvatarURL({ size: 256 }),
                    fields: [
                        { name: 'ID', value: u.id, inline: true },
                        { name: 'Entrou', value: m ? `<t:${Math.floor(m.joinedTimestamp / 1000)}:R>` : '—', inline: true },
                        { name: 'Conta', value: `<t:${Math.floor(u.createdTimestamp / 1000)}:R>`, inline: true }
                    ]
                })]
            });
        }
        if (cmd === 'avatar') {
            const u = options.getUser('usuario') || user;
            return interaction.reply({ embeds: [emb(`Avatar de ${u.username}`, null, { image: u.displayAvatarURL({ size: 512 }) })] });
        }
        if (cmd === 'uptime') {
            const s = Math.floor(process.uptime());
            const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
            return interaction.reply({ embeds: [emb('⏱️ Uptime', `**${h}h ${m}m ${sec}s**`, { thumb: BLUU.face })] });
        }
        if (cmd === 'convite') {
            // Permissões mais razoáveis (não Administrator)
            const perms = [
                PermissionsBitField.Flags.ManageChannels,
                PermissionsBitField.Flags.KickMembers,
                PermissionsBitField.Flags.BanMembers,
                PermissionsBitField.Flags.ManageMessages,
                PermissionsBitField.Flags.ModerateMembers,
                PermissionsBitField.Flags.ManageNicknames,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.EmbedLinks,
                PermissionsBitField.Flags.AttachFiles,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.AddReactions
            ].reduce((a, b) => a | b, 0n);
            const url = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=${perms}&scope=bot%20applications.commands`;
            return interaction.reply({ embeds: [emb('🔗 Convite', `[Clique aqui](${url})`, { image: BLUU.dance })] });
        }
        if (cmd === 'falar') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            }
            await interaction.reply({ content: 'Enviado!', ephemeral: true });
            return interaction.channel.send(options.getString('texto'));
        }
        if (cmd === 'calculadora') {
            const expr = options.getString('expressao').replace(/[^0-9+\-*/().%\s]/g, '');
            try {
                const r = Function(`"use strict"; return (${expr})`)();
                if (typeof r !== 'number' || !isFinite(r)) throw new Error('invalid');
                return interaction.reply({ embeds: [emb('🧮 Resultado', `**${r}**`, { thumb: BLUU.face })] });
            } catch {
                return interaction.reply({ content: 'Expressão inválida.', ephemeral: true });
            }
        }
        if (cmd === 'sorteio') {
            const ops = options.getString('opcoes').split(',').map(s => s.trim()).filter(Boolean);
            if (ops.length < 2) return interaction.reply({ content: 'Precisa de 2+ opções.', ephemeral: true });
            const win = ops[Math.floor(Math.random() * ops.length)];
            return interaction.reply({ embeds: [emb('🎲 Sorteio', `Resultado: **${win}**`, { image: BLUU.dance })] });
        }
        if (cmd === 'regras') {
            return interaction.reply({
                embeds: [emb('📜 Regras sugeridas', '1. Respeito\n2. Sem spam\n3. Sem NSFW\n4. Ouça a staff\n5. Divirta-se — things are getting a whole lot bluer!', { image: BLUU.dance })]
            });
        }
        if (cmd === 'links') {
            return interaction.reply({ embeds: [emb('🔗 Links', 'Dashboard do bot + Discord Developer Portal', { thumb: BLUU.face })] });
        }

        // ---- MOD ----
        if (cmd === 'limpar') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            }
            const q = options.getInteger('quantidade');
            await interaction.deferReply({ ephemeral: true });
            const deleted = await interaction.channel.bulkDelete(q, true).catch(() => null);
            return interaction.editReply(`Apaguei **${deleted?.size || 0}** mensagens.`);
        }
        if (cmd === 'expulsar') {
            if (!member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
                return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            }
            const u = options.getUser('usuario');
            const motivo = options.getString('motivo') || 'Sem motivo';
            const m = await guild.members.fetch(u.id).catch(() => null);
            if (!m || !m.kickable) return interaction.reply({ content: 'Não posso expulsar esse membro.', ephemeral: true });
            await m.kick(motivo);
            return interaction.reply({ embeds: [emb('👢 Expulso', `**${u.tag}** — ${motivo}`, { thumb: BLUU.face })] });
        }
        if (cmd === 'banir') {
            if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
                return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            }
            const u = options.getUser('usuario');
            const motivo = options.getString('motivo') || 'Sem motivo';
            try {
                const m = await guild.members.fetch(u.id).catch(() => null);
                if (m && !m.bannable) {
                    return interaction.reply({ content: 'Não posso banir esse membro (hierarquia).', ephemeral: true });
                }
                await guild.members.ban(u.id, { reason: motivo });
                return interaction.reply({ embeds: [emb('🔨 Banido', `**${u.tag}** — ${motivo}`, { image: BLUU.dance })] });
            } catch {
                return interaction.reply({ content: 'Falha ao banir.', ephemeral: true });
            }
        }
        if (cmd === 'desbanir') {
            if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
                return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            }
            const id = options.getString('id');
            try {
                await guild.bans.remove(id);
                return interaction.reply({ embeds: [emb('✅ Desbanido', `ID: ${id}`, { thumb: BLUU.face })] });
            } catch {
                return interaction.reply({ content: 'Não foi possível desbanir esse ID.', ephemeral: true });
            }
        }
        if (cmd === 'mutar') {
            if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            }
            const u = options.getUser('usuario');
            const min = options.getInteger('minutos');
            const m = await guild.members.fetch(u.id).catch(() => null);
            if (!m || !m.moderatable) return interaction.reply({ content: 'Não posso mutar esse membro.', ephemeral: true });
            await m.timeout(min * 60 * 1000, options.getString('motivo') || 'Mute');
            return interaction.reply({ embeds: [emb('🔇 Mutado', `**${u.tag}** por **${min}min**`, { thumb: BLUU.face })] });
        }
        if (cmd === 'desmutar') {
            if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            }
            const u = options.getUser('usuario');
            const m = await guild.members.fetch(u.id).catch(() => null);
            if (!m) return interaction.reply({ content: 'Membro não encontrado.', ephemeral: true });
            await m.timeout(null);
            return interaction.reply({ embeds: [emb('🔊 Desmutado', `**${u.tag}**`, { thumb: BLUU.face })] });
        }
        if (cmd === 'lock') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
                return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            }
            await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
            return interaction.reply({ embeds: [emb('🔒 Canal trancado', null, { thumb: BLUU.face })] });
        }
        if (cmd === 'unlock') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
                return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            }
            await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
            return interaction.reply({ embeds: [emb('🔓 Canal liberado', null, { thumb: BLUU.face })] });
        }
        if (cmd === 'modolento') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
                return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            }
            const s = options.getInteger('segundos');
            await interaction.channel.setRateLimitPerUser(s);
            return interaction.reply({ embeds: [emb('🐌 Slowmode', `**${s}s**`, { thumb: BLUU.face })] });
        }
        if (cmd === 'warn') {
            if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            }
            const u = options.getUser('usuario');
            const motivo = options.getString('motivo') || 'Sem motivo';
            const key = `${guild.id}:${u.id}`;
            const list = warns.get(key) || [];
            list.push({ motivo, by: user.id, at: Date.now() });
            warns.set(key, list);
            persistWarns();
            return interaction.reply({ embeds: [emb('⚠️ Warn', `**${u.tag}** — ${motivo}\nTotal: **${list.length}**`, { thumb: BLUU.face })] });
        }
        if (cmd === 'setnick') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
                return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            }
            const u = options.getUser('usuario');
            const nick = options.getString('apelido');
            const m = await guild.members.fetch(u.id).catch(() => null);
            if (!m || !m.manageable) return interaction.reply({ content: 'Não posso mudar o nick.', ephemeral: true });
            await m.setNickname(nick);
            return interaction.reply({ embeds: [emb('✏️ Nick', `**${u.tag}** → **${nick}**`, { thumb: BLUU.face })] });
        }

        // ---- ECONOMIA ----
        if (cmd === 'saldo') {
            const u = options.getUser('usuario') || user;
            const c = iniciarConta(u.id);
            return interaction.reply({
                embeds: [emb(`💰 ${u.username}`, `Carteira: **${c.carteira}** 🪙\nBanco: **${c.banco}** 🏦`, { thumb: u.displayAvatarURL() })]
            });
        }
        if (cmd === 'daily') {
            const cd = checkCd(user.id, 'daily', 24 * 60 * 60 * 1000);
            if (cd) return interaction.reply({ content: `Espere **${formatTime(cd)}**.`, ephemeral: true });
            const c = iniciarConta(user.id);
            const ganho = 200 + Math.floor(Math.random() * 150);
            c.carteira += ganho;
            persistBanco();
            return interaction.reply({ embeds: [emb('🎁 Daily', `Você ganhou **${ganho}** 🪙\nSaldo: **${c.carteira}**`, { image: BLUU.dance })] });
        }
        if (cmd === 'trabalhar') {
            const cd = checkCd(user.id, 'trabalhar', 15 * 60 * 1000);
            if (cd) return interaction.reply({ content: `Descanse **${formatTime(cd)}**.`, ephemeral: true });
            const jobs = ['streamar', 'entregar pizza', 'hackear (de mentira)', 'dançar bluudanc', 'farmar'];
            const job = jobs[Math.floor(Math.random() * jobs.length)];
            const ganho = 50 + Math.floor(Math.random() * 100);
            const c = iniciarConta(user.id);
            c.carteira += ganho;
            persistBanco();
            return interaction.reply({ embeds: [emb('💼 Trabalho', `Você foi **${job}** e ganhou **${ganho}** 🪙`, { image: BLUU.dance })] });
        }
        if (cmd === 'apostar') {
            const valor = options.getInteger('valor');
            const c = iniciarConta(user.id);
            if (c.carteira < valor) return interaction.reply({ content: 'Saldo insuficiente.', ephemeral: true });
            const win = Math.random() < 0.45;
            if (win) c.carteira += valor;
            else c.carteira -= valor;
            persistBanco();
            return interaction.reply({
                embeds: [emb(win ? '🎉 Ganhou!' : '😢 Perdeu', `${win ? '+' : '-'}${valor} 🪙\nSaldo: **${c.carteira}**`, { image: win ? BLUU.dance : BLUU.face })]
            });
        }
        if (cmd === 'doar') {
            const alvo = options.getUser('usuario');
            const valor = options.getInteger('valor');
            if (alvo.id === user.id) return interaction.reply({ content: 'Não pode doar pra si.', ephemeral: true });
            const c = iniciarConta(user.id);
            const t = iniciarConta(alvo.id);
            if (c.carteira < valor) return interaction.reply({ content: 'Saldo insuficiente.', ephemeral: true });
            c.carteira -= valor;
            t.carteira += valor;
            persistBanco();
            return interaction.reply({ embeds: [emb('💝 Doação', `Você doou **${valor}** 🪙 para **${alvo.username}**`, { thumb: BLUU.face })] });
        }
        if (cmd === 'roubar') {
            const cd = checkCd(user.id, 'roubar', 10 * 60 * 1000);
            if (cd) return interaction.reply({ content: `Espere **${formatTime(cd)}**.`, ephemeral: true });
            const alvo = options.getUser('usuario');
            if (alvo.id === user.id || alvo.bot) return interaction.reply({ content: 'Alvo inválido.', ephemeral: true });
            const c = iniciarConta(user.id);
            const t = iniciarConta(alvo.id);
            if (t.carteira < 50) return interaction.reply({ content: 'Alvo muito pobre.', ephemeral: true });
            if (Math.random() < 0.4) {
                const q = Math.floor(t.carteira * (0.1 + Math.random() * 0.2));
                t.carteira -= q;
                c.carteira += q;
                persistBanco();
                return interaction.reply({ embeds: [emb('🕵️ Roubo!', `Você roubou **${q}** 🪙 de **${alvo.username}**`, { image: BLUU.dance })] });
            }
            const multa = Math.min(c.carteira, 30 + Math.floor(Math.random() * 50));
            c.carteira -= multa;
            persistBanco();
            return interaction.reply({ embeds: [emb('🚨 Pego!', `Você pagou **${multa}** 🪙 de multa`, { thumb: BLUU.face })] });
        }
        if (cmd === 'crime') {
            const cd = checkCd(user.id, 'crime', 8 * 60 * 1000);
            if (cd) return interaction.reply({ content: `Espere **${formatTime(cd)}**.`, ephemeral: true });
            const c = iniciarConta(user.id);
            if (Math.random() < 0.5) {
                const g = 80 + Math.floor(Math.random() * 120);
                c.carteira += g;
                persistBanco();
                return interaction.reply({ embeds: [emb('🕶️ Crime sucesso', `+**${g}** 🪙`, { image: BLUU.dance })] });
            }
            const m = Math.min(c.carteira, 40 + Math.floor(Math.random() * 60));
            c.carteira -= m;
            persistBanco();
            return interaction.reply({ embeds: [emb('🚔 Falhou', `−**${m}** 🪙`, { thumb: BLUU.face })] });
        }
        if (cmd === 'slots') {
            const valor = options.getInteger('valor');
            const c = iniciarConta(user.id);
            if (c.carteira < valor) return interaction.reply({ content: 'Saldo insuficiente.', ephemeral: true });
            const icons = ['🍒', '🍋', '🍇', '💎', '7️⃣', '💙'];
            const a = icons[Math.floor(Math.random() * icons.length)];
            const b = icons[Math.floor(Math.random() * icons.length)];
            const d = icons[Math.floor(Math.random() * icons.length)];
            let result = `\` ${a} | ${b} | ${d} \``;
            if (a === b && b === d) {
                const mult = a === '💎' || a === '7️⃣' || a === '💙' ? 5 : 3;
                c.carteira += valor * mult;
                result += `\n🎉 **x${mult}!** +${valor * mult} 🪙`;
            } else {
                c.carteira -= valor;
                result += `\n−${valor} 🪙`;
            }
            persistBanco();
            return interaction.reply({ embeds: [emb('🎰 Slots', result + `\nSaldo: **${c.carteira}**`, { image: BLUU.dance })] });
        }
        if (cmd === 'ranking') {
            const sorted = [...banco.entries()]
                .map(([id, v]) => ({ id, total: (v.carteira || 0) + (v.banco || 0) }))
                .sort((a, b) => b.total - a.total)
                .slice(0, 10);
            const lines = sorted.map((x, i) => `**${i + 1}.** <@${x.id}> — **${x.total}** 🪙`).join('\n') || 'Vazio';
            return interaction.reply({ embeds: [emb('🏆 Ranking', lines, { image: BLUU.dance })] });
        }
        if (cmd === 'depositar') {
            const valor = options.getInteger('valor');
            const c = iniciarConta(user.id);
            if (c.carteira < valor) return interaction.reply({ content: 'Saldo insuficiente.', ephemeral: true });
            c.carteira -= valor;
            c.banco += valor;
            persistBanco();
            return interaction.reply({ embeds: [emb('🏦 Depósito', `**${valor}** 🪙 guardados`, { thumb: BLUU.face })] });
        }
        if (cmd === 'sacar') {
            const valor = options.getInteger('valor');
            const c = iniciarConta(user.id);
            if (c.banco < valor) return interaction.reply({ content: 'Banco insuficiente.', ephemeral: true });
            c.banco -= valor;
            c.carteira += valor;
            persistBanco();
            return interaction.reply({ embeds: [emb('🏦 Saque', `**${valor}** 🪙 sacados`, { thumb: BLUU.face })] });
        }

        // ---- DIVERSÃO ----
        if (cmd === 'meme') {
            return interaction.reply({ embeds: [emb('😂 Meme', 'tem bluudude get in nowww!!!', { image: BLUU.dance })] });
        }
        if (cmd === 'dado') {
            const lados = options.getInteger('lados') || 6;
            const r = 1 + Math.floor(Math.random() * lados);
            return interaction.reply({ embeds: [emb('🎲 Dado', `d${lados}: **${r}**`, { thumb: BLUU.face })] });
        }
        if (cmd === 'moeda') {
            const r = Math.random() < 0.5 ? 'Cara' : 'Coroa';
            return interaction.reply({ embeds: [emb('🪙 Moeda', `**${r}**`, { image: BLUU.dance })] });
        }
        if (cmd === '8ball') {
            const resp = ['Sim', 'Não', 'Talvez', 'Com certeza', 'Mwehehe... não', 'Things are getting a whole lot bluer — sim!', 'Pergunta de novo'];
            return interaction.reply({ embeds: [emb('🎱 8ball', `**${resp[Math.floor(Math.random() * resp.length)]}**`, { thumb: BLUU.face })] });
        }
        if (cmd === 'ship') {
            const u1 = options.getUser('user1');
            const u2 = options.getUser('user2');
            const pct = Math.floor(Math.random() * 101);
            const bar = '█'.repeat(Math.floor(pct / 10)) + '░'.repeat(10 - Math.floor(pct / 10));
            return interaction.reply({ embeds: [emb('💘 Ship', `**${u1.username}** + **${u2.username}**\n\`${bar}\` **${pct}%**`, { image: BLUU.dance })] });
        }
        if (cmd === 'abracar') {
            const u = options.getUser('usuario');
            return interaction.reply({ embeds: [emb('🤗 Abraço', `**${user.username}** abraçou **${u.username}**`, { image: BLUU.dance })] });
        }
        if (cmd === 'beijar') {
            const u = options.getUser('usuario');
            return interaction.reply({ embeds: [emb('💋 Beijo', `**${user.username}** beijou **${u.username}**`, { image: BLUU.dance })] });
        }
        if (cmd === 'tapa') {
            const u = options.getUser('usuario');
            return interaction.reply({ embeds: [emb('👋 Tapa', `**${user.username}** deu um tapa em **${u.username}**`, { image: BLUU.dance })] });
        }
        if (cmd === 'cantada') {
            const list = [
                'Você é azul como eu? Porque things are getting a whole lot bluer…',
                'Tem bluudude no meu coração — get in nowww!!!',
                'Seu sorriso tem mais frames que meu bluudanc.'
            ];
            return interaction.reply({ embeds: [emb('😏 Cantada', list[Math.floor(Math.random() * list.length)], { image: BLUU.dance })] });
        }
        if (cmd === 'piada') {
            const list = [
                'Por que o Bluudud não usa espada? Porque ele prefere pirulito.',
                'O que o Bluudud fala no mic? Mwehehe!',
                'Qual o streaming do Bluudud? 24/7 matando survivor (de mentira).'
            ];
            return interaction.reply({ embeds: [emb('🤣 Piada', list[Math.floor(Math.random() * list.length)], { thumb: BLUU.face })] });
        }
        if (cmd === 'elogiar') {
            const u = options.getUser('usuario');
            return interaction.reply({ embeds: [emb('✨ Elogio', `**${u.username}** é mais cool que o Bluudud (quase).`, { image: BLUU.dance })] });
        }
        if (cmd === 'zoar') {
            const u = options.getUser('usuario');
            return interaction.reply({ embeds: [emb('😈 Zoas', `**${u.username}** tem skill issue. Mwehehe!`, { image: BLUU.dance })] });
        }
        if (cmd === 'howgay' || cmd === 'rizz' || cmd === 'qi' || cmd === 'gado') {
            const u = options.getUser('usuario') || user;
            const n = Math.floor(Math.random() * 101);
            const labels = { howgay: '🏳️‍🌈 How gay', rizz: '😎 Rizz', qi: '🧠 QI', gado: '🐄 Gado' };
            return interaction.reply({ embeds: [emb(labels[cmd], `**${u.username}**: **${n}%**` + (cmd === 'qi' ? ` (QI ${60 + n})` : ''), { thumb: BLUU.face })] });
        }
        if (cmd === 'chances') {
            const n = Math.floor(Math.random() * 101);
            return interaction.reply({ embeds: [emb('📊 Chances', `**${options.getString('texto')}**\n→ **${n}%**`, { thumb: BLUU.face })] });
        }
        if (cmd === 'escolha') {
            const ops = options.getString('opcoes').split(',').map(s => s.trim()).filter(Boolean);
            const win = ops[Math.floor(Math.random() * ops.length)] || '?';
            return interaction.reply({ embeds: [emb('🔀 Escolha', `**${win}**`, { image: BLUU.dance })] });
        }
        if (cmd === 'diga') {
            return interaction.reply({ embeds: [emb('🗣️', options.getString('texto'), { thumb: BLUU.face })] });
        }
        if (cmd === 'votar') {
            const msg = await interaction.reply({
                embeds: [emb('📊 Votação', options.getString('pergunta'), { thumb: BLUU.face })],
                fetchReply: true
            });
            await msg.react('👍');
            await msg.react('👎');
            return;
        }
        if (cmd === 'reverso') {
            const t = options.getString('texto').split('').reverse().join('');
            return interaction.reply({ embeds: [emb('🔄 Reverso', t, { thumb: BLUU.face })] });
        }
        if (cmd === 'jokenpo') {
            const escolha = options.getString('escolha');
            const ops = ['pedra', 'papel', 'tesoura'];
            const bot = ops[Math.floor(Math.random() * 3)];
            let res = 'Empate!';
            if (
                (escolha === 'pedra' && bot === 'tesoura') ||
                (escolha === 'papel' && bot === 'pedra') ||
                (escolha === 'tesoura' && bot === 'papel')
            ) res = 'Você ganhou! 🎉';
            else if (escolha !== bot) res = 'Bluudud ganhou! Mwehehe';
            return interaction.reply({ embeds: [emb('✊ Jokenpô', `Você: **${escolha}**\nBot: **${bot}**\n${res}`, { image: BLUU.dance })] });
        }
        if (cmd === 'roleta') {
            const morto = Math.random() < 1 / 6;
            return interaction.reply({
                embeds: [emb('🔫 Roleta', morto ? '💥 BANG! Você perdeu.' : '😮‍💨 Clique vazio. Sobreviveu!', { image: morto ? BLUU.face : BLUU.dance })]
            });
        }
        if (cmd === 'adivinhe') {
            const n = options.getInteger('numero');
            const secret = 1 + Math.floor(Math.random() * 10);
            return interaction.reply({
                embeds: [emb('🔢 Adivinhe', n === secret ? `Acertou! Era **${secret}**` : `Errou. Era **${secret}**`, { thumb: BLUU.face })]
            });
        }
        if (cmd === 'bluudanc' || cmd === 'bluudud') {
            return interaction.reply({
                embeds: [emb('💙 Bluudanc!', 'yayyy wahooo weeeeee\n*tem bluudude get in nowww!!!*', {
                    image: BLUU.dance,
                    footer: 'Bluudud · Forsaken'
                })]
            });
        }
        if (cmd === 'senha') {
            const len = options.getInteger('tamanho') || 16;
            const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*';
            let s = '';
            for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
            return interaction.reply({ embeds: [emb('🔐 Senha', `\`${s}\``, { thumb: BLUU.face })], ephemeral: true });
        }

        // ---- AFK ----
        if (cmd === 'afk') {
            const motivo = options.getString('motivo') || 'AFK';
            afkMap.set(user.id, motivo);
            return interaction.reply({ embeds: [emb('💤 AFK', `Status: **${motivo}**`, { thumb: BLUU.face })] });
        }

    } catch (err) {
        console.error(`Erro /${cmd}:`, err);
        const payload = { content: 'Erro ao executar o comando.', ephemeral: true };
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(payload).catch(() => {});
        } else {
            await interaction.reply(payload).catch(() => {});
        }
    }
});

client.login(process.env.TOKEN).catch(err => {
    console.error('Falha no login do bot:', err.message);
    process.exit(1);
});

// ==================== EXPRESS + OAUTH2 ====================
const app = express();
app.set('trust proxy', 1);

const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RENDER;

if (isProduction && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'ronaldo2627')) {
    console.warn('⚠️ SESSION_SECRET fraco ou não definido! Defina um valor forte no ambiente.');
}

app.use(session({
    secret: process.env.SESSION_SECRET || 'bluudud-troque-este-segredo',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 7
    }
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || (
    process.env.RENDER_EXTERNAL_HOSTNAME
        ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/callback`
        : 'http://localhost:3000/callback'
);

app.get('/login', (req, res) => {
    if (!CLIENT_ID) {
        return res.status(500).send('CLIENT_ID não configurado no ambiente.');
    }
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: 'identify guilds'
    });
    res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get('/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.redirect('/?error=no_code');
    if (!CLIENT_ID || !CLIENT_SECRET) {
        return res.status(500).send('CLIENT_ID ou CLIENT_SECRET faltando.');
    }

    try {
        const tokenRes = await axios.post(
            'https://discord.com/api/v10/oauth2/token',
            new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                redirect_uri: REDIRECT_URI
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const accessToken = tokenRes.data.access_token;

        const userRes = await axios.get('https://discord.com/api/v10/users/@me', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        req.session.user = userRes.data;
        req.session.token = accessToken;
        res.redirect('/');
    } catch (err) {
        console.error('OAuth error:', err.response?.data || err.message);
        res.status(500).send('Erro ao autenticar com o Discord');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

app.get('/api/me', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Não autenticado' });
    res.json(req.session.user);
});

app.get('/api/servers', async (req, res) => {
    if (!req.session.user || !req.session.token) {
        return res.status(401).json({ error: 'Não autenticado' });
    }
    try {
        const response = await axios.get('https://discord.com/api/v10/users/@me/guilds', {
            headers: { Authorization: `Bearer ${req.session.token}` }
        });
        const ADMIN = 0x8n;
        const MANAGE = 0x20n;
        const guilds = response.data
            .filter(g => {
                const p = BigInt(g.permissions);
                return (p & ADMIN) === ADMIN || (p & MANAGE) === MANAGE;
            })
            .map(g => ({ id: g.id, name: g.name, icon: g.icon, owner: g.owner }));
        res.json(guilds);
    } catch (err) {
        console.error('/api/servers', err.response?.data || err.message);
        res.status(500).json({ error: 'Erro ao carregar servidores' });
    }
});

app.get('/api/welcome/:guildId', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Não autenticado' });
    const cfg = configBoasVindas.get(req.params.guildId) || {};
    res.json({
        channelId: cfg.canalId || null,
        roleId: cfg.cargoId || null,
        message: cfg.mensagem || null
    });
});

app.post('/api/welcome/:guildId', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Não autenticado' });
    const { channelId, message, roleId } = req.body;
    if (!configBoasVindas.has(req.params.guildId)) configBoasVindas.set(req.params.guildId, {});
    const cfg = configBoasVindas.get(req.params.guildId);
    if (channelId !== undefined) cfg.canalId = channelId || null;
    if (message !== undefined) cfg.mensagem = message || null;
    if (roleId !== undefined) cfg.cargoId = roleId || null;
    persistConfig();
    res.json({ success: true });
});

app.post('/api/welcome/:guildId/test', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Não autenticado' });
    const cfg = configBoasVindas.get(req.params.guildId);
    if (!cfg?.canalId) return res.status(400).json({ error: 'Nenhum canal configurado' });
    const g = client.guilds.cache.get(req.params.guildId);
    if (!g) return res.status(404).json({ error: 'Bot não está no servidor' });
    const ch = g.channels.cache.get(cfg.canalId);
    if (!ch) return res.status(404).json({ error: 'Canal não encontrado' });

    let texto = cfg.mensagem || 'Seja bem-vindo(a)!';
    texto = texto
        .replace(/{membro}/g, `<@${req.session.user.id}>`)
        .replace(/{servidor}/g, g.name)
        .replace(/{total}/g, g.memberCount);

    try {
        await ch.send({
            embeds: [emb('✨ Teste de boas-vindas', texto, { image: BLUU.dance })]
        });
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Erro ao enviar' });
    }
});

// ==================== IA SÓ NO SITE ====================
app.post('/api/ai', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Não autenticado' });
    const { message } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'Mensagem inválida' });
    }
    if (message.length > 1000) return res.status(400).json({ error: 'Muito longa' });
    try {
        const reply = await askGroq(message.trim());
        res.json({ reply });
    } catch {
        res.status(500).json({ error: 'Erro na IA' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Dashboard OAuth na porta ${PORT}`));