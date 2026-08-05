require('dotenv').config();
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    PermissionsBitField,
    ApplicationCommandOptionType,
    ChannelType,
    AttachmentBuilder
} = require('discord.js');
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

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

// ==================== LOJA + TAGS ====================
const LOJA_ITENS = {
    pocao:        { preco: 150,  tipo: 'item', desc: 'Ganha +50 XP', emoji: '🧪' },
    caixa:        { preco: 300,  tipo: 'item', desc: 'Coins aleatórios', emoji: '📦' },
    anel:         { preco: 500,  tipo: 'item', desc: 'Necessário para casar', emoji: '💍' },
    tag_vip:      { preco: 2000, tipo: 'tag',  desc: 'Tag VIP', emoji: '💎', label: 'VIP' },
    tag_bluudud:  { preco: 1500, tipo: 'tag',  desc: 'Tag Bluudud', emoji: '💙', label: 'Bluudud' },
    tag_lendario: { preco: 3500, tipo: 'tag',  desc: 'Tag Lendário', emoji: '👑', label: 'Lendário' },
    tag_streamer: { preco: 2500, tipo: 'tag',  desc: 'Tag Streamer', emoji: '📺', label: 'Streamer' },
    tag_og:       { preco: 5000, tipo: 'tag',  desc: 'Tag OG', emoji: '🔥', label: 'OG' }
};

const LOJA_CHOICES = Object.entries(LOJA_ITENS).map(([id, info]) => ({
    name: `${info.emoji} ${info.tipo === 'tag' ? info.label : id} — ${info.preco}🪙`.slice(0, 100),
    value: id
}));

function getInv(id) {
    if (!inventory.has(id)) {
        inventory.set(id, { tags: [], equippedTag: null });
        persistInventory();
    }
    const inv = inventory.get(id);
    if (!Array.isArray(inv.tags)) inv.tags = [];
    if (inv.equippedTag === undefined) inv.equippedTag = null;
    return inv;
}

function getTagDisplay(userId) {
    const inv = getInv(userId);
    if (!inv.equippedTag || !LOJA_ITENS[inv.equippedTag]) return null;
    const t = LOJA_ITENS[inv.equippedTag];
    return `${t.emoji} ${t.label}`;
}

function formatUser(userId, username) {
    const tag = getTagDisplay(userId);
    return tag ? `[${tag}] ${username}` : username;
}

async function applyTagRole(guild, member, tagId) {
    const cfg = configBoasVindas.get(guild.id) || {};
    const tagRoles = cfg.tagRoles || {};
    // remove old tag roles
    for (const [tid, roleId] of Object.entries(tagRoles)) {
        const role = guild.roles.cache.get(roleId);
        if (role && member.roles.cache.has(roleId) && tid !== tagId) {
            await member.roles.remove(role).catch(() => {});
        }
    }
    if (tagId && tagRoles[tagId]) {
        const role = guild.roles.cache.get(tagRoles[tagId]);
        if (role) await member.roles.add(role).catch(() => {});
    }
}

// ==================== CANVAS (perfil + leaderboard) ====================
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

async function generateProfileCard(user, levelData, coins, rep, tagText) {
    const width = 800, height = 300;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // fundo
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#0b1a2b');
    grad.addColorStop(1, '#1a3a5c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // barra azul
    ctx.fillStyle = '#4db8ff';
    ctx.fillRect(0, 0, 12, height);

    // avatar
    try {
        const avatar = await loadImage(user.displayAvatarURL({ extension: 'png', size: 256 }));
        ctx.save();
        ctx.beginPath();
        ctx.arc(120, 150, 80, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar, 40, 70, 160, 160);
        ctx.restore();
        // ring
        ctx.strokeStyle = '#4db8ff';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(120, 150, 83, 0, Math.PI * 2);
        ctx.stroke();
    } catch {
        ctx.fillStyle = '#4db8ff';
        ctx.beginPath();
        ctx.arc(120, 150, 80, 0, Math.PI * 2);
        ctx.fill();
    }

    // nome + tag
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Sans';
    const name = formatUser(user.id, user.username).slice(0, 28);
    ctx.fillText(name, 230, 90);

    if (tagText) {
        ctx.fillStyle = '#4db8ff';
        ctx.font = 'bold 22px Sans';
        ctx.fillText(tagText, 230, 125);
    }

    // stats
    ctx.fillStyle = '#b8d4f0';
    ctx.font = '22px Sans';
    ctx.fillText(`Nível ${levelData.level}`, 230, 170);
    ctx.fillText(`${coins} 🪙`, 400, 170);
    ctx.fillText(`${rep} ⭐ rep`, 560, 170);

    // XP bar
    const needed = xpForLevel(levelData.level);
    const pct = Math.min(1, levelData.xp / needed);
    ctx.fillStyle = '#0a1520';
    roundRect(ctx, 230, 200, 500, 28, 14);
    ctx.fill();
    ctx.fillStyle = '#4db8ff';
    roundRect(ctx, 230, 200, 500 * pct, 28, 14);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px Sans';
    ctx.fillText(`${levelData.xp} / ${needed} XP`, 240, 220);

    ctx.fillStyle = '#7aa0c4';
    ctx.font = '16px Sans';
    ctx.fillText('Bluudud Bot · Forsaken', 230, 270);

    return canvas.toBuffer('image/png');
}

async function generateLeaderboardCard(entries, title = 'Top Níveis') {
    // entries: [{ username, avatarURL, level, xp, tag }]
    const rowH = 70;
    const width = 700;
    const height = 90 + entries.length * rowH;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#0b1a2b');
    grad.addColorStop(1, '#152a45');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#4db8ff';
    ctx.font = 'bold 32px Sans';
    ctx.fillText(title, 30, 50);

    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const y = 80 + i * rowH;

        // row bg
        ctx.fillStyle = i % 2 === 0 ? 'rgba(77,184,255,0.08)' : 'rgba(0,0,0,0.15)';
        roundRect(ctx, 20, y, width - 40, rowH - 8, 10);
        ctx.fill();

        // rank
        const medals = ['🥇', '🥈', '🥉'];
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Sans';
        ctx.fillText(medals[i] || `#${i + 1}`, 35, y + 42);

        // avatar
        try {
            if (e.avatarURL) {
                const av = await loadImage(e.avatarURL);
                ctx.save();
                ctx.beginPath();
                ctx.arc(120, y + 30, 24, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(av, 96, y + 6, 48, 48);
                ctx.restore();
            }
        } catch {}

        // name
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px Sans';
        const display = e.tag ? `[${e.tag}] ${e.username}` : e.username;
        ctx.fillText(display.slice(0, 24), 160, y + 28);

        ctx.fillStyle = '#4db8ff';
        ctx.font = '18px Sans';
        ctx.fillText(`Nv ${e.level} · ${e.xp} XP`, 160, y + 52);
    }

    return canvas.toBuffer('image/png');
}

// ==================== BLUU ====================
const BLUU = {
    color: 0x4db8ff,
    dance: 'https://forsaken.wiki/Special:FilePath/Emotec00lbluudud_CurrentDance.gif',
    face: 'https://forsaken.wiki/Special:FilePath/VeeronicaGrafitti_Bluudud.png'
};

function emb(title, desc, opts = {}) {
    const e = new EmbedBuilder().setColor(opts.color ?? BLUU.color).setTimestamp();
    if (title) e.setTitle(title);
    if (desc) e.setDescription(desc);
    if (opts.footer) e.setFooter({ text: opts.footer });
    if (opts.thumb) e.setThumbnail(opts.thumb);
    if (opts.image) e.setImage(opts.image);
    if (opts.fields) e.addFields(opts.fields);
    return e;
}

// ==================== GROQ ====================
async function askGroq(prompt, systemExtra = '') {
    const key = process.env.GROQ_API_KEY;
    if (!key) return '⚠️ GROQ_API_KEY não configurada.';
    const system = `Você é o Bluudud, personagem azul de Forsaken (Roblox).
Fale em português brasileiro, divertido, meio streamer.
Use "mwehehe". Respostas curtas a médias.
${systemExtra}`.trim();
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
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
        if (!res.ok) return 'Eugh... a IA deu tilt.';
        const data = await res.json();
        return data.choices?.[0]?.message?.content?.trim() || 'Sem resposta...';
    } catch {
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

// ==================== API SITE: PERFIL / DAILY / RANK ====================
app.get('/api/profile', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Não autenticado' });
    const id = req.session.user.id;
    const c = iniciarConta(id);
    const lv = getLevelData(id);
    const inv = getInv(id);
    const rep = reps.get(id) || 0;
    const tag = getTagDisplay(id);
    const dailyCd = (() => {
        const key = `${id}:daily`;
        if (!cooldowns.has(key)) return 0;
        const left = Math.ceil((cooldowns.get(key) - Date.now()) / 1000);
        return left > 0 ? left : 0;
    })();
    res.json({
        id,
        username: req.session.user.username,
        global_name: req.session.user.global_name,
        avatar: req.session.user.avatar,
        carteira: c.carteira,
        banco: c.banco,
        total: c.carteira + c.banco,
        level: lv.level,
        xp: lv.xp,
        xpNeeded: xpForLevel(lv.level),
        rep,
        tag,
        equippedTag: inv.equippedTag,
        tags: inv.tags || [],
        dailyCooldown: dailyCd,
        marriedTo: marriages.get(id) || null
    });
});

app.post('/api/daily', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Não autenticado' });
    const id = req.session.user.id;
    const cd = checkCd(id, 'daily', 24 * 60 * 60 * 1000);
    if (cd) {
        return res.status(429).json({ error: 'Aguarde', cooldown: cd });
    }
    const c = iniciarConta(id);
    const ganho = 200 + Math.floor(Math.random() * 150);
    c.carteira += ganho;
    persistBanco();
    res.json({ success: true, ganho, saldo: c.carteira });
});

app.get('/api/rank', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Não autenticado' });
    const sorted = [...levels.entries()]
        .map(([id, v]) => ({
            id,
            level: v.level || 1,
            xp: v.xp || 0,
            tag: getTagDisplay(id)
        }))
        .sort((a, b) => b.level - a.level || b.xp - a.xp)
        .slice(0, 25);

    // enriquecer com username se estiver em cache de algum guild
    const enriched = sorted.map((e, i) => {
        let username = e.id;
        let avatar = null;
        for (const g of client.guilds.cache.values()) {
            const m = g.members.cache.get(e.id);
            if (m) {
                username = m.user.username;
                avatar = m.user.displayAvatarURL({ size: 64 });
                break;
            }
        }
        return { rank: i + 1, ...e, username, avatar };
    });

    const meId = req.session.user.id;
    const myData = getLevelData(meId);
    const myPos = [...levels.entries()]
        .map(([id, v]) => ({ id, level: v.level || 1, xp: v.xp || 0 }))
        .sort((a, b) => b.level - a.level || b.xp - a.xp)
        .findIndex(x => x.id === meId) + 1;

    res.json({
        top: enriched,
        me: {
            id: meId,
            rank: myPos || null,
            level: myData.level,
            xp: myData.xp,
            tag: getTagDisplay(meId)
        }
    });
});
// ==================== COMMANDS (GRUPOS) ====================
const commandsData = [
    {
        name: 'config',
        description: 'Configurações do servidor',
        options: [
            { type: ApplicationCommandOptionType.Subcommand, name: 'boasvindas', description: 'Canal de boas-vindas', options: [{ name: 'canal', description: 'Canal', type: ApplicationCommandOptionType.Channel, channelTypes: [ChannelType.GuildText], required: true }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'mensagem', description: 'Mensagem de boas-vindas', options: [{ name: 'mensagem', description: '{membro} {servidor} {total}', type: ApplicationCommandOptionType.String, required: true }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'cargo', description: 'Cargo automático', options: [{ name: 'cargo', description: 'Cargo', type: ApplicationCommandOptionType.Role, required: true }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'tag-cargo', description: 'Vincula tag a um cargo', options: [
                { name: 'tag', description: 'Tag', type: ApplicationCommandOptionType.String, required: true, choices: [
                    { name: '💎 VIP', value: 'tag_vip' },
                    { name: '💙 Bluudud', value: 'tag_bluudud' },
                    { name: '👑 Lendário', value: 'tag_lendario' },
                    { name: '📺 Streamer', value: 'tag_streamer' },
                    { name: '🔥 OG', value: 'tag_og' }
                ]},
                { name: 'cargo', description: 'Cargo', type: ApplicationCommandOptionType.Role, required: true }
            ]},
            { type: ApplicationCommandOptionType.Subcommand, name: 'ver', description: 'Ver configurações' }
        ]
    },
    {
        name: 'mod',
        description: 'Moderação',
        options: [
            { type: ApplicationCommandOptionType.Subcommand, name: 'limpar', description: 'Apagar mensagens', options: [{ name: 'quantidade', description: '1-100', type: ApplicationCommandOptionType.Integer, required: true, min_value: 1, max_value: 100 }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'expulsar', description: 'Expulsar', options: [
                { name: 'usuario', description: 'Membro', type: ApplicationCommandOptionType.User, required: true },
                { name: 'motivo', description: 'Motivo', type: ApplicationCommandOptionType.String, required: false }
            ]},
            { type: ApplicationCommandOptionType.Subcommand, name: 'banir', description: 'Banir', options: [
                { name: 'usuario', description: 'Membro', type: ApplicationCommandOptionType.User, required: true },
                { name: 'motivo', description: 'Motivo', type: ApplicationCommandOptionType.String, required: false }
            ]},
            { type: ApplicationCommandOptionType.Subcommand, name: 'desbanir', description: 'Desbanir', options: [{ name: 'id', description: 'ID', type: ApplicationCommandOptionType.String, required: true }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'mutar', description: 'Mute', options: [
                { name: 'usuario', description: 'Membro', type: ApplicationCommandOptionType.User, required: true },
                { name: 'minutos', description: 'Minutos', type: ApplicationCommandOptionType.Integer, required: true, min_value: 1, max_value: 40320 },
                { name: 'motivo', description: 'Motivo', type: ApplicationCommandOptionType.String, required: false }
            ]},
            { type: ApplicationCommandOptionType.Subcommand, name: 'desmutar', description: 'Desmutar', options: [{ name: 'usuario', description: 'Membro', type: ApplicationCommandOptionType.User, required: true }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'lock', description: 'Trancar canal' },
            { type: ApplicationCommandOptionType.Subcommand, name: 'unlock', description: 'Destrancar canal' },
            { type: ApplicationCommandOptionType.Subcommand, name: 'slowmode', description: 'Slowmode', options: [{ name: 'segundos', description: 'Segundos', type: ApplicationCommandOptionType.Integer, required: true, min_value: 0, max_value: 21600 }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'warn', description: 'Warn', options: [
                { name: 'usuario', description: 'Membro', type: ApplicationCommandOptionType.User, required: true },
                { name: 'motivo', description: 'Motivo', type: ApplicationCommandOptionType.String, required: false }
            ]},
            { type: ApplicationCommandOptionType.Subcommand, name: 'warns', description: 'Listar warns', options: [{ name: 'usuario', description: 'Membro', type: ApplicationCommandOptionType.User, required: true }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'clearwarns', description: 'Limpar warns', options: [{ name: 'usuario', description: 'Membro', type: ApplicationCommandOptionType.User, required: true }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'setnick', description: 'Mudar nick', options: [
                { name: 'usuario', description: 'Membro', type: ApplicationCommandOptionType.User, required: true },
                { name: 'apelido', description: 'Apelido', type: ApplicationCommandOptionType.String, required: true }
            ]}
        ]
    },
    {
        name: 'eco',
        description: 'Economia',
        options: [
            { type: ApplicationCommandOptionType.Subcommand, name: 'saldo', description: 'Saldo', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'daily', description: 'Daily' },
            { type: ApplicationCommandOptionType.Subcommand, name: 'trabalhar', description: 'Trabalhar' },
            { type: ApplicationCommandOptionType.Subcommand, name: 'apostar', description: 'Apostar', options: [{ name: 'valor', description: 'Valor', type: ApplicationCommandOptionType.Integer, required: true, min_value: 1 }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'doar', description: 'Doar', options: [
                { name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: true },
                { name: 'valor', description: 'Valor', type: ApplicationCommandOptionType.Integer, required: true, min_value: 1 }
            ]},
            { type: ApplicationCommandOptionType.Subcommand, name: 'roubar', description: 'Roubar', options: [{ name: 'usuario', description: 'Alvo', type: ApplicationCommandOptionType.User, required: true }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'crime', description: 'Crime' },
            { type: ApplicationCommandOptionType.Subcommand, name: 'slots', description: 'Slots', options: [{ name: 'valor', description: 'Valor', type: ApplicationCommandOptionType.Integer, required: true, min_value: 10 }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'ranking', description: 'Top ricos' },
            { type: ApplicationCommandOptionType.Subcommand, name: 'depositar', description: 'Depositar', options: [{ name: 'valor', description: 'Valor', type: ApplicationCommandOptionType.Integer, required: true, min_value: 1 }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'sacar', description: 'Sacar', options: [{ name: 'valor', description: 'Valor', type: ApplicationCommandOptionType.Integer, required: true, min_value: 1 }] }
        ]
    },
    {
        name: 'loja',
        description: 'Loja, inventário e tags',
        options: [
            { type: ApplicationCommandOptionType.Subcommand, name: 'ver', description: 'Ver loja' },
            { type: ApplicationCommandOptionType.Subcommand, name: 'comprar', description: 'Comprar', options: [{ name: 'item', description: 'Item/tag', type: ApplicationCommandOptionType.String, required: true, choices: LOJA_CHOICES }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'inventario', description: 'Inventário', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'usar', description: 'Usar item', options: [{ name: 'item', description: 'Item', type: ApplicationCommandOptionType.String, required: true, choices: [
                { name: '🧪 Poção', value: 'pocao' },
                { name: '📦 Caixa', value: 'caixa' }
            ]}]},
            { type: ApplicationCommandOptionType.Subcommand, name: 'equipar', description: 'Equipar tag', options: [{ name: 'tag', description: 'Tag', type: ApplicationCommandOptionType.String, required: true, choices: [
                { name: '💎 VIP', value: 'tag_vip' },
                { name: '💙 Bluudud', value: 'tag_bluudud' },
                { name: '👑 Lendário', value: 'tag_lendario' },
                { name: '📺 Streamer', value: 'tag_streamer' },
                { name: '🔥 OG', value: 'tag_og' },
                { name: '❌ Remover', value: 'none' }
            ]}]}
        ]
    },
    {
        name: 'nivel',
        description: 'Sistema de nível',
        options: [
            { type: ApplicationCommandOptionType.Subcommand, name: 'rank', description: 'Ver rank (imagem)', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'top', description: 'Top níveis (imagem)' },
            { type: ApplicationCommandOptionType.Subcommand, name: 'set', description: 'Set nível (staff)', options: [
                { name: 'usuario', description: 'Membro', type: ApplicationCommandOptionType.User, required: true },
                { name: 'nivel', description: 'Nível', type: ApplicationCommandOptionType.Integer, required: true, min_value: 1, max_value: 500 }
            ]},
            { type: ApplicationCommandOptionType.Subcommand, name: 'reset', description: 'Reset nível (staff)', options: [{ name: 'usuario', description: 'Membro', type: ApplicationCommandOptionType.User, required: true }] }
        ]
    },
    {
        name: 'social',
        description: 'Perfil e social',
        options: [
            { type: ApplicationCommandOptionType.Subcommand, name: 'perfil', description: 'Perfil com imagem', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'rep', description: 'Dar rep', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: true }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'casar', description: 'Casar', options: [{ name: 'usuario', description: 'Pessoa', type: ApplicationCommandOptionType.User, required: true }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'divorciar', description: 'Divorciar' },
            { type: ApplicationCommandOptionType.Subcommand, name: 'status', description: 'Status', options: [{ name: 'texto', description: 'Texto', type: ApplicationCommandOptionType.String, required: true }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'afk', description: 'AFK', options: [{ name: 'motivo', description: 'Motivo', type: ApplicationCommandOptionType.String, required: false }] }
        ]
    },
    {
        name: 'fun',
        description: 'Diversão',
        options: [
            { type: ApplicationCommandOptionType.Subcommand, name: 'meme', description: 'Meme' },
            { type: ApplicationCommandOptionType.Subcommand, name: 'dado', description: 'Dado', options: [{ name: 'lados', description: 'Lados', type: ApplicationCommandOptionType.Integer, required: false, min_value: 2, max_value: 100 }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'moeda', description: 'Cara ou coroa' },
            { type: ApplicationCommandOptionType.Subcommand, name: '8ball', description: '8ball', options: [{ name: 'pergunta', description: 'Pergunta', type: ApplicationCommandOptionType.String, required: true }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'ship', description: 'Ship', options: [
                { name: 'user1', description: 'User 1', type: ApplicationCommandOptionType.User, required: true },
                { name: 'user2', description: 'User 2', type: ApplicationCommandOptionType.User, required: true }
            ]},
            { type: ApplicationCommandOptionType.Subcommand, name: 'abracar', description: 'Abraçar', options: [{ name: 'usuario', description: 'User', type: ApplicationCommandOptionType.User, required: true }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'beijar', description: 'Beijar', options: [{ name: 'usuario', description: 'User', type: ApplicationCommandOptionType.User, required: true }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'tapa', description: 'Tapa', options: [{ name: 'usuario', description: 'User', type: ApplicationCommandOptionType.User, required: true }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'cantada', description: 'Cantada' },
            { type: ApplicationCommandOptionType.Subcommand, name: 'piada', description: 'Piada' },
            { type: ApplicationCommandOptionType.Subcommand, name: 'howgay', description: 'How gay', options: [{ name: 'usuario', description: 'User', type: ApplicationCommandOptionType.User, required: false }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'rizz', description: 'Rizz', options: [{ name: 'usuario', description: 'User', type: ApplicationCommandOptionType.User, required: false }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'jokenpo', description: 'Jokenpô', options: [{ name: 'escolha', description: 'Escolha', type: ApplicationCommandOptionType.String, required: true, choices: [
                { name: 'Pedra', value: 'pedra' }, { name: 'Papel', value: 'papel' }, { name: 'Tesoura', value: 'tesoura' }
            ]}]},
            { type: ApplicationCommandOptionType.Subcommand, name: 'bluudanc', description: 'Bluudanc' },
            { type: ApplicationCommandOptionType.Subcommand, name: 'pp', description: 'PP', options: [{ name: 'usuario', description: 'User', type: ApplicationCommandOptionType.User, required: false }] }
        ]
    },
    {
        name: 'util',
        description: 'Utilidades',
        options: [
            { type: ApplicationCommandOptionType.Subcommand, name: 'ping', description: 'Ping' },
            { type: ApplicationCommandOptionType.Subcommand, name: 'ajuda', description: 'Ajuda' },
            { type: ApplicationCommandOptionType.Subcommand, name: 'serverinfo', description: 'Server info' },
            { type: ApplicationCommandOptionType.Subcommand, name: 'userinfo', description: 'User info', options: [{ name: 'usuario', description: 'User', type: ApplicationCommandOptionType.User, required: false }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'avatar', description: 'Avatar', options: [{ name: 'usuario', description: 'User', type: ApplicationCommandOptionType.User, required: false }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'uptime', description: 'Uptime' },
            { type: ApplicationCommandOptionType.Subcommand, name: 'convite', description: 'Convite' },
            { type: ApplicationCommandOptionType.Subcommand, name: 'senha', description: 'Gerar senha', options: [{ name: 'tamanho', description: 'Tamanho', type: ApplicationCommandOptionType.Integer, required: false, min_value: 6, max_value: 64 }] }
        ]
    },
    {
        name: 'ai',
        description: 'IA Bluudud',
        options: [
            { type: ApplicationCommandOptionType.Subcommand, name: 'falar', description: 'Conversar', options: [{ name: 'mensagem', description: 'Mensagem', type: ApplicationCommandOptionType.String, required: true }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'traduzir', description: 'Traduzir', options: [
                { name: 'texto', description: 'Texto', type: ApplicationCommandOptionType.String, required: true },
                { name: 'idioma', description: 'Idioma', type: ApplicationCommandOptionType.String, required: false }
            ]},
            { type: ApplicationCommandOptionType.Subcommand, name: 'resumir', description: 'Resumir', options: [{ name: 'texto', description: 'Texto', type: ApplicationCommandOptionType.String, required: true }] },
            { type: ApplicationCommandOptionType.Subcommand, name: 'corrigir', description: 'Corrigir', options: [{ name: 'texto', description: 'Texto', type: ApplicationCommandOptionType.String, required: true }] }
        ]
    }
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
            console.log(`✅ ${commandsData.length} grupos registrados em ${guild.name}`);
        } else {
            console.log('Servidores:', [...client.guilds.cache.values()].map(g => `${g.name} (${g.id})`).join(', '));
            await client.application.commands.set(commandsData);
            console.log(`⚠️ Registrado globalmente (${commandsData.length} grupos)`);
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
    let msg = (cfg.mensagem || 'Seja bem-vindo(a) {membro} ao {servidor}! Agora somos {total}!')
        .replace(/{membro}/g, `<@${member.id}>`)
        .replace(/{servidor}/g, member.guild.name)
        .replace(/{total}/g, member.guild.memberCount);
    try {
        await ch.send({ embeds: [emb('✨ Nova chegada!', msg, { image: BLUU.dance, thumb: member.user.displayAvatarURL({ size: 128 }) })] });
        if (cfg.cargoId) {
            const role = member.guild.roles.cache.get(cfg.cargoId);
            if (role) await member.roles.add(role).catch(() => {});
        }
    } catch (e) {
        console.error('Welcome:', e.message);
    }
});

// ==================== MESSAGE ====================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    if (afkMap.has(message.author.id)) {
        afkMap.delete(message.author.id);
        message.reply({ embeds: [emb('👋 Bem-vindo de volta!', 'AFK removido.', { thumb: BLUU.face })] }).catch(() => {});
    }
    if (message.mentions.users.size > 0) {
        for (const [, u] of message.mentions.users) {
            if (afkMap.has(u.id)) {
                const tag = getTagDisplay(u.id);
                const nome = tag ? `[${tag}] ${u.username}` : u.username;
                message.reply({ embeds: [emb('💤 AFK', `**${nome}** está AFK: ${afkMap.get(u.id)}`, { thumb: BLUU.face })] }).catch(() => {});
            }
        }
    }

    if (!checkCd(message.author.id, 'xp', 45 * 1000)) {
        const result = addXP(message.author.id, 15 + Math.floor(Math.random() * 16));
        if (result.leveled) {
            const tag = getTagDisplay(message.author.id);
            const nome = tag ? `[${tag}] ${message.author.username}` : message.author.username;
            message.channel.send({ embeds: [emb('🎉 Level Up!', `**${nome}** → nível **${result.level}**!`, { image: BLUU.dance })] }).catch(() => {});
        }
    }
});

// ==================== INTERACTIONS ====================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName: cmd, options, member, guild, user } = interaction;
    const sub = options.getSubcommand(false);

    try {
        // ========== CONFIG ==========
        if (cmd === 'config') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild) && sub !== 'ver') {
                return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
            }
            if (sub === 'boasvindas') {
                if (!configBoasVindas.has(guild.id)) configBoasVindas.set(guild.id, {});
                configBoasVindas.get(guild.id).canalId = options.getChannel('canal').id;
                persistConfig();
                return interaction.reply({ embeds: [emb('✅ Canal', `${options.getChannel('canal')}`, { image: BLUU.dance })] });
            }
            if (sub === 'mensagem') {
                if (!configBoasVindas.has(guild.id)) configBoasVindas.set(guild.id, {});
                configBoasVindas.get(guild.id).mensagem = options.getString('mensagem');
                persistConfig();
                return interaction.reply({ embeds: [emb('✅ Mensagem', options.getString('mensagem'), { thumb: BLUU.face })] });
            }
            if (sub === 'cargo') {
                if (!configBoasVindas.has(guild.id)) configBoasVindas.set(guild.id, {});
                configBoasVindas.get(guild.id).cargoId = options.getRole('cargo').id;
                persistConfig();
                return interaction.reply({ embeds: [emb('✅ Cargo', `${options.getRole('cargo')}`, { thumb: BLUU.face })] });
            }
            if (sub === 'tag-cargo') {
                if (!configBoasVindas.has(guild.id)) configBoasVindas.set(guild.id, {});
                const cfg = configBoasVindas.get(guild.id);
                if (!cfg.tagRoles) cfg.tagRoles = {};
                const tag = options.getString('tag');
                const role = options.getRole('cargo');
                cfg.tagRoles[tag] = role.id;
                persistConfig();
                const info = LOJA_ITENS[tag];
                return interaction.reply({ embeds: [emb('✅ Tag → Cargo', `${info.emoji} **${info.label}** → ${role}`, { thumb: BLUU.face })] });
            }
            if (sub === 'ver') {
                const cfg = configBoasVindas.get(guild.id) || {};
                const tagLines = cfg.tagRoles
                    ? Object.entries(cfg.tagRoles).map(([t, rid]) => {
                        const info = LOJA_ITENS[t];
                        return `${info?.emoji || ''} ${info?.label || t} → <@&${rid}>`;
                    }).join('\n') || 'Nenhum'
                    : 'Nenhum';
                return interaction.reply({
                    embeds: [emb('⚙️ Config', null, {
                        fields: [
                            { name: 'Canal boas-vindas', value: cfg.canalId ? `<#${cfg.canalId}>` : '—', inline: true },
                            { name: 'Cargo entrada', value: cfg.cargoId ? `<@&${cfg.cargoId}>` : '—', inline: true },
                            { name: 'Mensagem', value: cfg.mensagem || 'Padrão' },
                            { name: 'Tags → Cargos', value: tagLines }
                        ]
                    })]
                });
            }
        }

        // ========== MOD ==========
        if (cmd === 'mod') {
            if (sub === 'limpar') {
                if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
                await interaction.deferReply({ ephemeral: true });
                const deleted = await interaction.channel.bulkDelete(options.getInteger('quantidade'), true).catch(() => null);
                return interaction.editReply(`Apaguei **${deleted?.size || 0}** mensagens.`);
            }
            if (sub === 'expulsar') {
                if (!member.permissions.has(PermissionsBitField.Flags.KickMembers)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
                const u = options.getUser('usuario');
                const motivo = options.getString('motivo') || 'Sem motivo';
                const m = await guild.members.fetch(u.id).catch(() => null);
                if (!m || !m.kickable) return interaction.reply({ content: 'Não posso expulsar.', ephemeral: true });
                await m.kick(motivo);
                return interaction.reply({ embeds: [emb('👢 Expulso', `**${formatUser(u.id, u.tag)}** — ${motivo}`, { thumb: BLUU.face })] });
            }
            if (sub === 'banir') {
                if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
                const u = options.getUser('usuario');
                const motivo = options.getString('motivo') || 'Sem motivo';
                try {
                    const m = await guild.members.fetch(u.id).catch(() => null);
                    if (m && !m.bannable) return interaction.reply({ content: 'Não posso banir.', ephemeral: true });
                    await guild.members.ban(u.id, { reason: motivo });
                    return interaction.reply({ embeds: [emb('🔨 Banido', `**${formatUser(u.id, u.tag)}** — ${motivo}`, { image: BLUU.dance })] });
                } catch {
                    return interaction.reply({ content: 'Falha ao banir.', ephemeral: true });
                }
            }
            if (sub === 'desbanir') {
                if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
                try {
                    await guild.bans.remove(options.getString('id'));
                    return interaction.reply({ embeds: [emb('✅ Desbanido', options.getString('id'), { thumb: BLUU.face })] });
                } catch {
                    return interaction.reply({ content: 'Falha.', ephemeral: true });
                }
            }
            if (sub === 'mutar') {
                if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
                const u = options.getUser('usuario');
                const m = await guild.members.fetch(u.id).catch(() => null);
                if (!m || !m.moderatable) return interaction.reply({ content: 'Não posso mutar.', ephemeral: true });
                await m.timeout(options.getInteger('minutos') * 60 * 1000, options.getString('motivo') || 'Mute');
                return interaction.reply({ embeds: [emb('🔇 Mutado', `**${formatUser(u.id, u.tag)}** — ${options.getInteger('minutos')}min`, { thumb: BLUU.face })] });
            }
            if (sub === 'desmutar') {
                if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
                const u = options.getUser('usuario');
                const m = await guild.members.fetch(u.id).catch(() => null);
                if (!m) return interaction.reply({ content: 'Não encontrado.', ephemeral: true });
                await m.timeout(null);
                return interaction.reply({ embeds: [emb('🔊 Desmutado', formatUser(u.id, u.tag), { thumb: BLUU.face })] });
            }
            if (sub === 'lock') {
                if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
                await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
                return interaction.reply({ embeds: [emb('🔒 Trancado', null, { thumb: BLUU.face })] });
            }
            if (sub === 'unlock') {
                if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
                await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
                return interaction.reply({ embeds: [emb('🔓 Liberado', null, { thumb: BLUU.face })] });
            }
            if (sub === 'slowmode') {
                if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
                await interaction.channel.setRateLimitPerUser(options.getInteger('segundos'));
                return interaction.reply({ embeds: [emb('🐌 Slowmode', `${options.getInteger('segundos')}s`, { thumb: BLUU.face })] });
            }
            if (sub === 'warn') {
                if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
                const u = options.getUser('usuario');
                const motivo = options.getString('motivo') || 'Sem motivo';
                const key = `${guild.id}:${u.id}`;
                const list = warns.get(key) || [];
                list.push({ motivo, by: user.id, at: Date.now() });
                warns.set(key, list);
                persistWarns();
                return interaction.reply({ embeds: [emb('⚠️ Warn', `**${formatUser(u.id, u.tag)}** — ${motivo}\nTotal: **${list.length}**`, { thumb: BLUU.face })] });
            }
            if (sub === 'warns') {
                const u = options.getUser('usuario');
                const list = warns.get(`${guild.id}:${u.id}`) || [];
                const lines = list.map((w, i) => `**${i + 1}.** ${w.motivo}`).join('\n') || 'Nenhum';
                return interaction.reply({ embeds: [emb(`Warns — ${u.username}`, lines, { thumb: BLUU.face })] });
            }
            if (sub === 'clearwarns') {
                if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
                warns.delete(`${guild.id}:${options.getUser('usuario').id}`);
                persistWarns();
                return interaction.reply({ embeds: [emb('♻️ Warns limpos', null, { thumb: BLUU.face })] });
            }
            if (sub === 'setnick') {
                if (!member.permissions.has(PermissionsBitField.Flags.ManageNicknames)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
                const u = options.getUser('usuario');
                const m = await guild.members.fetch(u.id).catch(() => null);
                if (!m || !m.manageable) return interaction.reply({ content: 'Não posso.', ephemeral: true });
                await m.setNickname(options.getString('apelido'));
                return interaction.reply({ embeds: [emb('✏️ Nick', `**${u.tag}** → **${options.getString('apelido')}**`, { thumb: BLUU.face })] });
            }
        }

        // ========== ECO ==========
        if (cmd === 'eco') {
            if (sub === 'saldo') {
                const u = options.getUser('usuario') || user;
                const c = iniciarConta(u.id);
                return interaction.reply({ embeds: [emb(`💰 ${formatUser(u.id, u.username)}`, `Carteira: **${c.carteira}** 🪙\nBanco: **${c.banco}** 🏦`, { thumb: u.displayAvatarURL() })] });
            }
            if (sub === 'daily') {
                const cd = checkCd(user.id, 'daily', 24 * 60 * 60 * 1000);
                if (cd) return interaction.reply({ content: `Espere **${formatTime(cd)}**.`, ephemeral: true });
                const c = iniciarConta(user.id);
                const ganho = 200 + Math.floor(Math.random() * 150);
                c.carteira += ganho;
                persistBanco();
                return interaction.reply({ embeds: [emb('🎁 Daily', `+**${ganho}** 🪙\nSaldo: **${c.carteira}**`, { image: BLUU.dance })] });
            }
            if (sub === 'trabalhar') {
                const cd = checkCd(user.id, 'trabalhar', 15 * 60 * 1000);
                if (cd) return interaction.reply({ content: `Espere **${formatTime(cd)}**.`, ephemeral: true });
                const jobs = ['streamar', 'dançar bluudanc', 'farmar', 'entregar pizza'];
                const ganho = 50 + Math.floor(Math.random() * 100);
                const c = iniciarConta(user.id);
                c.carteira += ganho;
                persistBanco();
                return interaction.reply({ embeds: [emb('💼 Trabalho', `**${jobs[Math.floor(Math.random() * jobs.length)]}** → **${ganho}** 🪙`, { image: BLUU.dance })] });
            }
            if (sub === 'apostar') {
                const valor = options.getInteger('valor');
                const c = iniciarConta(user.id);
                if (c.carteira < valor) return interaction.reply({ content: 'Saldo insuficiente.', ephemeral: true });
                const win = Math.random() < 0.45;
                c.carteira += win ? valor : -valor;
                persistBanco();
                return interaction.reply({ embeds: [emb(win ? '🎉 Ganhou' : '😢 Perdeu', `${win ? '+' : '-'}${valor} 🪙 · Saldo **${c.carteira}**`, { image: win ? BLUU.dance : BLUU.face })] });
            }
            if (sub === 'doar') {
                const alvo = options.getUser('usuario');
                const valor = options.getInteger('valor');
                if (alvo.id === user.id) return interaction.reply({ content: 'Não pode doar pra si.', ephemeral: true });
                const c = iniciarConta(user.id);
                const t = iniciarConta(alvo.id);
                if (c.carteira < valor) return interaction.reply({ content: 'Saldo insuficiente.', ephemeral: true });
                c.carteira -= valor;
                t.carteira += valor;
                persistBanco();
                return interaction.reply({ embeds: [emb('💝 Doação', `**${valor}** 🪙 → **${formatUser(alvo.id, alvo.username)}**`, { thumb: BLUU.face })] });
            }
            if (sub === 'roubar') {
                const cd = checkCd(user.id, 'roubar', 10 * 60 * 1000);
                if (cd) return interaction.reply({ content: `Espere **${formatTime(cd)}**.`, ephemeral: true });
                const alvo = options.getUser('usuario');
                if (alvo.id === user.id || alvo.bot) return interaction.reply({ content: 'Alvo inválido.', ephemeral: true });
                const c = iniciarConta(user.id);
                const t = iniciarConta(alvo.id);
                if (t.carteira < 50) return interaction.reply({ content: 'Alvo pobre.', ephemeral: true });
                if (Math.random() < 0.4) {
                    const q = Math.floor(t.carteira * (0.1 + Math.random() * 0.2));
                    t.carteira -= q;
                    c.carteira += q;
                    persistBanco();
                    return interaction.reply({ embeds: [emb('🕵️ Roubo', `**${q}** 🪙 de **${formatUser(alvo.id, alvo.username)}**`, { image: BLUU.dance })] });
                }
                const multa = Math.min(c.carteira, 30 + Math.floor(Math.random() * 50));
                c.carteira -= multa;
                persistBanco();
                return interaction.reply({ embeds: [emb('🚨 Pego', `Multa **${multa}** 🪙`, { thumb: BLUU.face })] });
            }
            if (sub === 'crime') {
                const cd = checkCd(user.id, 'crime', 8 * 60 * 1000);
                if (cd) return interaction.reply({ content: `Espere **${formatTime(cd)}**.`, ephemeral: true });
                const c = iniciarConta(user.id);
                if (Math.random() < 0.5) {
                    const g = 80 + Math.floor(Math.random() * 120);
                    c.carteira += g;
                    persistBanco();
                    return interaction.reply({ embeds: [emb('🕶️ Sucesso', `+**${g}** 🪙`, { image: BLUU.dance })] });
                }
                const m = Math.min(c.carteira, 40 + Math.floor(Math.random() * 60));
                c.carteira -= m;
                persistBanco();
                return interaction.reply({ embeds: [emb('🚔 Falhou', `−**${m}** 🪙`, { thumb: BLUU.face })] });
            }
            if (sub === 'slots') {
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
                    result += `\n🎉 x${mult} +${valor * mult}`;
                } else {
                    c.carteira -= valor;
                    result += `\n−${valor}`;
                }
                persistBanco();
                return interaction.reply({ embeds: [emb('🎰 Slots', `${result}\nSaldo: **${c.carteira}**`, { image: BLUU.dance })] });
            }
            if (sub === 'ranking') {
                const sorted = [...banco.entries()]
                    .map(([id, v]) => ({ id, total: (v.carteira || 0) + (v.banco || 0) }))
                    .sort((a, b) => b.total - a.total)
                    .slice(0, 10);
                const lines = sorted.map((x, i) => `**${i + 1}.** <@${x.id}> — **${x.total}** 🪙`).join('\n') || 'Vazio';
                return interaction.reply({ embeds: [emb('🏆 Top Ricos', lines, { image: BLUU.dance })] });
            }
            if (sub === 'depositar') {
                const valor = options.getInteger('valor');
                const c = iniciarConta(user.id);
                if (c.carteira < valor) return interaction.reply({ content: 'Saldo insuficiente.', ephemeral: true });
                c.carteira -= valor;
                c.banco += valor;
                persistBanco();
                return interaction.reply({ embeds: [emb('🏦 Depósito', `**${valor}** 🪙`, { thumb: BLUU.face })] });
            }
            if (sub === 'sacar') {
                const valor = options.getInteger('valor');
                const c = iniciarConta(user.id);
                if (c.banco < valor) return interaction.reply({ content: 'Banco insuficiente.', ephemeral: true });
                c.banco -= valor;
                c.carteira += valor;
                persistBanco();
                return interaction.reply({ embeds: [emb('🏦 Saque', `**${valor}** 🪙`, { thumb: BLUU.face })] });
            }
        }

        // ========== LOJA ==========
        if (cmd === 'loja') {
            if (sub === 'ver') {
                const itens = Object.entries(LOJA_ITENS)
                    .filter(([, i]) => i.tipo === 'item')
                    .map(([id, i]) => `${i.emoji} **${id}** — ${i.preco} 🪙\n_${i.desc}_`)
                    .join('\n\n');
                const tags = Object.entries(LOJA_ITENS)
                    .filter(([, i]) => i.tipo === 'tag')
                    .map(([id, i]) => `${i.emoji} **${i.label}** — ${i.preco} 🪙`)
                    .join('\n');
                return interaction.reply({
                    embeds: [emb('🛒 Loja Bluudud', null, {
                        image: BLUU.dance,
                        fields: [
                            { name: 'Itens', value: itens || '—' },
                            { name: 'Tags', value: tags || '—' }
                        ]
                    })]
                });
            }
            if (sub === 'comprar') {
                const itemId = options.getString('item');
                const info = LOJA_ITENS[itemId];
                if (!info) return interaction.reply({ content: 'Item inválido.', ephemeral: true });
                const c = iniciarConta(user.id);
                if (c.carteira < info.preco) return interaction.reply({ content: 'Saldo insuficiente.', ephemeral: true });
                const inv = getInv(user.id);
                if (info.tipo === 'tag') {
                    if (inv.tags.includes(itemId)) return interaction.reply({ content: 'Você já tem essa tag.', ephemeral: true });
                    inv.tags.push(itemId);
                } else {
                    inv[itemId] = (inv[itemId] || 0) + 1;
                }
                c.carteira -= info.preco;
                persistBanco();
                persistInventory();
                return interaction.reply({ embeds: [emb('✅ Compra', `Você comprou ${info.emoji} **${info.label || itemId}**!`, { thumb: BLUU.face })] });
            }
            if (sub === 'inventario') {
                const u = options.getUser('usuario') || user;
                const inv = getInv(u.id);
                const items = Object.entries(inv)
                    .filter(([k, v]) => !['tags', 'equippedTag'].includes(k) && typeof v === 'number' && v > 0)
                    .map(([k, v]) => `**${k}** x${v}`)
                    .join('\n') || 'Nenhum item';
                const tags = (inv.tags || []).map(t => {
                    const i = LOJA_ITENS[t];
                    const eq = inv.equippedTag === t ? ' ✅' : '';
                    return `${i?.emoji || ''} ${i?.label || t}${eq}`;
                }).join('\n') || 'Nenhuma tag';
                return interaction.reply({
                    embeds: [emb(`🎒 ${formatUser(u.id, u.username)}`, null, {
                        thumb: u.displayAvatarURL(),
                        fields: [
                            { name: 'Itens', value: items },
                            { name: 'Tags', value: tags }
                        ]
                    })]
                });
            }
            if (sub === 'usar') {
                const item = options.getString('item');
                const inv = getInv(user.id);
                if (!inv[item] || inv[item] < 1) return interaction.reply({ content: 'Você não tem esse item.', ephemeral: true });
                inv[item]--;
                if (inv[item] <= 0) delete inv[item];
                persistInventory();
                if (item === 'pocao') {
                    addXP(user.id, 50);
                    return interaction.reply({ embeds: [emb('🧪 Poção', '+50 XP!', { image: BLUU.dance })] });
                }
                if (item === 'caixa') {
                    const g = 50 + Math.floor(Math.random() * 250);
                    const c = iniciarConta(user.id);
                    c.carteira += g;
                    persistBanco();
                    return interaction.reply({ embeds: [emb('📦 Caixa', `+**${g}** 🪙`, { image: BLUU.dance })] });
                }
                return interaction.reply({ embeds: [emb('✅ Usado', item, { thumb: BLUU.face })] });
            }
            if (sub === 'equipar') {
                const tag = options.getString('tag');
                const inv = getInv(user.id);
                if (tag === 'none') {
                    inv.equippedTag = null;
                    persistInventory();
                    const m = await guild.members.fetch(user.id).catch(() => null);
                    if (m) await applyTagRole(guild, m, null);
                    return interaction.reply({ embeds: [emb('🏷️ Tag removida', null, { thumb: BLUU.face })] });
                }
                if (!inv.tags.includes(tag)) return interaction.reply({ content: 'Você não possui essa tag. Compre em `/loja comprar`.', ephemeral: true });
                inv.equippedTag = tag;
                persistInventory();
                const m = await guild.members.fetch(user.id).catch(() => null);
                if (m) await applyTagRole(guild, m, tag);
                const info = LOJA_ITENS[tag];
                return interaction.reply({ embeds: [emb('🏷️ Tag equipada', `${info.emoji} **${info.label}**`, { image: BLUU.dance })] });
            }
        }

        // ========== NÍVEL ==========
        if (cmd === 'nivel') {
            if (sub === 'rank') {
                await interaction.deferReply();
                const u = options.getUser('usuario') || user;
                const lv = getLevelData(u.id);
                const c = iniciarConta(u.id);
                const rep = reps.get(u.id) || 0;
                const tag = getTagDisplay(u.id);
                try {
                    const buf = await generateProfileCard(u, lv, c.carteira + c.banco, rep, tag);
                    const file = new AttachmentBuilder(buf, { name: 'rank.png' });
                    return interaction.editReply({ files: [file] });
                } catch (e) {
                    console.error('rank img', e);
                    const needed = xpForLevel(lv.level);
                    return interaction.editReply({
                        embeds: [emb(`📊 ${formatUser(u.id, u.username)}`, `Nível **${lv.level}** · ${lv.xp}/${needed} XP`, { thumb: u.displayAvatarURL() })]
                    });
                }
            }
            if (sub === 'top') {
                await interaction.deferReply();
                const sorted = [...levels.entries()]
                    .map(([id, v]) => ({ id, level: v.level || 1, xp: v.xp || 0 }))
                    .sort((a, b) => b.level - a.level || b.xp - a.xp)
                    .slice(0, 10);

                const entries = [];
                for (const x of sorted) {
                    let username = x.id;
                    let avatarURL = null;
                    try {
                        const u = await client.users.fetch(x.id);
                        username = u.username;
                        avatarURL = u.displayAvatarURL({ extension: 'png', size: 128 });
                    } catch {}
                    entries.push({
                        username,
                        avatarURL,
                        level: x.level,
                        xp: x.xp,
                        tag: getTagDisplay(x.id)
                    });
                }
                try {
                    const buf = await generateLeaderboardCard(entries, '🏆 Top Níveis · Bluudud');
                    const file = new AttachmentBuilder(buf, { name: 'leaderboard.png' });
                    return interaction.editReply({ files: [file] });
                } catch (e) {
                    console.error('top img', e);
                    const lines = entries.map((e, i) => `**${i + 1}.** ${e.tag ? `[${e.tag}] ` : ''}${e.username} — Nv ${e.level}`).join('\n');
                    return interaction.editReply({ embeds: [emb('🏆 Top Níveis', lines || 'Vazio', { image: BLUU.dance })] });
                }
            }
            if (sub === 'set') {
                if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
                const u = options.getUser('usuario');
                const data = getLevelData(u.id);
                data.level = options.getInteger('nivel');
                data.xp = 0;
                persistLevels();
                return interaction.reply({ embeds: [emb('✅ Nível', `${formatUser(u.id, u.username)} → **${data.level}**`, { thumb: BLUU.face })] });
            }
            if (sub === 'reset') {
                if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return interaction.reply({ content: 'Sem permissão.', ephemeral: true });
                const u = options.getUser('usuario');
                levels.set(u.id, { xp: 0, level: 1 });
                persistLevels();
                return interaction.reply({ embeds: [emb('♻️ Reset', formatUser(u.id, u.username), { thumb: BLUU.face })] });
            }
        }

        // ========== SOCIAL ==========
        if (cmd === 'social') {
            if (sub === 'perfil') {
                await interaction.deferReply();
                const u = options.getUser('usuario') || user;
                const lv = getLevelData(u.id);
                const c = iniciarConta(u.id);
                const rep = reps.get(u.id) || 0;
                const tag = getTagDisplay(u.id);
                try {
                    const buf = await generateProfileCard(u, lv, c.carteira + c.banco, rep, tag);
                    const file = new AttachmentBuilder(buf, { name: 'perfil.png' });
                    const casado = marriages.get(u.id);
                    const status = customStatus.get(u.id) || '—';
                    return interaction.editReply({
                        embeds: [emb(`👤 ${formatUser(u.id, u.username)}`, `Status: ${status}\nCasado: ${casado ? `<@${casado}>` : 'Solteiro(a)'}`, { footer: 'Bluudud · perfil' })],
                        files: [file]
                    });
                } catch (e) {
                    console.error('perfil img', e);
                    return interaction.editReply({
                        embeds: [emb(`👤 ${formatUser(u.id, u.username)}`, `Nv ${lv.level} · ${c.carteira + c.banco} 🪙 · ${rep} rep`, { thumb: u.displayAvatarURL(), image: BLUU.dance })]
                    });
                }
            }
            if (sub === 'rep') {
                const alvo = options.getUser('usuario');
                if (alvo.id === user.id) return interaction.reply({ content: 'Não pode dar rep pra si.', ephemeral: true });
                const cd = checkCd(user.id, 'rep', 12 * 60 * 60 * 1000);
                if (cd) return interaction.reply({ content: `Espere **${formatTime(cd)}**.`, ephemeral: true });
                reps.set(alvo.id, (reps.get(alvo.id) || 0) + 1);
                persistReps();
                return interaction.reply({ embeds: [emb('⭐ Rep', `+1 para **${formatUser(alvo.id, alvo.username)}**`, { thumb: BLUU.face })] });
            }
            if (sub === 'casar') {
                const alvo = options.getUser('usuario');
                if (alvo.id === user.id || alvo.bot) return interaction.reply({ content: 'Inválido.', ephemeral: true });
                if (marriages.has(user.id) || marriages.has(alvo.id)) return interaction.reply({ content: 'Alguém já casado.', ephemeral: true });
                const inv = getInv(user.id);
                if (!inv.anel || inv.anel < 1) return interaction.reply({ content: 'Precisa de um **anel** (`/loja comprar`).', ephemeral: true });
                inv.anel--;
                if (inv.anel <= 0) delete inv.anel;
                marriages.set(user.id, alvo.id);
                marriages.set(alvo.id, user.id);
                persistInventory();
                persistMarriages();
                return interaction.reply({ embeds: [emb('💍 Casamento', `**${formatUser(user.id, user.username)}** ❤️ **${formatUser(alvo.id, alvo.username)}**`, { image: BLUU.dance })] });
            }
            if (sub === 'divorciar') {
                if (!marriages.has(user.id)) return interaction.reply({ content: 'Você não está casado.', ephemeral: true });
                const outro = marriages.get(user.id);
                marriages.delete(user.id);
                marriages.delete(outro);
                persistMarriages();
                return interaction.reply({ embeds: [emb('💔 Divórcio', null, { thumb: BLUU.face })] });
            }
            if (sub === 'status') {
                customStatus.set(user.id, options.getString('texto').slice(0, 100));
                return interaction.reply({ embeds: [emb('📝 Status', options.getString('texto'), { thumb: BLUU.face })] });
            }
            if (sub === 'afk') {
                afkMap.set(user.id, options.getString('motivo') || 'AFK');
                return interaction.reply({ embeds: [emb('💤 AFK', afkMap.get(user.id), { thumb: BLUU.face })] });
            }
        }

        // ========== FUN ==========
        if (cmd === 'fun') {
            if (sub === 'meme') return interaction.reply({ embeds: [emb('😂', 'tem bluudude get in nowww!!!', { image: BLUU.dance })] });
            if (sub === 'dado') {
                const lados = options.getInteger('lados') || 6;
                return interaction.reply({ embeds: [emb('🎲', `d${lados}: **${1 + Math.floor(Math.random() * lados)}**`, { thumb: BLUU.face })] });
            }
            if (sub === 'moeda') return interaction.reply({ embeds: [emb('🪙', Math.random() < 0.5 ? 'Cara' : 'Coroa', { image: BLUU.dance })] });
            if (sub === '8ball') {
                const r = ['Sim', 'Não', 'Talvez', 'Com certeza', 'Mwehehe... não', 'Pergunta de novo'];
                return interaction.reply({ embeds: [emb('🎱', r[Math.floor(Math.random() * r.length)], { thumb: BLUU.face })] });
            }
            if (sub === 'ship') {
                const u1 = options.getUser('user1'), u2 = options.getUser('user2');
                const pct = Math.floor(Math.random() * 101);
                const bar = '█'.repeat(Math.floor(pct / 10)) + '░'.repeat(10 - Math.floor(pct / 10));
                return interaction.reply({ embeds: [emb('💘', `**${u1.username}** + **${u2.username}**\n\`${bar}\` **${pct}%**`, { image: BLUU.dance })] });
            }
            if (sub === 'abracar') return interaction.reply({ embeds: [emb('🤗', `**${user.username}** abraçou **${options.getUser('usuario').username}**`, { image: BLUU.dance })] });
            if (sub === 'beijar') return interaction.reply({ embeds: [emb('💋', `**${user.username}** beijou **${options.getUser('usuario').username}**`, { image: BLUU.dance })] });
            if (sub === 'tapa') return interaction.reply({ embeds: [emb('👋', `**${user.username}** deu tapa em **${options.getUser('usuario').username}**`, { image: BLUU.dance })] });
            if (sub === 'cantada') {
                const list = ['Things are getting a whole lot bluer…', 'Tem bluudude no coração — get in nowww!!!'];
                return interaction.reply({ embeds: [emb('😏', list[Math.floor(Math.random() * list.length)], { image: BLUU.dance })] });
            }
            if (sub === 'piada') {
                const list = ['Por que o Bluudud não usa espada? Prefere pirulito.', 'O que fala no mic? Mwehehe!'];
                return interaction.reply({ embeds: [emb('🤣', list[Math.floor(Math.random() * list.length)], { thumb: BLUU.face })] });
            }
            if (sub === 'howgay' || sub === 'rizz') {
                const u = options.getUser('usuario') || user;
                const n = Math.floor(Math.random() * 101);
                return interaction.reply({ embeds: [emb(sub === 'howgay' ? '🏳️‍🌈' : '😎', `**${formatUser(u.id, u.username)}**: **${n}%**`, { thumb: BLUU.face })] });
            }
            if (sub === 'jokenpo') {
                const escolha = options.getString('escolha');
                const bot = ['pedra', 'papel', 'tesoura'][Math.floor(Math.random() * 3)];
                let res = 'Empate!';
                if ((escolha === 'pedra' && bot === 'tesoura') || (escolha === 'papel' && bot === 'pedra') || (escolha === 'tesoura' && bot === 'papel')) res = 'Você ganhou!';
                else if (escolha !== bot) res = 'Bluudud ganhou! Mwehehe';
                return interaction.reply({ embeds: [emb('✊', `Você: **${escolha}** · Bot: **${bot}**\n${res}`, { image: BLUU.dance })] });
            }
            if (sub === 'bluudanc') return interaction.reply({ embeds: [emb('💙 Bluudanc', 'yayyy wahooo weeeeee', { image: BLUU.dance })] });
            if (sub === 'pp') {
                const u = options.getUser('usuario') || user;
                const size = 1 + Math.floor(Math.random() * 15);
                return interaction.reply({ embeds: [emb('📏', `**${u.username}**: 8${'='.repeat(size)}D`, { thumb: BLUU.face })] });
            }
        }

        // ========== UTIL ==========
        if (cmd === 'util') {
            if (sub === 'ping') {
                const sent = await interaction.reply({ embeds: [emb('🏓', `API: **${client.ws.ping}ms**`, { thumb: BLUU.face })], fetchReply: true });
                return interaction.editReply({ embeds: [emb('🏓', `API: **${client.ws.ping}ms**\nLatência: **${sent.createdTimestamp - interaction.createdTimestamp}ms**`, { image: BLUU.dance })] });
            }
            if (sub === 'ajuda') {
                return interaction.reply({
                    embeds: [emb('📘 Ajuda Bluudud', null, {
                        image: BLUU.dance,
                        fields: [
                            { name: '⚙️ /config', value: 'boasvindas, mensagem, cargo, tag-cargo, ver' },
                            { name: '🛡️ /mod', value: 'limpar, banir, mutar, lock, warn...' },
                            { name: '💰 /eco', value: 'saldo, daily, slots, ranking...' },
                            { name: '🛒 /loja', value: 'ver, comprar, equipar, inventario' },
                            { name: '📊 /nivel', value: 'rank, top (com imagem!)' },
                            { name: '👤 /social', value: 'perfil (imagem), rep, casar, afk' },
                            { name: '😂 /fun', value: 'meme, ship, jokenpo, bluudanc...' },
                            { name: '🤖 /ai', value: 'falar, traduzir, resumir, corrigir' }
                        ]
                    })]
                });
            }
            if (sub === 'serverinfo') {
                return interaction.reply({
                    embeds: [emb(guild.name, null, {
                        thumb: guild.iconURL({ size: 128 }),
                        fields: [
                            { name: 'Membros', value: `${guild.memberCount}`, inline: true },
                            { name: 'Criado', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
                            { name: 'Dono', value: `<@${guild.ownerId}>`, inline: true }
                        ]
                    })]
                });
            }
            if (sub === 'userinfo') {
                const u = options.getUser('usuario') || user;
                const m = await guild.members.fetch(u.id).catch(() => null);
                return interaction.reply({
                    embeds: [emb(formatUser(u.id, u.tag), null, {
                        thumb: u.displayAvatarURL({ size: 256 }),
                        fields: [
                            { name: 'ID', value: u.id, inline: true },
                            { name: 'Entrou', value: m ? `<t:${Math.floor(m.joinedTimestamp / 1000)}:R>` : '—', inline: true },
                            { name: 'Conta', value: `<t:${Math.floor(u.createdTimestamp / 1000)}:R>`, inline: true }
                        ]
                    })]
                });
            }
            if (sub === 'avatar') {
                const u = options.getUser('usuario') || user;
                return interaction.reply({ embeds: [emb(`Avatar — ${u.username}`, null, { image: u.displayAvatarURL({ size: 512 }) })] });
            }
            if (sub === 'uptime') {
                const s = Math.floor(process.uptime());
                return interaction.reply({ embeds: [emb('⏱️', `**${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s**`, { thumb: BLUU.face })] });
            }
            if (sub === 'convite') {
                const perms = [
                    PermissionsBitField.Flags.ManageChannels,
                    PermissionsBitField.Flags.KickMembers,
                    PermissionsBitField.Flags.BanMembers,
                    PermissionsBitField.Flags.ManageMessages,
                    PermissionsBitField.Flags.ModerateMembers,
                    PermissionsBitField.Flags.ManageNicknames,
                    PermissionsBitField.Flags.ManageRoles,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.EmbedLinks,
                    PermissionsBitField.Flags.AttachFiles,
                    PermissionsBitField.Flags.ReadMessageHistory,
                    PermissionsBitField.Flags.AddReactions
                ].reduce((a, b) => a | b, 0n);
                const url = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=${perms}&scope=bot%20applications.commands`;
                return interaction.reply({ embeds: [emb('🔗 Convite', `[Clique aqui](${url})`, { image: BLUU.dance })] });
            }
            if (sub === 'senha') {
                const len = options.getInteger('tamanho') || 16;
                const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*';
                let s = '';
                for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
                return interaction.reply({ embeds: [emb('🔐', `\`${s}\``, { thumb: BLUU.face })], ephemeral: true });
            }
        }

        // ========== AI ==========
        if (cmd === 'ai') {
            if (sub === 'falar') {
                await interaction.deferReply();
                const reply = await askGroq(options.getString('mensagem'));
                return interaction.editReply({ embeds: [emb('🤖 Bluudud AI', reply, { image: BLUU.dance, footer: 'Groq' })] });
            }
            if (sub === 'traduzir') {
                await interaction.deferReply();
                const idioma = options.getString('idioma') || 'português';
                const reply = await askGroq(`Traduza para ${idioma}:\n\n${options.getString('texto')}`, 'Apenas a tradução.');
                return interaction.editReply({ embeds: [emb('🌐', reply, { thumb: BLUU.face })] });
            }
            if (sub === 'resumir') {
                await interaction.deferReply();
                const reply = await askGroq(`Resuma:\n\n${options.getString('texto')}`, 'Apenas o resumo.');
                return interaction.editReply({ embeds: [emb('📝', reply, { thumb: BLUU.face })] });
            }
            if (sub === 'corrigir') {
                await interaction.deferReply();
                const reply = await askGroq(`Corrija gramática:\n\n${options.getString('texto')}`, 'Apenas o texto corrigido.');
                return interaction.editReply({ embeds: [emb('✏️', reply, { thumb: BLUU.face })] });
            }
        }

    } catch (err) {
        console.error(`Erro /${cmd} ${sub}:`, err);
        const payload = { content: 'Erro ao executar o comando.', ephemeral: true };
        if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
        else await interaction.reply(payload).catch(() => {});
    }
});

client.login(process.env.TOKEN).catch(err => {
    console.error('Login falhou:', err.message);
    process.exit(1);
});

// ==================== EXPRESS ====================
const app = express();
app.set('trust proxy', 1);
const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RENDER;

app.use(session({
    secret: process.env.SESSION_SECRET || 'bluudud-troque-este-segredo',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: isProduction, sameSite: isProduction ? 'none' : 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 }
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
    if (!CLIENT_ID) return res.status(500).send('CLIENT_ID faltando');
    const params = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', scope: 'identify guilds' });
    res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get('/callback', async (req, res) => {
    const { code } = req.query;
    if (!code || !CLIENT_ID || !CLIENT_SECRET) return res.status(500).send('OAuth incompleto');
    try {
        const tokenRes = await axios.post('https://discord.com/api/v10/oauth2/token', new URLSearchParams({
            client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        const accessToken = tokenRes.data.access_token;
        const userRes = await axios.get('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${accessToken}` } });
        req.session.user = userRes.data;
        req.session.token = accessToken;
        res.redirect('/');
    } catch (err) {
        console.error('OAuth', err.response?.data || err.message);
        res.status(500).send('Erro OAuth');
    }
});

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));
app.get('/api/me', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Não autenticado' });
    res.json(req.session.user);
});
app.get('/api/servers', async (req, res) => {
    if (!req.session.token) return res.status(401).json({ error: 'Não autenticado' });
    try {
        const response = await axios.get('https://discord.com/api/v10/users/@me/guilds', { headers: { Authorization: `Bearer ${req.session.token}` } });
        const ADMIN = 0x8n, MANAGE = 0x20n;
        res.json(response.data.filter(g => {
            const p = BigInt(g.permissions);
            return (p & ADMIN) === ADMIN || (p & MANAGE) === MANAGE;
        }).map(g => ({ id: g.id, name: g.name, icon: g.icon, owner: g.owner })));
    } catch {
        res.status(500).json({ error: 'Erro' });
    }
});
app.post('/api/ai', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Não autenticado' });
    const { message } = req.body;
    if (!message || typeof message !== 'string') return res.status(400).json({ error: 'Inválido' });
    try {
        res.json({ reply: await askGroq(message.trim().slice(0, 1000)) });
    } catch {
        res.status(500).json({ error: 'Erro IA' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Dashboard na porta ${PORT}`));