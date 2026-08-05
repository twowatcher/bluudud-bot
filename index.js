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

// ==================== PERSISTÊNCIA ====================
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

const banco = new Map(Object.entries(loadJSON('banco.json', {})));
const configBoasVindas = new Map(Object.entries(loadJSON('config.json', {})));
const warns = new Map(Object.entries(loadJSON('warns.json', {})));
const levels = new Map(Object.entries(loadJSON('levels.json', {})));
const inventory = new Map(Object.entries(loadJSON('inventory.json', {})));
const reps = new Map(Object.entries(loadJSON('reps.json', {})));
const marriages = new Map(Object.entries(loadJSON('marriages.json', {})));
const cooldowns = new Map();
const afkMap = new Map();
const customStatus = new Map();

function persistBanco() { saveJSON('banco.json', Object.fromEntries(banco)); }
function persistConfig() { saveJSON('config.json', Object.fromEntries(configBoasVindas)); }
function persistWarns() { saveJSON('warns.json', Object.fromEntries(warns)); }
function persistLevels() { saveJSON('levels.json', Object.fromEntries(levels)); }
function persistInventory() { saveJSON('inventory.json', Object.fromEntries(inventory)); }
function persistReps() { saveJSON('reps.json', Object.fromEntries(reps)); }
function persistMarriages() { saveJSON('marriages.json', Object.fromEntries(marriages)); }

const iniciarConta = (id) => {
    if (!banco.has(id)) {
        banco.set(id, { carteira: 100, banco: 0 });
        persistBanco();
    }
    return banco.get(id);
};

function getLevelData(id) {
    if (!levels.has(id)) {
        levels.set(id, { xp: 0, level: 1 });
        persistLevels();
    }
    return levels.get(id);
}

function xpForLevel(level) {
    return 100 + (level - 1) * 50;
}

function addXP(userId, amount) {
    const data = getLevelData(userId);
    data.xp += amount;
    let leveled = false;
    while (data.xp >= xpForLevel(data.level)) {
        data.xp -= xpForLevel(data.level);
        data.level++;
        leveled = true;
    }
    persistLevels();
    return { leveled, level: data.level, xp: data.xp };
}

function getInv(id) {
    if (!inventory.has(id)) {
        inventory.set(id, {});
        persistInventory();
    }
    return inventory.get(id);
}

const LOJA = {
    pocao: { preco: 150, desc: 'Ganha +50 XP' },
    caixa: { preco: 300, desc: 'Caixa misteriosa (coins aleatórios)' },
    anel: { preco: 500, desc: 'Necessário para casar' },
    vip: { preco: 2000, desc: 'Título VIP (cosmético)' }
};

// ==================== BLUU ====================
const BLUU = {
    color: 0x4db8ff,
    dance: 'https://forsaken.wiki/Special:FilePath/Emotec00lbluudud_CurrentDance.gif',
    face: 'https://forsaken.wiki/Special:FilePath/VeeronicaGrafitti_Bluudud.png',
    thumb: 'https://forsaken.wiki/Special:FilePath/VeeronicaGrafitti_Bluudud.png'
};

function emb(title, desc, opts = {}) {
    const e = new EmbedBuilder().setColor(opts.color ?? BLUU.color).setTimestamp();
    if (title) e.setTitle(title);
    if (desc) e.setDescription(desc);
    if (opts.footer) e.setFooter({ text: opts.footer });
    if (opts.thumb) e.setThumbnail(opts.thumb);
    if (opts.image) e.setImage(opts.image);
    if (opts.fields) e.addFields(opts.fields);
    if (opts.author) e.setAuthor(opts.author);
    return e;
}

// ==================== GROQ ====================
async function askGroq(prompt, systemExtra = '') {
    const key = process.env.GROQ_API_KEY;
    if (!key) return '⚠️ GROQ_API_KEY não configurada.';
    const system = `Você é o Bluudud, personagem azul de Forsaken (Roblox).
Fale em português brasileiro, divertido, meio streamer, meio troll inocente.
Use "mwehehe". Respostas curtas a médias.
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
            console.error('Groq error:', await res.text());
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
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${seconds}s`;
}

// ==================== COMMANDS ====================
const commandsData = [
    // ===== CONFIG (3) =====
    { name: 'config-boasvindas', description: 'Define o canal de boas-vindas', options: [{ name: 'canal', description: 'Canal de texto', type: ApplicationCommandOptionType.Channel, channelTypes: [ChannelType.GuildText], required: true }] },
    { name: 'config-mensagem', description: 'Mensagem de boas-vindas', options: [{ name: 'mensagem', description: 'Use {membro} {servidor} {total}', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'config-cargo', description: 'Cargo automático de boas-vindas', options: [{ name: 'cargo', description: 'Cargo', type: ApplicationCommandOptionType.Role, required: true }] },

    // ===== UTIL (10) =====
    { name: 'ping', description: 'Latência do bot' },
    { name: 'ajuda', description: 'Lista de comandos' },
    { name: 'serverinfo', description: 'Info do servidor' },
    { name: 'userinfo', description: 'Info de um usuário', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'avatar', description: 'Avatar de alguém', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'uptime', description: 'Tempo online do bot' },
    { name: 'convite', description: 'Link de convite do bot' },
    { name: 'falar', description: 'Bot fala algo', options: [{ name: 'texto', description: 'Texto', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'calculadora', description: 'Calcula expressão', options: [{ name: 'expressao', description: 'Expressão matemática', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'sorteio', description: 'Sorteia entre opções', options: [{ name: 'opcoes', description: 'Separe por vírgula', type: ApplicationCommandOptionType.String, required: true }] },

    // ===== MOD (13) =====
    { name: 'limpar', description: 'Apaga mensagens', options: [{ name: 'quantidade', description: '1 a 100', type: ApplicationCommandOptionType.Integer, required: true, min_value: 1, max_value: 100 }] },
    { name: 'expulsar', description: 'Expulsa um membro', options: [
        { name: 'usuario', description: 'Membro', type: ApplicationCommandOptionType.User, required: true },
        { name: 'motivo', description: 'Motivo', type: ApplicationCommandOptionType.String, required: false }
    ]},
    { name: 'banir', description: 'Bane um membro', options: [
        { name: 'usuario', description: 'Membro', type: ApplicationCommandOptionType.User, required: true },
        { name: 'motivo', description: 'Motivo', type: ApplicationCommandOptionType.String, required: false }
    ]},
    { name: 'desbanir', description: 'Remove ban', options: [{ name: 'id', description: 'ID do usuário', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'mutar', description: 'Timeout', options: [
        { name: 'usuario', description: 'Membro', type: ApplicationCommandOptionType.User, required: true },
        { name: 'minutos', description: 'Duração em minutos', type: ApplicationCommandOptionType.Integer, required: true, min_value: 1, max_value: 40320 },
        { name: 'motivo', description: 'Motivo', type: ApplicationCommandOptionType.String, required: false }
    ]},
    { name: 'desmutar', description: 'Remove timeout', options: [{ name: 'usuario', description: 'Membro', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'lock', description: 'Tranca o canal' },
    { name: 'unlock', description: 'Destranca o canal' },
    { name: 'modolento', description: 'Slowmode', options: [{ name: 'segundos', description: 'Segundos (0 = off)', type: ApplicationCommandOptionType.Integer, required: true, min_value: 0, max_value: 21600 }] },
    { name: 'warn', description: 'Avisa um membro', options: [
        { name: 'usuario', description: 'Membro', type: ApplicationCommandOptionType.User, required: true },
        { name: 'motivo', description: 'Motivo', type: ApplicationCommandOptionType.String, required: false }
    ]},
    { name: 'warns', description: 'Lista warns', options: [{ name: 'usuario', description: 'Membro', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'clearwarns', description: 'Limpa warns', options: [{ name: 'usuario', description: 'Membro', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'setnick', description: 'Muda apelido', options: [
        { name: 'usuario', description: 'Membro', type: ApplicationCommandOptionType.User, required: true },
        { name: 'apelido', description: 'Novo apelido', type: ApplicationCommandOptionType.String, required: true }
    ]},

    // ===== ECONOMIA (15) =====
    { name: 'saldo', description: 'Seu saldo', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'daily', description: 'Recompensa diária' },
    { name: 'trabalhar', description: 'Trabalha e ganha coins' },
    { name: 'apostar', description: 'Aposta coins', options: [{ name: 'valor', description: 'Valor', type: ApplicationCommandOptionType.Integer, required: true, min_value: 1 }] },
    { name: 'doar', description: 'Doa coins', options: [
        { name: 'usuario', description: 'Quem recebe', type: ApplicationCommandOptionType.User, required: true },
        { name: 'valor', description: 'Valor', type: ApplicationCommandOptionType.Integer, required: true, min_value: 1 }
    ]},
    { name: 'roubar', description: 'Tenta roubar', options: [{ name: 'usuario', description: 'Alvo', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'crime', description: 'Comete um crime' },
    { name: 'slots', description: 'Caça-níqueis', options: [{ name: 'valor', description: 'Valor (mín 10)', type: ApplicationCommandOptionType.Integer, required: true, min_value: 10 }] },
    { name: 'ranking', description: 'Top ricos' },
    { name: 'depositar', description: 'Deposita no banco', options: [{ name: 'valor', description: 'Valor', type: ApplicationCommandOptionType.Integer, required: true, min_value: 1 }] },
    { name: 'sacar', description: 'Saca do banco', options: [{ name: 'valor', description: 'Valor', type: ApplicationCommandOptionType.Integer, required: true, min_value: 1 }] },
    { name: 'loja', description: 'Mostra a loja' },
    { name: 'comprar', description: 'Compra item', options: [{ name: 'item', description: 'Nome do item', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'inventario', description: 'Seu inventário', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'usar', description: 'Usa um item', options: [{ name: 'item', description: 'Item', type: ApplicationCommandOptionType.String, required: true }] },

    // ===== NÍVEL (4) =====
    { name: 'rank', description: 'Mostra nível/XP', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'topnivel', description: 'Ranking de níveis' },
    { name: 'setnivel', description: 'Define nível (staff)', options: [
        { name: 'usuario', description: 'Membro', type: ApplicationCommandOptionType.User, required: true },
        { name: 'nivel', description: 'Nível', type: ApplicationCommandOptionType.Integer, required: true, min_value: 1, max_value: 500 }
    ]},
    { name: 'resetnivel', description: 'Reseta nível (staff)', options: [{ name: 'usuario', description: 'Membro', type: ApplicationCommandOptionType.User, required: true }] },

    // ===== SOCIAL (6) =====
    { name: 'perfil', description: 'Perfil completo', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'rep', description: 'Dá reputação', options: [{ name: 'usuario', description: 'Quem recebe', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'casar', description: 'Pede em casamento', options: [{ name: 'usuario', description: 'Pessoa', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'divorciar', description: 'Se divorcia' },
    { name: 'status', description: 'Status personalizado', options: [{ name: 'texto', description: 'Seu status', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'afk', description: 'Define status AFK', options: [{ name: 'motivo', description: 'Motivo', type: ApplicationCommandOptionType.String, required: false }] },

    // ===== DIVERSÃO (25) =====
    { name: 'meme', description: 'Meme Bluudud' },
    { name: 'dado', description: 'Rola um dado', options: [{ name: 'lados', description: 'Lados (padrão 6)', type: ApplicationCommandOptionType.Integer, required: false, min_value: 2, max_value: 100 }] },
    { name: 'moeda', description: 'Cara ou coroa' },
    { name: '8ball', description: 'Pergunta mágica', options: [{ name: 'pergunta', description: 'Pergunta', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'ship', description: 'Ship de dois usuários', options: [
        { name: 'user1', description: 'Pessoa 1', type: ApplicationCommandOptionType.User, required: true },
        { name: 'user2', description: 'Pessoa 2', type: ApplicationCommandOptionType.User, required: true }
    ]},
    { name: 'abracar', description: 'Abraça alguém', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'beijar', description: 'Beija alguém', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'tapa', description: 'Dá um tapa', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'cantada', description: 'Cantada aleatória' },
    { name: 'piada', description: 'Piada aleatória' },
    { name: 'elogiar', description: 'Elogia alguém', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'zoar', description: 'Zoa alguém', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'howgay', description: 'Medidor how gay', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'rizz', description: 'Nível de rizz', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'qi', description: 'QI aleatório', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'gado', description: 'Nível de gado', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'chances', description: 'Chances de algo', options: [{ name: 'texto', description: 'Texto', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'escolha', description: 'Escolhe entre opções', options: [{ name: 'opcoes', description: 'Separe por vírgula', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'jokenpo', description: 'Pedra papel tesoura', options: [{ name: 'escolha', description: 'Sua escolha', type: ApplicationCommandOptionType.String, required: true, choices: [
        { name: 'Pedra', value: 'pedra' }, { name: 'Papel', value: 'papel' }, { name: 'Tesoura', value: 'tesoura' }
    ]}]},
    { name: 'roleta', description: 'Roleta russa' },
    { name: 'adivinhe', description: 'Adivinhe 1-10', options: [{ name: 'numero', description: 'Palpite', type: ApplicationCommandOptionType.Integer, required: true, min_value: 1, max_value: 10 }] },
    { name: 'bluudanc', description: 'Bluudud dançando' },
    { name: 'bluudud', description: 'Info / GIF Bluudud' },
    { name: 'senha', description: 'Gera senha forte', options: [{ name: 'tamanho', description: 'Tamanho 6-64', type: ApplicationCommandOptionType.Integer, required: false, min_value: 6, max_value: 64 }] },
    { name: 'pp', description: 'Tamanho do pp', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },

    // ===== IA (4) =====
    { name: 'ai', description: 'Conversa com a IA Bluudud', options: [{ name: 'mensagem', description: 'Sua mensagem', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'traduzir', description: 'Traduz texto', options: [
        { name: 'texto', description: 'Texto para traduzir', type: ApplicationCommandOptionType.String, required: true },
        { name: 'idioma', description: 'Idioma destino', type: ApplicationCommandOptionType.String, required: false }
    ]},
    { name: 'resumir', description: 'Resume texto', options: [{ name: 'texto', description: 'Texto para resumir', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'corrigir', description: 'Corrige gramática', options: [{ name: 'texto', description: 'Texto para corrigir', type: ApplicationCommandOptionType.String, required: true }] }
];

// ==================== READY ====================
client.once('ready', async () => {
    console.log(`💙 Bluudud online como ${client.user.tag}`);
    console.log(`Servidores: ${client.guilds.cache.size}`);

    try {
        const GUILD_ID = process.env.GUILD_ID || '1529716247468703795';
        const guild = client.guilds.cache.get(GUILD_ID);

        if (guild) {
            await guild.commands.set(commandsData);
            console.log(`✅ ${commandsData.length} comandos registrados no servidor: ${guild.name}`);
        } else {
            console.log('❌ Servidor não encontrado. IDs disponíveis:');
            client.guilds.cache.forEach(g => console.log(` - ${g.name} (${g.id})`));
            await client.application.commands.set(commandsData);
            console.log(`⚠️ Comandos registrados globalmente (${commandsData.length})`);
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

    try {
        await ch.send({
            embeds: [emb('✨ Nova chegada!', msg, {
                image: BLUU.dance,
                thumb: member.user.displayAvatarURL({ size: 128 }),
                footer: 'Bluudud Bot · Forsaken vibes'
            })]
        });
        if (cfg.cargoId) {
            const role = member.guild.roles.cache.get(cfg.cargoId);
            if (role) await member.roles.add(role).catch(() => {});
        }
    } catch (e) {
        console.error('Welcome error:', e.message);
    }
});

// ==================== MESSAGE (AFK + XP) ====================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    if (afkMap.has(message.author.id)) {
        afkMap.delete(message.author.id);
        message.reply({ embeds: [emb('👋 Bem-vindo de volta!', 'Seu status AFK foi removido.', { thumb: BLUU.face })] }).catch(() => {});
    }

    if (message.mentions.users.size > 0) {
        for (const [, u] of message.mentions.users) {
            if (afkMap.has(u.id)) {
                message.reply({ embeds: [emb('💤 Usuário AFK', `**${u.username}** está AFK: ${afkMap.get(u.id)}`, { thumb: BLUU.face })] }).catch(() => {});
            }
        }
    }

    const cd = checkCd(message.author.id, 'xp', 45 * 1000);
    if (!cd) {
        const ganho = 15 + Math.floor(Math.random() * 16);
        const result = addXP(message.author.id, ganho);
        if (result.leveled) {
            message.channel.send({
                embeds: [emb('🎉 Level Up!', `**${message.author.username}** subiu para o nível **${result.level}**! Mwehehe`, { image: BLUU.dance })]
            }).catch(() => {});
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
            if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            const canal = options.getChannel('canal');
            if (!configBoasVindas.has(guild.id)) configBoasVindas.set(guild.id, {});
            configBoasVindas.get(guild.id).canalId = canal.id;
            persistConfig();
            return interaction.reply({ embeds: [emb('✅ Canal definido', `Boas-vindas em ${canal}`, { image: BLUU.dance })] });
        }
        if (cmd === 'config-mensagem') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            if (!configBoasVindas.has(guild.id)) configBoasVindas.set(guild.id, {});
            configBoasVindas.get(guild.id).mensagem = options.getString('mensagem');
            persistConfig();
            return interaction.reply({ embeds: [emb('✅ Mensagem salva', options.getString('mensagem'), { thumb: BLUU.face })] });
        }
        if (cmd === 'config-cargo') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
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
                        { name: '🛡️ Mod', value: '`/limpar` `/expulsar` `/banir` `/mutar` `/warn` `/lock`' },
                        { name: '💰 Eco', value: '`/saldo` `/daily` `/trabalhar` `/loja` `/slots` `/ranking`' },
                        { name: '📊 Nível', value: '`/rank` `/nivel` `/topnivel`' },
                        { name: '😂 Fun', value: '`/meme` `/8ball` `/ship` `/bluudanc` `/jokenpo`' },
                        { name: '🤖 IA', value: '`/ai` `/traduzir` `/resumir` `/corrigir`' }
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
            if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            await interaction.reply({ content: 'Enviado!', ephemeral: true });
            return interaction.channel.send(options.getString('texto'));
        }
        if (cmd === 'calculadora') {
            const expr = options.getString('expressao').replace(/[^0-9+\-*/().%\s]/g, '');
            try {
                const r = Function(`"use strict"; return (${expr})`)();
                if (typeof r !== 'number' || !isFinite(r)) throw new Error();
                return interaction.reply({ embeds: [emb('🧮 Resultado', `**${r}**`, { thumb: BLUU.face })] });
            } catch {
                return interaction.reply({ content: 'Expressão inválida.', ephemeral: true });
            }
        }
        if (cmd === 'sorteio') {
            const ops = options.getString('opcoes').split(',').map(s => s.trim()).filter(Boolean);
            if (ops.length < 2) return interaction.reply({ content: 'Precisa de 2+ opções.', ephemeral: true });
            return interaction.reply({ embeds: [emb('🎲 Sorteio', `Resultado: **${ops[Math.floor(Math.random() * ops.length)]}**`, { image: BLUU.dance })] });
        }
        if (cmd === 'regras') {
            return interaction.reply({ embeds: [emb('📜 Regras sugeridas', '1. Respeito\n2. Sem spam\n3. Sem NSFW\n4. Ouça a staff\n5. Divirta-se!', { image: BLUU.dance })] });
        }
        if (cmd === 'links') {
            return interaction.reply({ embeds: [emb('🔗 Links', 'Dashboard + Discord Developer Portal', { thumb: BLUU.face })] });
        }
        if (cmd === 'base64') {
            const modo = options.getString('modo');
            const texto = options.getString('texto');
            try {
                const r = modo === 'encode' ? Buffer.from(texto).toString('base64') : Buffer.from(texto, 'base64').toString('utf8');
                return interaction.reply({ embeds: [emb('🔤 Base64', `\`${r}\``, { thumb: BLUU.face })] });
            } catch {
                return interaction.reply({ content: 'Erro na conversão.', ephemeral: true });
            }
        }
        if (cmd === 'binario') {
            const modo = options.getString('modo');
            const texto = options.getString('texto');
            try {
                if (modo === 'encode') {
                    const r = texto.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
                    return interaction.reply({ embeds: [emb('🔢 Binário', `\`${r}\``, { thumb: BLUU.face })] });
                }
                const r = texto.split(' ').map(b => String.fromCharCode(parseInt(b, 2))).join('');
                return interaction.reply({ embeds: [emb('🔢 Binário', r, { thumb: BLUU.face })] });
            } catch {
                return interaction.reply({ content: 'Erro.', ephemeral: true });
            }
        }
        if (cmd === 'hex') {
            const r = Buffer.from(options.getString('texto')).toString('hex');
            return interaction.reply({ embeds: [emb('#️⃣ Hex', `\`${r}\``, { thumb: BLUU.face })] });
        }
        if (cmd === 'morse') {
            const map = { a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....', i: '..', j: '.---', k: '-.-', l: '.-..', m: '--', n: '-.', o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..', ' ': '/' };
            const r = options.getString('texto').toLowerCase().split('').map(c => map[c] || c).join(' ');
            return interaction.reply({ embeds: [emb('📡 Morse', `\`${r}\``, { thumb: BLUU.face })] });
        }
        if (cmd === 'lembrete') {
            const min = options.getInteger('minutos');
            const texto = options.getString('texto');
            await interaction.reply({ embeds: [emb('⏰ Lembrete', `Vou te lembrar em **${min} min**: ${texto}`, { thumb: BLUU.face })] });
            setTimeout(() => {
                interaction.channel.send({ content: `<@${user.id}>`, embeds: [emb('⏰ Lembrete!', texto, { image: BLUU.dance })] }).catch(() => {});
            }, min * 60 * 1000);
            return;
        }
        if (cmd === 'tempo') {
            return interaction.reply({ embeds: [emb('🕐 Agora', `<t:${Math.floor(Date.now() / 1000)}:F>`, { thumb: BLUU.face })] });
        }

        // ---- MOD ----
        if (cmd === 'limpar') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            const q = options.getInteger('quantidade');
            await interaction.deferReply({ ephemeral: true });
            const deleted = await interaction.channel.bulkDelete(q, true).catch(() => null);
            return interaction.editReply(`Apaguei **${deleted?.size || 0}** mensagens.`);
        }
        if (cmd === 'expulsar') {
            if (!member.permissions.has(PermissionsBitField.Flags.KickMembers)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            const u = options.getUser('usuario');
            const motivo = options.getString('motivo') || 'Sem motivo';
            const m = await guild.members.fetch(u.id).catch(() => null);
            if (!m || !m.kickable) return interaction.reply({ content: 'Não posso expulsar.', ephemeral: true });
            await m.kick(motivo);
            return interaction.reply({ embeds: [emb('👢 Expulso', `**${u.tag}** — ${motivo}`, { thumb: BLUU.face })] });
        }
        if (cmd === 'banir') {
            if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            const u = options.getUser('usuario');
            const motivo = options.getString('motivo') || 'Sem motivo';
            try {
                const m = await guild.members.fetch(u.id).catch(() => null);
                if (m && !m.bannable) return interaction.reply({ content: 'Não posso banir (hierarquia).', ephemeral: true });
                await guild.members.ban(u.id, { reason: motivo });
                return interaction.reply({ embeds: [emb('🔨 Banido', `**${u.tag}** — ${motivo}`, { image: BLUU.dance })] });
            } catch {
                return interaction.reply({ content: 'Falha ao banir.', ephemeral: true });
            }
        }
        if (cmd === 'desbanir') {
            if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            try {
                await guild.bans.remove(options.getString('id'));
                return interaction.reply({ embeds: [emb('✅ Desbanido', `ID: ${options.getString('id')}`, { thumb: BLUU.face })] });
            } catch {
                return interaction.reply({ content: 'Não foi possível desbanir.', ephemeral: true });
            }
        }
        if (cmd === 'mutar') {
            if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            const u = options.getUser('usuario');
            const min = options.getInteger('minutos');
            const m = await guild.members.fetch(u.id).catch(() => null);
            if (!m || !m.moderatable) return interaction.reply({ content: 'Não posso mutar.', ephemeral: true });
            await m.timeout(min * 60 * 1000, options.getString('motivo') || 'Mute');
            return interaction.reply({ embeds: [emb('🔇 Mutado', `**${u.tag}** por **${min}min**`, { thumb: BLUU.face })] });
        }
        if (cmd === 'desmutar') {
            if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            const u = options.getUser('usuario');
            const m = await guild.members.fetch(u.id).catch(() => null);
            if (!m) return interaction.reply({ content: 'Membro não encontrado.', ephemeral: true });
            await m.timeout(null);
            return interaction.reply({ embeds: [emb('🔊 Desmutado', `**${u.tag}**`, { thumb: BLUU.face })] });
        }
        if (cmd === 'lock') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
            return interaction.reply({ embeds: [emb('🔒 Canal trancado', null, { thumb: BLUU.face })] });
        }
        if (cmd === 'unlock') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
            return interaction.reply({ embeds: [emb('🔓 Canal liberado', null, { thumb: BLUU.face })] });
        }
        if (cmd === 'modolento' || cmd === 'slowmode') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            const s = options.getInteger('segundos');
            await interaction.channel.setRateLimitPerUser(s);
            return interaction.reply({ embeds: [emb('🐌 Slowmode', `**${s}s**`, { thumb: BLUU.face })] });
        }
        if (cmd === 'warn') {
            if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            const u = options.getUser('usuario');
            const motivo = options.getString('motivo') || 'Sem motivo';
            const key = `${guild.id}:${u.id}`;
            const list = warns.get(key) || [];
            list.push({ motivo, by: user.id, at: Date.now() });
            warns.set(key, list);
            persistWarns();
            return interaction.reply({ embeds: [emb('⚠️ Warn', `**${u.tag}** — ${motivo}\nTotal: **${list.length}**`, { thumb: BLUU.face })] });
        }
        if (cmd === 'warns') {
            const u = options.getUser('usuario');
            const list = warns.get(`${guild.id}:${u.id}`) || [];
            const lines = list.map((w, i) => `**${i + 1}.** ${w.motivo} — <t:${Math.floor(w.at / 1000)}:R>`).join('\n') || 'Nenhum warn.';
            return interaction.reply({ embeds: [emb(`⚠️ Warns de ${u.username}`, lines, { thumb: BLUU.face })] });
        }
        if (cmd === 'clearwarns') {
            if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            const u = options.getUser('usuario');
            warns.delete(`${guild.id}:${u.id}`);
            persistWarns();
            return interaction.reply({ embeds: [emb('♻️ Warns limpos', `**${u.username}**`, { thumb: BLUU.face })] });
        }
        if (cmd === 'setnick') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageNicknames)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
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
            return interaction.reply({ embeds: [emb(`💰 ${u.username}`, `Carteira: **${c.carteira}** 🪙\nBanco: **${c.banco}** 🏦`, { thumb: u.displayAvatarURL() })] });
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
            const jobs = ['streamar', 'entregar pizza', 'dançar bluudanc', 'farmar', 'hackear (de mentira)'];
            const ganho = 50 + Math.floor(Math.random() * 100);
            const c = iniciarConta(user.id);
            c.carteira += ganho;
            persistBanco();
            return interaction.reply({ embeds: [emb('💼 Trabalho', `Você foi **${jobs[Math.floor(Math.random() * jobs.length)]}** e ganhou **${ganho}** 🪙`, { image: BLUU.dance })] });
        }
        if (cmd === 'apostar') {
            const valor = options.getInteger('valor');
            const c = iniciarConta(user.id);
            if (c.carteira < valor) return interaction.reply({ content: 'Saldo insuficiente.', ephemeral: true });
            const win = Math.random() < 0.45;
            c.carteira += win ? valor : -valor;
            persistBanco();
            return interaction.reply({ embeds: [emb(win ? '🎉 Ganhou!' : '😢 Perdeu', `${win ? '+' : '-'}${valor} 🪙\nSaldo: **${c.carteira}**`, { image: win ? BLUU.dance : BLUU.face })] });
        }
        if (cmd === 'doar' || cmd === 'pay') {
            const alvo = options.getUser('usuario');
            const valor = options.getInteger('valor');
            if (alvo.id === user.id) return interaction.reply({ content: 'Não pode doar pra si.', ephemeral: true });
            const c = iniciarConta(user.id);
            const t = iniciarConta(alvo.id);
            if (c.carteira < valor) return interaction.reply({ content: 'Saldo insuficiente.', ephemeral: true });
            c.carteira -= valor;
            t.carteira += valor;
            persistBanco();
            return interaction.reply({ embeds: [emb('💝 Doação', `Você enviou **${valor}** 🪙 para **${alvo.username}**`, { thumb: BLUU.face })] });
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
            return interaction.reply({ embeds: [emb('🚨 Pego!', `Multa de **${multa}** 🪙`, { thumb: BLUU.face })] });
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
                const mult = ['💎', '7️⃣', '💙'].includes(a) ? 5 : 3;
                c.carteira += valor * mult;
                result += `\n🎉 **x${mult}!** +${valor * mult} 🪙`;
            } else {
                c.carteira -= valor;
                result += `\n−${valor} 🪙`;
            }
            persistBanco();
            return interaction.reply({ embeds: [emb('🎰Slots', result + `\nSaldo: **${c.carteira}**`, { image: BLUU.dance })] });
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
        if (cmd === 'loja') {
            const lines = Object.entries(LOJA).map(([n, i]) => `**${n}** — ${i.preco} 🪙\n_${i.desc}_`).join('\n\n');
            return interaction.reply({ embeds: [emb('🛒 Loja Bluudud', lines, { image: BLUU.dance })] });
        }
        if (cmd === 'comprar') {
            const item = options.getString('item').toLowerCase();
            if (!LOJA[item]) return interaction.reply({ content: 'Item não existe. Use `/loja`.', ephemeral: true });
            const c = iniciarConta(user.id);
            if (c.carteira < LOJA[item].preco) return interaction.reply({ content: 'Saldo insuficiente.', ephemeral: true });
            c.carteira -= LOJA[item].preco;
            const inv = getInv(user.id);
            inv[item] = (inv[item] || 0) + 1;
            persistBanco();
            persistInventory();
            return interaction.reply({ embeds: [emb('✅ Compra', `Você comprou **${item}**!`, { thumb: BLUU.face })] });
        }
        if (cmd === 'inventario') {
            const u = options.getUser('usuario') || user;
            const inv = getInv(u.id);
            const lines = Object.entries(inv).filter(([, q]) => q > 0).map(([i, q]) => `**${i}** x${q}`).join('\n') || 'Vazio';
            return interaction.reply({ embeds: [emb(`🎒 Inventário de ${u.username}`, lines, { thumb: u.displayAvatarURL() })] });
        }
        if (cmd === 'usar') {
            const item = options.getString('item').toLowerCase();
            const inv = getInv(user.id);
            if (!inv[item] || inv[item] < 1) return interaction.reply({ content: 'Você não tem esse item.', ephemeral: true });
            inv[item]--;
            if (inv[item] <= 0) delete inv[item];
            persistInventory();

            if (item === 'pocao') {
                addXP(user.id, 50);
                return interaction.reply({ embeds: [emb('🧪 Poção', 'Você ganhou **+50 XP**!', { image: BLUU.dance })] });
            }
            if (item === 'caixa') {
                const ganho = 50 + Math.floor(Math.random() * 250);
                const c = iniciarConta(user.id);
                c.carteira += ganho;
                persistBanco();
                return interaction.reply({ embeds: [emb('📦 Caixa', `Você ganhou **${ganho}** 🪙!`, { image: BLUU.dance })] });
            }
            return interaction.reply({ embeds: [emb('✅ Item usado', `Você usou **${item}**.`, { thumb: BLUU.face })] });
        }

        // ---- NÍVEL ----
        if (cmd === 'rank' || cmd === 'nivel') {
            const u = options.getUser('usuario') || user;
            const data = getLevelData(u.id);
            const needed = xpForLevel(data.level);
            const pct = Math.min(100, Math.floor((data.xp / needed) * 100));
            const bar = '█'.repeat(Math.floor(pct / 10)) + '░'.repeat(10 - Math.floor(pct / 10));
            return interaction.reply({
                embeds: [emb(`📊 Rank de ${u.username}`, `Nível: **${data.level}**\nXP: **${data.xp}** / **${needed}**\n\`${bar}\` **${pct}%**`, {
                    thumb: u.displayAvatarURL({ size: 256 }),
                    image: BLUU.dance
                })]
            });
        }
        if (cmd === 'topnivel') {
            const sorted = [...levels.entries()]
                .map(([id, v]) => ({ id, level: v.level || 1, xp: v.xp || 0 }))
                .sort((a, b) => b.level - a.level || b.xp - a.xp)
                .slice(0, 10);
            const lines = sorted.map((x, i) => `**${i + 1}.** <@${x.id}> — Nv **${x.level}** (${x.xp} XP)`).join('\n') || 'Ninguém ainda.';
            return interaction.reply({ embeds: [emb('🏆 Top Níveis', lines, { image: BLUU.dance })] });
        }
        if (cmd === 'setnivel') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            const u = options.getUser('usuario');
            const nivel = options.getInteger('nivel');
            const data = getLevelData(u.id);
            data.level = nivel;
            data.xp = 0;
            persistLevels();
            return interaction.reply({ embeds: [emb('✅ Nível definido', `**${u.username}** agora é nível **${nivel}**`, { thumb: BLUU.face })] });
        }
        if (cmd === 'resetnivel') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            const u = options.getUser('usuario');
            levels.set(u.id, { xp: 0, level: 1 });
            persistLevels();
            return interaction.reply({ embeds: [emb('♻️ Nível resetado', `**${u.username}** voltou ao nível 1`, { thumb: BLUU.face })] });
        }

        // ---- SOCIAL ----
        if (cmd === 'perfil') {
            const u = options.getUser('usuario') || user;
            const c = iniciarConta(u.id);
            const lv = getLevelData(u.id);
            const rep = reps.get(u.id) || 0;
            const status = customStatus.get(u.id) || 'Nenhum';
            const casado = marriages.get(u.id);
            return interaction.reply({
                embeds: [emb(`👤 Perfil de ${u.username}`, null, {
                    thumb: u.displayAvatarURL({ size: 256 }),
                    image: BLUU.dance,
                    fields: [
                        { name: 'Nível', value: `${lv.level} (${lv.xp} XP)`, inline: true },
                        { name: 'Coins', value: `${c.carteira + c.banco} 🪙`, inline: true },
                        { name: 'Rep', value: `${rep}`, inline: true },
                        { name: 'Status', value: status, inline: true },
                        { name: 'Casado(a)', value: casado ? `<@${casado}>` : 'Solteiro(a)', inline: true }
                    ]
                })]
            });
        }
        if (cmd === 'rep') {
            const alvo = options.getUser('usuario');
            if (alvo.id === user.id) return interaction.reply({ content: 'Não pode dar rep pra si.', ephemeral: true });
            const cd = checkCd(user.id, 'rep', 12 * 60 * 60 * 1000);
            if (cd) return interaction.reply({ content: `Espere **${formatTime(cd)}**.`, ephemeral: true });
            reps.set(alvo.id, (reps.get(alvo.id) || 0) + 1);
            persistReps();
            return interaction.reply({ embeds: [emb('⭐ Rep', `Você deu +1 rep para **${alvo.username}**!`, { thumb: BLUU.face })] });
        }
        if (cmd === 'casar') {
            const alvo = options.getUser('usuario');
            if (alvo.id === user.id || alvo.bot) return interaction.reply({ content: 'Alvo inválido.', ephemeral: true });
            if (marriages.has(user.id) || marriages.has(alvo.id)) return interaction.reply({ content: 'Alguém já está casado.', ephemeral: true });
            const inv = getInv(user.id);
            if (!inv.anel || inv.anel < 1) return interaction.reply({ content: 'Você precisa de um **anel** (compre na `/loja`).', ephemeral: true });
            inv.anel--;
            if (inv.anel <= 0) delete inv.anel;
            marriages.set(user.id, alvo.id);
            marriages.set(alvo.id, user.id);
            persistInventory();
            persistMarriages();
            return interaction.reply({ embeds: [emb('💍 Casamento!', `**${user.username}** e **${alvo.username}** se casaram!`, { image: BLUU.dance })] });
        }
        if (cmd === 'divorciar') {
            if (!marriages.has(user.id)) return interaction.reply({ content: 'Você não está casado.', ephemeral: true });
            const outro = marriages.get(user.id);
            marriages.delete(user.id);
            marriages.delete(outro);
            persistMarriages();
            return interaction.reply({ embeds: [emb('💔 Divórcio', 'Vocês se separaram.', { thumb: BLUU.face })] });
        }
        if (cmd === 'status') {
            customStatus.set(user.id, options.getString('texto').slice(0, 100));
            return interaction.reply({ embeds: [emb('📝 Status', options.getString('texto'), { thumb: BLUU.face })] });
        }
        if (cmd === 'afk') {
            afkMap.set(user.id, options.getString('motivo') || 'AFK');
            return interaction.reply({ embeds: [emb('💤 AFK', `Status: **${afkMap.get(user.id)}**`, { thumb: BLUU.face })] });
        }

        // ---- DIVERSÃO ----
        if (cmd === 'meme') return interaction.reply({ embeds: [emb('😂 Meme', 'tem bluudude get in nowww!!!', { image: BLUU.dance })] });
        if (cmd === 'dado') {
            const lados = options.getInteger('lados') || 6;
            return interaction.reply({ embeds: [emb('🎲 Dado', `d${lados}: **${1 + Math.floor(Math.random() * lados)}**`, { thumb: BLUU.face })] });
        }
        if (cmd === 'moeda') return interaction.reply({ embeds: [emb('🪙 Moeda', `**${Math.random() < 0.5 ? 'Cara' : 'Coroa'}**`, { image: BLUU.dance })] });
        if (cmd === '8ball') {
            const resp = ['Sim', 'Não', 'Talvez', 'Com certeza', 'Mwehehe... não', 'Things are getting a whole lot bluer — sim!', 'Pergunta de novo'];
            return interaction.reply({ embeds: [emb('🎱 8ball', `**${resp[Math.floor(Math.random() * resp.length)]}**`, { thumb: BLUU.face })] });
        }
        if (cmd === 'ship') {
            const u1 = options.getUser('user1'), u2 = options.getUser('user2');
            const pct = Math.floor(Math.random() * 101);
            const bar = '█'.repeat(Math.floor(pct / 10)) + '░'.repeat(10 - Math.floor(pct / 10));
            return interaction.reply({ embeds: [emb('💘 Ship', `**${u1.username}** + **${u2.username}**\n\`${bar}\` **${pct}%**`, { image: BLUU.dance })] });
        }
        if (cmd === 'abracar') return interaction.reply({ embeds: [emb('🤗 Abraço', `**${user.username}** abraçou **${options.getUser('usuario').username}**`, { image: BLUU.dance })] });
        if (cmd === 'beijar') return interaction.reply({ embeds: [emb('💋 Beijo', `**${user.username}** beijou **${options.getUser('usuario').username}**`, { image: BLUU.dance })] });
        if (cmd === 'tapa') return interaction.reply({ embeds: [emb('👋 Tapa', `**${user.username}** deu um tapa em **${options.getUser('usuario').username}**`, { image: BLUU.dance })] });
        if (cmd === 'cantada') {
            const list = ['Você é azul como eu? Things are getting a whole lot bluer…', 'Tem bluudude no meu coração — get in nowww!!!', 'Seu sorriso tem mais frames que meu bluudanc.'];
            return interaction.reply({ embeds: [emb('😏 Cantada', list[Math.floor(Math.random() * list.length)], { image: BLUU.dance })] });
        }
        if (cmd === 'piada') {
            const list = ['Por que o Bluudud não usa espada? Porque ele prefere pirulito.', 'O que o Bluudud fala no mic? Mwehehe!', 'Qual o streaming do Bluudud? 24/7 matando survivor (de mentira).'];
            return interaction.reply({ embeds: [emb('🤣 Piada', list[Math.floor(Math.random() * list.length)], { thumb: BLUU.face })] });
        }
        if (cmd === 'elogiar') return interaction.reply({ embeds: [emb('✨ Elogio', `**${options.getUser('usuario').username}** é mais cool que o Bluudud (quase).`, { image: BLUU.dance })] });
        if (cmd === 'zoar') return interaction.reply({ embeds: [emb('😈 Zoas', `**${options.getUser('usuario').username}** tem skill issue. Mwehehe!`, { image: BLUU.dance })] });
        if (['howgay', 'rizz', 'qi', 'gado'].includes(cmd)) {
            const u = options.getUser('usuario') || user;
            const n = Math.floor(Math.random() * 101);
            const labels = { howgay: '🏳️‍🌈 How gay', rizz: '😎 Rizz', qi: '🧠 QI', gado: '🐄 Gado' };
            return interaction.reply({ embeds: [emb(labels[cmd], `**${u.username}**: **${n}%**` + (cmd === 'qi' ? ` (QI ${60 + n})` : ''), { thumb: BLUU.face })] });
        }
        if (cmd === 'chances') return interaction.reply({ embeds: [emb('📊 Chances', `**${options.getString('texto')}**\n→ **${Math.floor(Math.random() * 101)}%**`, { thumb: BLUU.face })] });
        if (cmd === 'escolha') {
            const ops = options.getString('opcoes').split(',').map(s => s.trim()).filter(Boolean);
            return interaction.reply({ embeds: [emb('🔀 Escolha', `**${ops[Math.floor(Math.random() * ops.length)] || '?'}**`, { image: BLUU.dance })] });
        }
        if (cmd === 'diga') return interaction.reply({ embeds: [emb('🗣️', options.getString('texto'), { thumb: BLUU.face })] });
        if (cmd === 'votar') {
            const msg = await interaction.reply({ embeds: [emb('📊 Votação', options.getString('pergunta'), { thumb: BLUU.face })], fetchReply: true });
            await msg.react('👍');
            await msg.react('👎');
            return;
        }
        if (cmd === 'reverso') return interaction.reply({ embeds: [emb('🔄 Reverso', options.getString('texto').split('').reverse().join(''), { thumb: BLUU.face })] });
        if (cmd === 'jokenpo') {
            const escolha = options.getString('escolha');
            const bot = ['pedra', 'papel', 'tesoura'][Math.floor(Math.random() * 3)];
            let res = 'Empate!';
            if ((escolha === 'pedra' && bot === 'tesoura') || (escolha === 'papel' && bot === 'pedra') || (escolha === 'tesoura' && bot === 'papel')) res = 'Você ganhou! 🎉';
            else if (escolha !== bot) res = 'Bluudud ganhou! Mwehehe';
            return interaction.reply({ embeds: [emb('✊ Jokenpô', `Você: **${escolha}**\nBot: **${bot}**\n${res}`, { image: BLUU.dance })] });
        }
        if (cmd === 'roleta') {
            const morto = Math.random() < 1 / 6;
            return interaction.reply({ embeds: [emb('🔫 Roleta', morto ? '💥 BANG! Você perdeu.' : '😮‍💨 Clique vazio. Sobreviveu!', { image: morto ? BLUU.face : BLUU.dance })] });
        }
        if (cmd === 'adivinhe') {
            const secret = 1 + Math.floor(Math.random() * 10);
            const n = options.getInteger('numero');
            return interaction.reply({ embeds: [emb('🔢 Adivinhe', n === secret ? `Acertou! Era **${secret}**` : `Errou. Era **${secret}**`, { thumb: BLUU.face })] });
        }
        if (cmd === 'bluudanc' || cmd === 'bluudud') {
            return interaction.reply({ embeds: [emb('💙 Bluudanc!', 'yayyy wahooo weeeeee\n*tem bluudude get in nowww!!!*', { image: BLUU.dance, footer: 'Bluudud · Forsaken' })] });
        }
        if (cmd === 'senha') {
            const len = options.getInteger('tamanho') || 16;
            const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*';
            let s = '';
            for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
            return interaction.reply({ embeds: [emb('🔐 Senha', `\`${s}\``, { thumb: BLUU.face })], ephemeral: true });
        }
        if (cmd === 'fato') {
            const fatos = ['O Bluudud é azul.', 'Forsaken é um jogo de Roblox.', 'Mwehehe é a marca registrada do Bluudud.', 'Things are getting a whole lot bluer.'];
            return interaction.reply({ embeds: [emb('📚 Fato', fatos[Math.floor(Math.random() * fatos.length)], { thumb: BLUU.face })] });
        }
        if (cmd === 'conselho') {
            const list = ['Treine mais o bluudanc.', 'Não ragequite.', 'Beba água.', 'Mwehehe, só vai.'];
            return interaction.reply({ embeds: [emb('💡 Conselho', list[Math.floor(Math.random() * list.length)], { thumb: BLUU.face })] });
        }
        if (cmd === 'emojify') {
            const map = { a: '🇦', b: '🇧', c: '🇨', d: '🇩', e: '🇪', f: '🇫', g: '🇬', h: '🇭', i: '🇮', j: '🇯', k: '🇰', l: '🇱', m: '🇲', n: '🇳', o: '🇴', p: '🇵', q: '🇶', r: '🇷', s: '🇸', t: '🇹', u: '🇺', v: '🇻', w: '🇼', x: '🇽', y: '🇾', z: '🇿' };
            const r = options.getString('texto').toLowerCase().split('').map(c => map[c] || c).join(' ');
            return interaction.reply({ embeds: [emb('✨ Emojify', r, { thumb: BLUU.face })] });
        }
        if (cmd === 'clap') return interaction.reply({ embeds: [emb('👏', options.getString('texto').split(' ').join(' 👏 '), { thumb: BLUU.face })] });
        if (cmd === 'mock') {
            const t = options.getString('texto').split('').map((c, i) => i % 2 ? c.toUpperCase() : c.toLowerCase()).join('');
            return interaction.reply({ embeds: [emb('😜 Mock', t, { thumb: BLUU.face })] });
        }
        if (cmd === 'pp') {
            const u = options.getUser('usuario') || user;
            const size = Math.floor(Math.random() * 15) + 1;
            return interaction.reply({ embeds: [emb('📏 PP', `**${u.username}**: 8${'='.repeat(size)}D`, { thumb: BLUU.face })] });
        }
        if (cmd === 'rate') return interaction.reply({ embeds: [emb('⭐ Rate', `**${options.getString('texto')}**\n→ **${(Math.random() * 10).toFixed(1)}/10**`, { thumb: BLUU.face })] });
        if (cmd === 'hack') {
            const u = options.getUser('usuario');
            return interaction.reply({ embeds: [emb('💻 Hack', `Hackeando **${u.username}**...\nIP: 192.168.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}\nSenha: ********\nMwehehe (é de mentira)`, { thumb: BLUU.face })] });
        }
        if (cmd === 'cat') return interaction.reply({ embeds: [emb('🐱 Gato', null, { image: 'https://cataas.com/cat' })] });
        if (cmd === 'dog') return interaction.reply({ embeds: [emb('🐶 Cachorro', null, { image: 'https://placedog.net/500/400?random' })] });
        if (cmd === 'fox') return interaction.reply({ embeds: [emb('🦊 Raposa', null, { image: 'https://randomfox.ca/images/' + (Math.floor(Math.random() * 120) + 1) + '.jpg' })] });

        // ---- IA ----
        if (cmd === 'ai') {
            await interaction.deferReply();
            const reply = await askGroq(options.getString('mensagem'));
            return interaction.editReply({ embeds: [emb('🤖 Bluudud AI', reply, { image: BLUU.dance, footer: 'Groq · llama-3.3-70b' })] });
        }
        if (cmd === 'traduzir') {
            await interaction.deferReply();
            const idioma = options.getString('idioma') || 'português';
            const reply = await askGroq(`Traduza para ${idioma}:\n\n${options.getString('texto')}`, 'Apenas a tradução, sem explicação.');
            return interaction.editReply({ embeds: [emb('🌐 Tradução', reply, { thumb: BLUU.face })] });
        }
        if (cmd === 'resumir') {
            await interaction.deferReply();
            const reply = await askGroq(`Resuma de forma clara:\n\n${options.getString('texto')}`, 'Apenas o resumo.');
            return interaction.editReply({ embeds: [emb('📝 Resumo', reply, { thumb: BLUU.face })] });
        }
        if (cmd === 'corrigir') {
            await interaction.deferReply();
            const reply = await askGroq(`Corrija a gramática/ortografia:\n\n${options.getString('texto')}`, 'Apenas o texto corrigido.');
            return interaction.editReply({ embeds: [emb('✏️ Correção', reply, { thumb: BLUU.face })] });
        }

    } catch (err) {
        console.error(`Erro /${cmd}:`, err);
        const payload = { content: 'Erro ao executar o comando.', ephemeral: true };
        if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
        else await interaction.reply(payload).catch(() => {});
    }
});

client.login(process.env.TOKEN).catch(err => {
    console.error('Falha no login:', err.message);
    process.exit(1);
});

// ==================== EXPRESS ====================
const app = express();
app.set('trust proxy', 1);
const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RENDER;

if (isProduction && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'bluudud-troque-este-segredo')) {
    console.warn('⚠️ SESSION_SECRET fraco ou não definido!');
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
    if (!CLIENT_ID) return res.status(500).send('CLIENT_ID não configurado.');
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
    if (!CLIENT_ID || !CLIENT_SECRET) return res.status(500).send('CLIENT_ID ou CLIENT_SECRET faltando.');

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
        res.status(500).send('Erro ao autenticar');
    }
});

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));
app.get('/api/me', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Não autenticado' });
    res.json(req.session.user);
});

app.get('/api/servers', async (req, res) => {
    if (!req.session.user || !req.session.token) return res.status(401).json({ error: 'Não autenticado' });
    try {
        const response = await axios.get('https://discord.com/api/v10/users/@me/guilds', {
            headers: { Authorization: `Bearer ${req.session.token}` }
        });
        const ADMIN = 0x8n, MANAGE = 0x20n;
        const guilds = response.data
            .filter(g => {
                const p = BigInt(g.permissions);
                return (p & ADMIN) === ADMIN || (p & MANAGE) === MANAGE;
            })
            .map(g => ({ id: g.id, name: g.name, icon: g.icon, owner: g.owner }));
        res.json(guilds);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao carregar servidores' });
    }
});

app.get('/api/welcome/:guildId', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Não autenticado' });
    const cfg = configBoasVindas.get(req.params.guildId) || {};
    res.json({ channelId: cfg.canalId || null, roleId: cfg.cargoId || null, message: cfg.mensagem || null });
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
    let texto = (cfg.mensagem || 'Seja bem-vindo(a)!')
        .replace(/{membro}/g, `<@${req.session.user.id}>`)
        .replace(/{servidor}/g, g.name)
        .replace(/{total}/g, g.memberCount);
    try {
        await ch.send({ embeds: [emb('✨ Teste de boas-vindas', texto, { image: BLUU.dance })] });
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Erro ao enviar' });
    }
});

app.post('/api/ai', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Não autenticado' });
    const { message } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) return res.status(400).json({ error: 'Mensagem inválida' });
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