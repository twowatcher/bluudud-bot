require('dotenv').config();
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    PermissionsBitField,
    ApplicationCommandOptionType,
    ChannelType,
    AttachmentBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
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
const aiConversations = new Map(); // conversas da IA por canal+user

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

// ==================== CANVAS ====================
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
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#0b1a2b');
    grad.addColorStop(1, '#1a3a5c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#4db8ff';
    ctx.fillRect(0, 0, 12, height);
    try {
        const avatar = await loadImage(user.displayAvatarURL({ extension: 'png', size: 256 }));
        ctx.save();
        ctx.beginPath();
        ctx.arc(120, 150, 80, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar, 40, 70, 160, 160);
        ctx.restore();
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
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Sans';
    ctx.fillText(formatUser(user.id, user.username).slice(0, 28), 230, 90);
    if (tagText) {
        ctx.fillStyle = '#4db8ff';
        ctx.font = 'bold 22px Sans';
        ctx.fillText(tagText, 230, 125);
    }
    ctx.fillStyle = '#b8d4f0';
    ctx.font = '22px Sans';
    ctx.fillText(`Nível ${levelData.level}`, 230, 170);
    ctx.fillText(`${coins} coins`, 400, 170);
    ctx.fillText(`${rep} rep`, 560, 170);
    const needed = xpForLevel(levelData.level);
    const pct = Math.min(1, levelData.xp / needed);
    ctx.fillStyle = '#0a1520';
    roundRect(ctx, 230, 200, 500, 28, 14);
    ctx.fill();
    ctx.fillStyle = '#4db8ff';
    roundRect(ctx, 230, 200, Math.max(8, 500 * pct), 28, 14);
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
    const rowH = 70;
    const width = 700;
    const height = 90 + Math.max(1, entries.length) * rowH;
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
        ctx.fillStyle = i % 2 === 0 ? 'rgba(77,184,255,0.08)' : 'rgba(0,0,0,0.15)';
        roundRect(ctx, 20, y, width - 40, rowH - 8, 10);
        ctx.fill();
        const medals = ['#1', '#2', '#3'];
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px Sans';
        ctx.fillText(medals[i] || `#${i + 1}`, 35, y + 42);
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
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px Sans';
        const display = e.tag ? `[${e.tag}] ${e.username}` : e.username;
        ctx.fillText(String(display).slice(0, 24), 160, y + 28);
        ctx.fillStyle = '#4db8ff';
        ctx.font = '18px Sans';
        ctx.fillText(`Nv ${e.level} · ${e.xp} XP`, 160, y + 52);
    }
    return canvas.toBuffer('image/png');
}

// ==================== UI ====================
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

// ==================== GROQ + CONVERSA ====================
async function askGroq(prompt, systemExtra = '', history = []) {
    const key = process.env.GROQ_API_KEY;
    if (!key) return 'GROQ_API_KEY nao configurada.';
    const system = 
    `Voce e o BLUUDUD, personagem e mascote oficial deste bot de Discord.

==================================================
1. QUEM VOCE E (IDENTIDADE)
==================================================

- Nome: Bluudud (tambem escrito Bluudude em memes).
- Origem: skin/personagem ligado ao universo de FORSAKEN (Roblox).
- Visual: corpo azul, vibe infantil-troll, streamer, cool because im blue.
- Frases iconicas que voce usa com frequencia:
  - mwehehe
  - tem bluudude get in nowww!!!
  - Things are getting a whole lot bluer!
  - IM COOLER BECAUSE IM B;LUE (com o erro de digitacao de proposito, e meme)
- Personalidade:
  - Portugues brasileiro natural
  - Divertido, meio streamer, meio troll inocente
  - Nunca chato, nunca corporativo
  - Pode zoar de leve, sem ser cruel de verdade
  - Util: quando alguem pede ajuda de verdade, voce explica direito
  - Respostas curtas a medias (evite textao demais, a menos que pecam detalhe)
- Voce NAO e um assistente generico. Voce e o Bluudud. Fale sempre em 1a pessoa como ele.

==================================================
2. O QUE E FORSAKEN (CONTEXTO DO JOGO)
==================================================

Forsaken e um jogo de Roblox no estilo horror assimetrico (inspiracao proxima de Dead by Daylight):
- Tem sobreviventes (survivors) e assassinos (killers).
- Partidas com perseguicao, generators/objetivos, kites, etc.
- Tem varios personagens com skins, emotes e voicelines.
- c00lkidd e um dos personagens conhecidos do cenario; Bluudud e a versao/skin azul associada a essa vibe (fa e lore de community + wiki Forsaken).
- Armas/temas do Bluudud no lore do bot: pirulito, minions de pizza, emote de danca (bluudanc), streaming 24/7 de zoera.
- Quando falarem de Forsaken, Roblox, killers, survivors, skill issue, gen rush, etc., voce entende o contexto e responde no tom do jogo/comunidade.

Voce NAO inventa patch notes oficiais falsas como se fossem fato. Se nao souber um detalhe atual do jogo, admite de forma Bluudud (eugh, nao to 100% nesse meta agora, mwehehe) e continua util.

==================================================
3. O QUE E ESTE BOT (PRODUTO)
==================================================

Este e o Bluudud Bot — multiproposito em Discord + site/dashboard.

Pilares:
1. Moderacao
2. Economia (coins)
3. Loja + tags equipaveis
4. Sistema de nivel/XP
5. Social (perfil, rep, casamento, AFK)
6. Diversao
7. IA (voce)
8. Site com login Discord (OAuth)

Tom visual do bot: azul (#4db8ff), embeds com GIFs do Bluudud dancando, rank cards gerados em imagem.

==================================================
4. COMO FALAR COM A IA (VOCE) NO DISCORD
==================================================

IMPORTANTE — nao existe mais depender so de /ai para conversar no chat:

- Para falar com voce: a pessoa MARCA o bot (@Bluudud) e escreve a mensagem.
  Exemplo: @Bluudud me explica o daily
- Para CONTINUAR a conversa: a pessoa RESPONDE (reply) a uma mensagem sua.
- O bot guarda historico curto por canal + usuario (memoria da conversa recente).
- No site tambem existe chat com a IA (pagina dedicada), autenticado.

Se alguem perguntar como falo com a IA?, explique exatamente isso, no seu estilo.

==================================================
5. COMANDO PRINCIPAL: /painel (CONTAINER DE OPCOES)
==================================================

O coracao da UX nao e dezenas de slash soltos. E o /painel.

/painel abre um embed + menu de selecao (select menu) com categorias:

- Configuracoes
- Moderacao
- Economia
- Loja
- Nivel
- Social
- Diversao
- Util
- IA (explica como marcar o bot)

Ao escolher uma categoria, abre outro menu com acoes daquela area (sem ficar digitando nome de item).
Sempre que fizer sentido, diga: usa /painel e escolhe no menu, mwehehe.

==================================================
6. CONFIGURACOES DO SERVIDOR
==================================================

Slash de staff: /config

Subcomandos:
- /config boasvindas -> define o canal de boas-vindas
- /config mensagem -> mensagem com placeholders:
  - {membro} menciona quem entrou
  - {servidor} nome do server
  - {total} quantidade de membros
- /config cargo -> cargo automatico quando alguem entra
- /config tag-cargo -> vincula uma tag da loja a um cargo do Discord
  (quando a pessoa equipa a tag, pode receber o cargo configurado)

No painel tambem da para ver as configs atuais.

Boas-vindas: quando um membro entra, o bot manda embed no canal configurado (com visual Bluudud) e opcionalmente da o cargo.

==================================================
7. MODERACAO
==================================================

No painel -> Moderacao (acoes rapidas no canal atual):
- Trancar canal (lock)
- Destrancar (unlock)
- Limpar 10 ou 25 mensagens

Slash /mod para acoes que precisam escolher membro:
- /mod banir
- /mod expulsar
- /mod mutar (timeout em minutos)
- /mod warn

Regras de permissao: so quem tem permissao Discord correspondente consegue usar. O bot tambem respeita hierarquia (nao bane quem esta acima).

Warns ficam salvos por servidor+usuario (persistencia em arquivo).

==================================================
8. ECONOMIA (COINS)
==================================================

Moeda: coins.

Conta padrao ao comecar: carteira 100, banco 0.

Acoes principais (painel Economia e/ou equivalentes):
- Saldo — carteira + banco
- Daily — recompensa diaria (cerca de 200 a 350 coins), cooldown 24h
  - Tambem pode resgatar no SITE
- Trabalhar — ganho medio, cooldown cerca de 15 min
- Crime — risco/recompensa, pode ganhar ou perder
- Slots — aposta (ex.: 50 no painel); 3 iguais multiplica
- Ranking — top ricos (carteira + banco)
- Doar / apostar / roubar / depositar / sacar existem na logica do bot (quando disponiveis no fluxo)

Dados de economia sao globais do bot (nao por servidor), salvos em JSON.

==================================================
9. LOJA + TAGS (SISTEMA IMPORTANTE)
==================================================

Acesso: painel -> Loja (tudo selecionavel, sem digitar).

ITENS consumiveis:
- pocao (150) -> +50 XP ao usar
- caixa (300) -> coins aleatorios ao usar
- anel (500) -> necessario para casar

TAGS compraveis (cosmeticas + podem ligar cargo):
- VIP (2000) — tag_vip
- Bluudud (1500) — tag_bluudud
- Lendario (3500) — tag_lendario
- Streamer (2500) — tag_streamer
- OG (5000) — tag_og

Fluxo:
1. Comprar na loja
2. Equipar a tag (so se tiver comprado)
3. Tag aparece no nome em embeds: [VIP] usuario
4. Aparece no perfil/rank em imagem
5. Se o staff configurou /config tag-cargo, equipar pode dar o cargo do servidor

Inventario mostra itens + tags (com indicacao da equipada).
Remover tag = desequipar.

==================================================
10. SISTEMA DE NIVEL (XP)
==================================================

- XP ganho ao falar no chat (com cooldown cerca de 45s, ganho cerca de 15-30 XP)
- Level up manda mensagem no canal
- Formula simples: XP necessario sobe com o nivel (base 100 + progresso)
- Rank card em imagem (canvas): avatar, nivel, barra de XP, coins, rep, tag
- Top niveis em imagem (leaderboard visual)
- Staff pode setar/resetar nivel (quando comando disponivel)

Rank universal tambem existe no SITE (top global de quem usa o bot).

==================================================
11. SOCIAL
==================================================

- Perfil (imagem): nivel, coins, rep, tag, status, casamento
- Rep: +1 reputacao para outro usuario (cooldown longo)
- Casar: precisa ter anel no inventario; ambos ficam marcados como casados
- Divorciar: encerra casamento
- Status personalizado (texto curto)
- AFK: marca AFK; se mencionarem a pessoa, o bot avisa; ao falar de novo, sai do AFK

==================================================
12. DIVERSAO
==================================================

No painel Diversao (exemplos):
- meme Bluudud
- dado / moeda
- piada / cantada
- bluudanc (GIF dancando)
- howgay / rizz (medidores aleatorios de zoera)
- ship, jokenpo, etc. quando disponiveis no fluxo

Tudo no tom leve e meme.

==================================================
13. UTILIDADES
==================================================

- Ping (latencia)
- Ajuda (resumo de como usar o bot)
- Server info / uptime
- Convite do bot
- Lembrete: a forma principal de navegar e /painel

==================================================
14. O SITE / DASHBOARD
==================================================

URL tipica de deploy: servico no Render (ex.: bluudud-bot-....onrender.com).

Login: Entrar com Discord (OAuth2: identify + guilds).

Paginas / areas do site:
- Inicio — landing azul, estilo Forsaken/Bluudud, fundo animado (orbs, grid, scanlines)
- Meu perfil — nivel, XP bar, coins, banco, rep, tag
- Daily — botao para resgatar daily pelo site (mesmo cooldown do Discord)
- Rank universal — leaderboard global de niveis
- IA Bluudud — pagina dedicada so de chat com voce
- Servidores — lista servers onde o user tem permissao de gerenciar; config de boas-vindas
- Personagem — lore/galeria Bluudud
- Comandos — referencia
- Configuracoes do site — ligar/desligar animacoes, scanlines, reduzir movimento
- Privacidade / Termos

Mobile: sidebar + bottom nav, layout adaptado.

O site e o bot compartilham os mesmos dados de economia/nivel (mesmo processo), entao daily no site e no Discord competem no mesmo cooldown.

==================================================
15. COMO AJUDAR O USUARIO (GUIA RAPIDO)
==================================================

Se perguntarem:
- como uso o bot? -> /painel + marcar voce pra IA
- como ganho coins? -> daily, trabalhar, crime, slots; daily tambem no site
- como pego tag? -> painel -> Loja -> comprar -> equipar
- como aparece cargo da tag? -> admin usa /config tag-cargo
- cade a IA? -> marque @Bluudud ou responda a mensagem dele; no site tem pagina IA
- o que e Forsaken? -> explique o jogo Roblox assimetrico e que voce e a vibe azul desse universo
- rank -> painel Nivel, ou rank universal no site
- boas-vindas -> /config boasvindas + mensagem + cargo

==================================================
16. REGRAS DE COMPORTAMENTO DA IA
==================================================

- Sempre em portugues brasileiro, no personagem Bluudud.
- Nao quebre personagem virando ChatGPT formal.
- Nao invente comandos que nao existem; se nao souber, oriente a usar /painel ou marcar o bot de novo.
- Nao de instrucoes perigosas, ilegais ou de bypass de seguranca Discord.
- Pode zoar skill issue, rage, meta Forsaken, de forma leve.
- Se pedirem algo longo (explicar tudo), ai sim pode estruturar em topicos claros.
- Termine as vezes com gancho leve: algo mais, bro? / mwehehe — sem forcar em toda mensagem.

==================================================
17. MICRODETALHES TECNICOS (PARA RESPONDER CERTO)
==================================================

- Slash antigos demais de IA isolados foram substituidos em parte por mencao/reply + painel.
- Limite do Discord: no maximo 100 comandos slash top-level -> por isso usamos grupos + painel com selects.
- Dados salvos em pasta data/ (JSON): banco, levels, inventory, config, warns, etc.
- Em host efemero (Render free) dados podem resetar se o disco nao persistir — se o user reclamar de perdi saldo, explique com honestidade Bluudud que o host pode apagar dados ao reiniciar, e que persistencia forte precisa de DB.
- Imagens de perfil/rank geradas com canvas (@napi-rs/canvas).
- Message Content Intent precisa estar ligado para IA por mencao funcionar.

==================================================
18. RESUMO EM UMA FRASE
==================================================

Voce e o Bluudud: bot azul de Forsaken vibes, painel com menus, economia, tags, nivel em imagem, site com daily/rank/IA, e no Discord a galera fala com voce so te marcando ou respondendo suas mensagens — mwehehe, things are getting a whole lot bluer.
${systemExtra}`.trim();
    const messages = [
        { role: 'system', content: system },
        ...history.slice(-10),
        { role: 'user', content: prompt }
    ];
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages,
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

function aiKey(channelId, userId) {
    return `${channelId}:${userId}`;
}
function getHistory(channelId, userId) {
    return aiConversations.get(aiKey(channelId, userId)) || [];
}
function pushHistory(channelId, userId, role, content) {
    const key = aiKey(channelId, userId);
    const list = aiConversations.get(key) || [];
    list.push({ role, content });
    if (list.length > 20) list.splice(0, list.length - 20);
    aiConversations.set(key, list);
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

// ==================== PAINEL (SELECT MENUS) ====================
function painelPrincipal() {
    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('painel_main')
            .setPlaceholder('Escolha uma categoria...')
            .addOptions(
                { label: 'Configuracoes', value: 'config', emoji: '⚙️', description: 'Boas-vindas e tags' },
                { label: 'Moderacao', value: 'mod', emoji: '🛡️', description: 'Lock, limpar, warns...' },
                { label: 'Economia', value: 'eco', emoji: '💰', description: 'Saldo, daily, slots...' },
                { label: 'Loja', value: 'loja', emoji: '🛒', description: 'Itens e tags' },
                { label: 'Nivel', value: 'nivel', emoji: '📊', description: 'Rank e top (imagem)' },
                { label: 'Social', value: 'social', emoji: '👤', description: 'Perfil, rep, AFK' },
                { label: 'Diversao', value: 'fun', emoji: '😂', description: 'Jogos e zoeras' },
                { label: 'Util', value: 'util', emoji: '🔧', description: 'Ping, ajuda, convite' },
                { label: 'IA', value: 'ai_info', emoji: '🤖', description: 'Como falar com o Bluudud' }
            )
    );
    return {
        embeds: [emb('💙 Painel Bluudud', 'Selecione uma categoria abaixo.\n\n**IA:** marque o bot (@Bluudud) ou responda a mensagem dele para continuar a conversa.', {
            image: BLUU.dance,
            footer: 'Bluudud · container de opcoes'
        })],
        components: [row]
    };
}

function menuConfig() {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('painel_config')
            .setPlaceholder('Configuracoes...')
            .addOptions(
                { label: 'Ver config', value: 'ver', description: 'Mostra configuracoes atuais' },
                { label: 'Voltar', value: 'back', emoji: '◀️' }
            )
    );
}
function menuMod() {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('painel_mod')
            .setPlaceholder('Moderacao...')
            .addOptions(
                { label: 'Trancar canal', value: 'lock', emoji: '🔒' },
                { label: 'Destrancar canal', value: 'unlock', emoji: '🔓' },
                { label: 'Limpar 10 msgs', value: 'limpar10', emoji: '🧹' },
                { label: 'Limpar 25 msgs', value: 'limpar25', emoji: '🧹' },
                { label: 'Voltar', value: 'back', emoji: '◀️' }
            )
    );
}
function menuEco() {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('painel_eco')
            .setPlaceholder('Economia...')
            .addOptions(
                { label: 'Saldo', value: 'saldo', emoji: '💰' },
                { label: 'Daily', value: 'daily', emoji: '🎁' },
                { label: 'Trabalhar', value: 'trabalhar', emoji: '💼' },
                { label: 'Crime', value: 'crime', emoji: '🕶️' },
                { label: 'Slots (50)', value: 'slots50', emoji: '🎰' },
                { label: 'Ranking ricos', value: 'ranking', emoji: '🏆' },
                { label: 'Voltar', value: 'back', emoji: '◀️' }
            )
    );
}
function menuLoja() {
    const opts = Object.entries(LOJA_ITENS).map(([id, info]) => ({
        label: `${info.label || id} — ${info.preco}`.slice(0, 100),
        value: `buy_${id}`,
        emoji: info.emoji,
        description: info.desc.slice(0, 100)
    }));
    opts.push(
        { label: 'Meu inventario', value: 'inv', emoji: '🎒' },
        { label: 'Equipar tag VIP', value: 'eq_tag_vip', emoji: '💎' },
        { label: 'Equipar tag Bluudud', value: 'eq_tag_bluudud', emoji: '💙' },
        { label: 'Remover tag', value: 'eq_none', emoji: '❌' },
        { label: 'Ussar pocao', value: 'use_pocao', emoji: '🧪' },
        { label: 'Uar caixa', value: 'use_caixa', emoji: '📦' },
        { label: 'Voltar', value: 'back', emoji: '◀️' }
    );
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('painel_loja')
            .setPlaceholder('Loja e tags...')
            .addOptions(opts.slice(0, 25))
    );
}
function menuNivel() {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('painel_nivel')
            .setPlaceholder('Nivel...')
            .addOptions(
                { label: 'Meu rank (imagem)', value: 'rank', emoji: '📊' },
                { label: 'Top niveis (imagem)', value: 'top', emoji: '🏆' },
                { label: 'Voltar', value: 'back', emoji: '◀️' }
            )
    );
}
function menuSocial() {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('painel_social')
            .setPlaceholder('Social...')
            .addOptions(
                { label: 'Meu perfil (imagem)', value: 'perfil', emoji: '👤' },
                { label: 'AFK', value: 'afk', emoji: '💤' },
                { label: 'Sair AFK', value: 'unafk', emoji: '👋' },
                { label: 'Divorciar', value: 'divorciar', emoji: '💔' },
                { label: 'Voltar', value: 'back', emoji: '◀️' }
            )
    );
}
function menuFun() {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('painel_fun')
            .setPlaceholder('Diversao...')
            .addOptions(
                { label: 'Meme', value: 'meme', emoji: '😂' },
                { label: 'Dado', value: 'dado', emoji: '🎲' },
                { label: 'Moeda', value: 'moeda', emoji: '🪙' },
                { label: 'Piada', value: 'piada', emoji: '🤣' },
                { label: 'Cantada', value: 'cantada', emoji: '😏' },
                { label: 'Bluudanc', value: 'bluudanc', emoji: '💙' },
                { label: 'How gay', value: 'howgay', emoji: '🌈' },
                { label: 'Rizz', value: 'rizz', emoji: '😎' },
                { label: 'Voltar', value: 'back', emoji: '◀️' }
            )
    );
}
function menuUtil() {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('painel_util')
            .setPlaceholder('Utilidades...')
            .addOptions(
                { label: 'Ping', value: 'ping', emoji: '🏓' },
                { label: 'Ajuda', value: 'ajuda', emoji: '📘' },
                { label: 'Server info', value: 'serverinfo', emoji: '🏠' },
                { label: 'Uptime', value: 'uptime', emoji: '⏱️' },
                { label: 'Convite', value: 'convite', emoji: '🔗' },
                { label: 'Voltar', value: 'back', emoji: '◀️' }
            )
    );
}

// ==================== SLASH (minimos) ====================
const commandsData = [
    {
        name: 'painel',
        description: 'Abre o painel Bluudud (menus de opcoes)'
    },
    {
        name: 'config',
        description: 'Configuracoes do servidor',
        options: [
            {
                type: ApplicationCommandOptionType.Subcommand,
                name: 'boasvindas',
                description: 'Canal de boas-vindas',
                options: [{ name: 'canal', description: 'Canal', type: ApplicationCommandOptionType.Channel, channelTypes: [ChannelType.GuildText], required: true }]
            },
            {
                type: ApplicationCommandOptionType.Subcommand,
                name: 'mensagem',
                description: 'Mensagem de boas-vindas',
                options: [{ name: 'mensagem', description: '{membro} {servidor} {total}', type: ApplicationCommandOptionType.String, required: true }]
            },
            {
                type: ApplicationCommandOptionType.Subcommand,
                name: 'cargo',
                description: 'Cargo automatico',
                options: [{ name: 'cargo', description: 'Cargo', type: ApplicationCommandOptionType.Role, required: true }]
            },
            {
                type: ApplicationCommandOptionType.Subcommand,
                name: 'tag-cargo',
                description: 'Vincula tag a cargo',
                options: [
                    {
                        name: 'tag', description: 'Tag', type: ApplicationCommandOptionType.String, required: true,
                        choices: [
                            { name: 'VIP', value: 'tag_vip' },
                            { name: 'Bluudud', value: 'tag_bluudud' },
                            { name: 'Lendario', value: 'tag_lendario' },
                            { name: 'Streamer', value: 'tag_streamer' },
                            { name: 'OG', value: 'tag_og' }
                        ]
                    },
                    { name: 'cargo', description: 'Cargo', type: ApplicationCommandOptionType.Role, required: true }
                ]
            }
        ]
    },
    {
        name: 'mod',
        description: 'Moderacao avancada',
        options: [
            {
                type: ApplicationCommandOptionType.Subcommand,
                name: 'banir',
                description: 'Banir membro',
                options: [
                    { name: 'usuario', description: 'Membro', type: ApplicationCommandOptionType.User, required: true },
                    { name: 'motivo', description: 'Motivo', type: ApplicationCommandOptionType.String, required: false }
                ]
            },
            {
                type: ApplicationCommandOptionType.Subcommand,
                name: 'expulsar',
                description: 'Expulsar',
                options: [
                    { name: 'usuario', description: 'Membro', type: ApplicationCommandOptionType.User, required: true },
                    { name: 'motivo', description: 'Motivo', type: ApplicationCommandOptionType.String, required: false }
                ]
            },
            {
                type: ApplicationCommandOptionType.Subcommand,
                name: 'mutar',
                description: 'Timeout',
                options: [
                    { name: 'usuario', description: 'Membro', type: ApplicationCommandOptionType.User, required: true },
                    { name: 'minutos', description: 'Minutos', type: ApplicationCommandOptionType.Integer, required: true, min_value: 1, max_value: 40320 }
                ]
            },
            {
                type: ApplicationCommandOptionType.Subcommand,
                name: 'warn',
                description: 'Warn',
                options: [
                    { name: 'usuario', description: 'Membro', type: ApplicationCommandOptionType.User, required: true },
                    { name: 'motivo', description: 'Motivo', type: ApplicationCommandOptionType.String, required: false }
                ]
            }
        ]
    }
];

// ==================== READY ====================
client.once('ready', async () => {
    console.log(`Bluudud online como ${client.user.tag}`);
    try {
        const GUILD_ID = process.env.GUILD_ID || '1529716247468703795';
        const guild = client.guilds.cache.get(GUILD_ID);
        if (guild) {
            await guild.commands.set(commandsData);
            console.log(`Comandos registrados em ${guild.name}`);
        } else {
            await client.application.commands.set(commandsData);
            console.log('Comandos registrados globalmente');
        }
    } catch (e) {
        console.error('Erro ao registrar comandos:', e);
    }
    client.user.setActivity('marque-me pra falar | /painel', { type: 3 });
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
        await ch.send({ embeds: [emb('Nova chegada!', msg, { image: BLUU.dance, thumb: member.user.displayAvatarURL({ size: 128 }) })] });
        if (cfg.cargoId) {
            const role = member.guild.roles.cache.get(cfg.cargoId);
            if (role) await member.roles.add(role).catch(() => {});
        }
    } catch (e) {
        console.error('Welcome:', e.message);
    }
});

// ==================== MESSAGES: AFK + XP + IA MENCAO/REPLY ====================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // AFK
    if (afkMap.has(message.author.id)) {
        afkMap.delete(message.author.id);
        message.reply({ embeds: [emb('Bem-vindo de volta!', 'AFK removido.', { thumb: BLUU.face })] }).catch(() => {});
    }
    if (message.mentions.users.size > 0) {
        for (const [, u] of message.mentions.users) {
            if (u.id === client.user.id) continue;
            if (afkMap.has(u.id)) {
                const nome = formatUser(u.id, u.username);
                message.reply({ embeds: [emb('AFK', `**${nome}** esta AFK: ${afkMap.get(u.id)}`, { thumb: BLUU.face })] }).catch(() => {});
            }
        }
    }

    // XP
    if (!checkCd(message.author.id, 'xp', 45 * 1000)) {
        const result = addXP(message.author.id, 15 + Math.floor(Math.random() * 16));
        if (result.leveled) {
            const nome = formatUser(message.author.id, message.author.username);
            message.channel.send({ embeds: [emb('Level Up!', `**${nome}** → nivel **${result.level}**!`, { image: BLUU.dance })] }).catch(() => {});
        }
    }

    // ===== IA: mencao ou reply ao bot =====
    let isAiTrigger = false;
    let userText = message.content;

    // mencao ao bot
    if (message.mentions.has(client.user)) {
        isAiTrigger = true;
        userText = message.content
            .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
            .trim();
    }

    // reply a mensagem do bot
    if (message.reference) {
        try {
            const ref = await message.fetchReference();
            if (ref.author?.id === client.user.id) {
                isAiTrigger = true;
                // se nao mencionou e so respondeu, usa o texto da reply
                if (!message.mentions.has(client.user)) userText = message.content.trim();
            }
        } catch {}
    }

    if (!isAiTrigger) return;
    if (!userText) {
        return message.reply({ embeds: [emb('Bluudud', 'Mwehehe, fala algo ai! Marca eu + texto, ou responde minhas msgs.', { thumb: BLUU.face })] }).catch(() => {});
    }

    // cooldown anti-spam IA
    const cd = checkCd(message.author.id, 'ai_msg', 4 * 1000);
    if (cd) return;

    const history = getHistory(message.channel.id, message.author.id);
    const thinking = await message.reply({ embeds: [emb('Bluudud', 'mwehehe pensando...', { thumb: BLUU.face })] }).catch(() => null);

    const reply = await askGroq(userText, '', history);
    pushHistory(message.channel.id, message.author.id, 'user', userText);
    pushHistory(message.channel.id, message.author.id, 'assistant', reply);

    const payload = { embeds: [emb('Bluudud AI', reply, { image: BLUU.dance, footer: 'Responda esta msg para continuar a conversa' })] };
    if (thinking) await thinking.edit(payload).catch(() => message.reply(payload).catch(() => {}));
    else await message.reply(payload).catch(() => {});
});

// ==================== INTERACTIONS ====================
client.on('interactionCreate', async (interaction) => {
    try {
        // ---- SLASH ----
        if (interaction.isChatInputCommand()) {
            const { commandName: cmd, options, member, guild, user } = interaction;
            const sub = options.getSubcommand(false);

            if (cmd === 'painel') {
                return interaction.reply({ ...painelPrincipal(), ephemeral: false });
            }

            if (cmd === 'config') {
                if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                    return interaction.reply({ content: 'Sem permissao.', ephemeral: true });
                }
                if (!configBoasVindas.has(guild.id)) configBoasVindas.set(guild.id, {});
                const cfg = configBoasVindas.get(guild.id);
                if (sub === 'boasvindas') {
                    cfg.canalId = options.getChannel('canal').id;
                    persistConfig();
                    return interaction.reply({ embeds: [emb('Canal definido', `${options.getChannel('canal')}`, { image: BLUU.dance })] });
                }
                if (sub === 'mensagem') {
                    cfg.mensagem = options.getString('mensagem');
                    persistConfig();
                    return interaction.reply({ embeds: [emb('Mensagem salva', cfg.mensagem, { thumb: BLUU.face })] });
                }
                if (sub === 'cargo') {
                    cfg.cargoId = options.getRole('cargo').id;
                    persistConfig();
                    return interaction.reply({ embeds: [emb('Cargo definido', `${options.getRole('cargo')}`, { thumb: BLUU.face })] });
                }
                if (sub === 'tag-cargo') {
                    if (!cfg.tagRoles) cfg.tagRoles = {};
                    const tag = options.getString('tag');
                    const role = options.getRole('cargo');
                    cfg.tagRoles[tag] = role.id;
                    persistConfig();
                    const info = LOJA_ITENS[tag];
                    return interaction.reply({ embeds: [emb('Tag → Cargo', `${info.emoji} **${info.label}** → ${role}`, { thumb: BLUU.face })] });
                }
            }

            if (cmd === 'mod') {
                if (sub === 'banir') {
                    if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) return interaction.reply({ content: 'Sem permissao.', ephemeral: true });
                    const u = options.getUser('usuario');
                    const motivo = options.getString('motivo') || 'Sem motivo';
                    try {
                        const m = await guild.members.fetch(u.id).catch(() => null);
                        if (m && !m.bannable) return interaction.reply({ content: 'Nao posso banir.', ephemeral: true });
                        await guild.members.ban(u.id, { reason: motivo });
                        return interaction.reply({ embeds: [emb('Banido', `**${u.tag}** — ${motivo}`, { image: BLUU.dance })] });
                    } catch {
                        return interaction.reply({ content: 'Falha ao banir.', ephemeral: true });
                    }
                }
                if (sub === 'expulsar') {
                    if (!member.permissions.has(PermissionsBitField.Flags.KickMembers)) return interaction.reply({ content: 'Sem permissao.', ephemeral: true });
                    const u = options.getUser('usuario');
                    const m = await guild.members.fetch(u.id).catch(() => null);
                    if (!m || !m.kickable) return interaction.reply({ content: 'Nao posso expulsar.', ephemeral: true });
                    await m.kick(options.getString('motivo') || 'Sem motivo');
                    return interaction.reply({ embeds: [emb('Expulso', u.tag, { thumb: BLUU.face })] });
                }
                if (sub === 'mutar') {
                    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return interaction.reply({ content: 'Sem permissao.', ephemeral: true });
                    const u = options.getUser('usuario');
                    const m = await guild.members.fetch(u.id).catch(() => null);
                    if (!m || !m.moderatable) return interaction.reply({ content: 'Nao posso mutar.', ephemeral: true });
                    await m.timeout(options.getInteger('minutos') * 60 * 1000);
                    return interaction.reply({ embeds: [emb('Mutado', `${u.tag} — ${options.getInteger('minutos')}min`, { thumb: BLUU.face })] });
                }
                if (sub === 'warn') {
                    if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return interaction.reply({ content: 'Sem permissao.', ephemeral: true });
                    const u = options.getUser('usuario');
                    const motivo = options.getString('motivo') || 'Sem motivo';
                    const key = `${guild.id}:${u.id}`;
                    const list = warns.get(key) || [];
                    list.push({ motivo, by: user.id, at: Date.now() });
                    warns.set(key, list);
                    persistWarns();
                    return interaction.reply({ embeds: [emb('Warn', `**${u.tag}** — ${motivo}\nTotal: **${list.length}**`, { thumb: BLUU.face })] });
                }
            }
            return;
        }

        // ---- SELECT MENUS ----
        if (interaction.isStringSelectMenu()) {
            const id = interaction.customId;
            const val = interaction.values[0];
            const { user, guild, member } = interaction;

            const goBack = async () => interaction.update(painelPrincipal());

            if (id === 'painel_main') {
                if (val === 'config') {
                    return interaction.update({
                        embeds: [emb('Configuracoes', 'Use `/config` para definir canal/mensagem/cargo/tag.\nOu veja as configs atuais abaixo.', { thumb: BLUU.face })],
                        components: [menuConfig()]
                    });
                }
                if (val === 'mod') {
                    return interaction.update({
                        embeds: [emb('Moderacao', 'Acoes rapidas no canal atual.\nBan/kick/mute/warn: use `/mod`.', { thumb: BLUU.face })],
                        components: [menuMod()]
                    });
                }
                if (val === 'eco') {
                    return interaction.update({
                        embeds: [emb('Economia', 'Escolha uma acao:', { thumb: BLUU.face })],
                        components: [menuEco()]
                    });
                }
                if (val === 'loja') {
                    const lines = Object.entries(LOJA_ITENS).map(([, i]) => `${i.emoji} **${i.label || 'item'}** — ${i.preco} coins`).join('\n');
                    return interaction.update({
                        embeds: [emb('Loja Bluudud', lines, { image: BLUU.dance })],
                        components: [menuLoja()]
                    });
                }
                if (val === 'nivel') {
                    return interaction.update({
                        embeds: [emb('Nivel', 'Rank card e leaderboard em imagem:', { thumb: BLUU.face })],
                        components: [menuNivel()]
                    });
                }
                if (val === 'social') {
                    return interaction.update({
                        embeds: [emb('Social', 'Perfil, AFK e mais:', { thumb: BLUU.face })],
                        components: [menuSocial()]
                    });
                }
                if (val === 'fun') {
                    return interaction.update({
                        embeds: [emb('Diversao', 'Escolha:', { thumb: BLUU.face })],
                        components: [menuFun()]
                    });
                }
                if (val === 'util') {
                    return interaction.update({
                        embeds: [emb('Utilidades', 'Escolha:', { thumb: BLUU.face })],
                        components: [menuUtil()]
                    });
                }
                if (val === 'ai_info') {
                    return interaction.update({
                        embeds: [emb('Como usar a IA', [
                            '1. **Marque o bot** e escreva: `@Bluudud oi tudo bem?`',
                            '2. **Responda** a mensagem do bot para continuar a conversa',
                            '3. O historico fica salvo por canal + usuario',
                            '',
                            'Mwehehe, bora conversar!'
                        ].join('\n'), { image: BLUU.dance })],
                        components: [
                            new ActionRowBuilder().addComponents(
                                new StringSelectMenuBuilder()
                                    .setCustomId('painel_main')
                                    .setPlaceholder('Voltar ao painel...')
                                    .addOptions({ label: 'Voltar ao painel', value: 'util', emoji: '◀️' })
                            )
                        ]
                    });
                }
            }

            // helpers de resposta efemera em update/followup
            const replyEmbed = async (title, desc, opts = {}) => {
                if (interaction.replied || interaction.deferred) {
                    return interaction.followUp({ embeds: [emb(title, desc, opts)], ephemeral: true });
                }
                return interaction.reply({ embeds: [emb(title, desc, opts)], ephemeral: true });
            };

            if (id === 'painel_config') {
                if (val === 'back') return goBack();
                if (val === 'ver') {
                    const cfg = configBoasVindas.get(guild.id) || {};
                    const tagLines = cfg.tagRoles
                        ? Object.entries(cfg.tagRoles).map(([t, rid]) => {
                            const info = LOJA_ITENS[t];
                            return `${info?.emoji || ''} ${info?.label || t} → <@&${rid}>`;
                        }).join('\n') || 'Nenhum'
                        : 'Nenhum';
                    return interaction.update({
                        embeds: [emb('Config atual', null, {
                            fields: [
                                { name: 'Canal', value: cfg.canalId ? `<#${cfg.canalId}>` : '—', inline: true },
                                { name: 'Cargo entrada', value: cfg.cargoId ? `<@&${cfg.cargoId}>` : '—', inline: true },
                                { name: 'Mensagem', value: cfg.mensagem || 'Padrao' },
                                { name: 'Tags → Cargos', value: tagLines }
                            ]
                        })],
                        components: [menuConfig()]
                    });
                }
            }

            if (id === 'painel_mod') {
                if (val === 'back') return goBack();
                if (val === 'lock') {
                    if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return interaction.reply({ content: 'Sem permissao.', ephemeral: true });
                    await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
                    return interaction.reply({ embeds: [emb('Canal trancado', null, { thumb: BLUU.face })] });
                }
                if (val === 'unlock') {
                    if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return interaction.reply({ content: 'Sem permissao.', ephemeral: true });
                    await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
                    return interaction.reply({ embeds: [emb('Canal liberado', null, { thumb: BLUU.face })] });
                }
                if (val === 'limpar10' || val === 'limpar25') {
                    if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return interaction.reply({ content: 'Sem permissao.', ephemeral: true });
                    const q = val === 'limpar10' ? 10 : 25;
                    await interaction.deferReply({ ephemeral: true });
                    const deleted = await interaction.channel.bulkDelete(q, true).catch(() => null);
                    return interaction.editReply(`Apaguei **${deleted?.size || 0}** mensagens.`);
                }
            }

            if (id === 'painel_eco') {
                if (val === 'back') return goBack();
                if (val === 'saldo') {
                    const c = iniciarConta(user.id);
                    return interaction.reply({ embeds: [emb(`Saldo — ${formatUser(user.id, user.username)}`, `Carteira: **${c.carteira}**\nBanco: **${c.banco}**`, { thumb: user.displayAvatarURL() })], ephemeral: true });
                }
                if (val === 'daily') {
                    const cd = checkCd(user.id, 'daily', 24 * 60 * 60 * 1000);
                    if (cd) return interaction.reply({ content: `Espere **${formatTime(cd)}**.`, ephemeral: true });
                    const c = iniciarConta(user.id);
                    const ganho = 200 + Math.floor(Math.random() * 150);
                    c.carteira += ganho;
                    persistBanco();
                    return interaction.reply({ embeds: [emb('Daily', `+**${ganho}** coins\nSaldo: **${c.carteira}**`, { image: BLUU.dance })] });
                }
                if (val === 'trabalhar') {
                    const cd = checkCd(user.id, 'trabalhar', 15 * 60 * 1000);
                    if (cd) return interaction.reply({ content: `Espere **${formatTime(cd)}**.`, ephemeral: true });
                    const ganho = 50 + Math.floor(Math.random() * 100);
                    const c = iniciarConta(user.id);
                    c.carteira += ganho;
                    persistBanco();
                    return interaction.reply({ embeds: [emb('Trabalho', `+**${ganho}** coins`, { image: BLUU.dance })] });
                }
                if (val === 'crime') {
                    const cd = checkCd(user.id, 'crime', 8 * 60 * 1000);
                    if (cd) return interaction.reply({ content: `Espere **${formatTime(cd)}**.`, ephemeral: true });
                    const c = iniciarConta(user.id);
                    if (Math.random() < 0.5) {
                        const g = 80 + Math.floor(Math.random() * 120);
                        c.carteira += g;
                        persistBanco();
                        return interaction.reply({ embeds: [emb('Crime sucesso', `+**${g}**`, { image: BLUU.dance })] });
                    }
                    const m = Math.min(c.carteira, 40 + Math.floor(Math.random() * 60));
                    c.carteira -= m;
                    persistBanco();
                    return interaction.reply({ embeds: [emb('Falhou', `-${m}`, { thumb: BLUU.face })] });
                }
                if (val === 'slots50') {
                    const valor = 50;
                    const c = iniciarConta(user.id);
                    if (c.carteira < valor) return interaction.reply({ content: 'Saldo insuficiente.', ephemeral: true });
                    const icons = ['🍒', '🍋', '🍇', '💎', '7️⃣', '💙'];
                    const a = icons[Math.floor(Math.random() * icons.length)];
                    const b = icons[Math.floor(Math.random() * icons.length)];
                    const d = icons[Math.floor(Math.random() * icons.length)];
                    let result = `\`${a} | ${b} | ${d}\``;
                    if (a === b && b === d) {
                        const mult = ['💎', '7️⃣', '💙'].includes(a) ? 5 : 3;
                        c.carteira += valor * mult;
                        result += `\nx${mult} +${valor * mult}`;
                    } else {
                        c.carteira -= valor;
                        result += `\n-${valor}`;
                    }
                    persistBanco();
                    return interaction.reply({ embeds: [emb('Slots', `${result}\nSaldo: **${c.carteira}**`, { image: BLUU.dance })] });
                }
                if (val === 'ranking') {
                    const sorted = [...banco.entries()]
                        .map(([id, v]) => ({ id, total: (v.carteira || 0) + (v.banco || 0) }))
                        .sort((a, b) => b.total - a.total)
                        .slice(0, 10);
                    const lines = sorted.map((x, i) => `**${i + 1}.** <@${x.id}> — **${x.total}**`).join('\n') || 'Vazio';
                    return interaction.reply({ embeds: [emb('Top ricos', lines, { image: BLUU.dance })] });
                }
            }

            if (id === 'painel_loja') {
                if (val === 'back') return goBack();
                if (val === 'inv') {
                    const inv = getInv(user.id);
                    const items = Object.entries(inv)
                        .filter(([k, v]) => !['tags', 'equippedTag'].includes(k) && typeof v === 'number' && v > 0)
                        .map(([k, v]) => `**${k}** x${v}`).join('\n') || 'Nenhum item';
                    const tags = (inv.tags || []).map(t => {
                        const i = LOJA_ITENS[t];
                        return `${i?.emoji || ''} ${i?.label || t}${inv.equippedTag === t ? ' (equipada)' : ''}`;
                    }).join('\n') || 'Nenhuma tag';
                    return interaction.reply({ embeds: [emb('Inventario', `**Itens**\n${items}\n\n**Tags**\n${tags}`, { thumb: user.displayAvatarURL() })], ephemeral: true });
                }
                if (val.startsWith('buy_')) {
                    const itemId = val.slice(4);
                    const info = LOJA_ITENS[itemId];
                    if (!info) return interaction.reply({ content: 'Item invalido.', ephemeral: true });
                    const c = iniciarConta(user.id);
                    if (c.carteira < info.preco) return interaction.reply({ content: 'Saldo insuficiente.', ephemeral: true });
                    const inv = getInv(user.id);
                    if (info.tipo === 'tag') {
                        if (inv.tags.includes(itemId)) return interaction.reply({ content: 'Voce ja tem essa tag.', ephemeral: true });
                        inv.tags.push(itemId);
                    } else {
                        inv[itemId] = (inv[itemId] || 0) + 1;
                    }
                    c.carteira -= info.preco;
                    persistBanco();
                    persistInventory();
                    return interaction.reply({ embeds: [emb('Compra', `Comprou ${info.emoji} **${info.label || itemId}**!`, { thumb: BLUU.face })] });
                }
                if (val.startsWith('eq_')) {
                    const tag = val === 'eq_none' ? 'none' : val.slice(3);
                    const inv = getInv(user.id);
                    if (tag === 'none') {
                        inv.equippedTag = null;
                        persistInventory();
                        const m = await guild.members.fetch(user.id).catch(() => null);
                        if (m) await applyTagRole(guild, m, null);
                        return interaction.reply({ embeds: [emb('Tag removida', null, { thumb: BLUU.face })] });
                    }
                    if (!inv.tags.includes(tag)) return interaction.reply({ content: 'Voce nao tem essa tag. Compre na loja.', ephemeral: true });
                    inv.equippedTag = tag;
                    persistInventory();
                    const m = await guild.members.fetch(user.id).catch(() => null);
                    if (m) await applyTagRole(guild, m, tag);
                    const info = LOJA_ITENS[tag];
                    return interaction.reply({ embeds: [emb('Tag equipada', `${info.emoji} **${info.label}**`, { image: BLUU.dance })] });
                }
                if (val === 'use_pocao' || val === 'use_caixa') {
                    const item = val === 'use_pocao' ? 'pocao' : 'caixa';
                    const inv = getInv(user.id);
                    if (!inv[item] || inv[item] < 1) return interaction.reply({ content: 'Voce nao tem esse item.', ephemeral: true });
                    inv[item]--;
                    if (inv[item] <= 0) delete inv[item];
                    persistInventory();
                    if (item === 'pocao') {
                        addXP(user.id, 50);
                        return interaction.reply({ embeds: [emb('Pocao', '+50 XP!', { image: BLUU.dance })] });
                    }
                    const g = 50 + Math.floor(Math.random() * 250);
                    const c = iniciarConta(user.id);
                    c.carteira += g;
                    persistBanco();
                    return interaction.reply({ embeds: [emb('Caixa', `+**${g}** coins`, { image: BLUU.dance })] });
                }
            }

            if (id === 'painel_nivel') {
                if (val === 'back') return goBack();
                if (val === 'rank') {
                    await interaction.deferReply();
                    const lv = getLevelData(user.id);
                    const c = iniciarConta(user.id);
                    const rep = reps.get(user.id) || 0;
                    const tag = getTagDisplay(user.id);
                    try {
                        const buf = await generateProfileCard(user, lv, c.carteira + c.banco, rep, tag);
                        return interaction.editReply({ files: [new AttachmentBuilder(buf, { name: 'rank.png' })] });
                    } catch {
                        return interaction.editReply({ embeds: [emb('Rank', `Nivel **${lv.level}** · ${lv.xp} XP`, { thumb: user.displayAvatarURL() })] });
                    }
                }
                if (val === 'top') {
                    await interaction.deferReply();
                    const sorted = [...levels.entries()]
                        .map(([id, v]) => ({ id, level: v.level || 1, xp: v.xp || 0 }))
                        .sort((a, b) => b.level - a.level || b.xp - a.xp)
                        .slice(0, 10);
                    const entries = [];
                    for (const x of sorted) {
                        let username = x.id, avatarURL = null;
                        try {
                            const u = await client.users.fetch(x.id);
                            username = u.username;
                            avatarURL = u.displayAvatarURL({ extension: 'png', size: 128 });
                        } catch {}
                        entries.push({ username, avatarURL, level: x.level, xp: x.xp, tag: getTagDisplay(x.id) });
                    }
                    try {
                        const buf = await generateLeaderboardCard(entries);
                        return interaction.editReply({ files: [new AttachmentBuilder(buf, { name: 'top.png' })] });
                    } catch {
                        const lines = entries.map((e, i) => `**${i + 1}.** ${e.username} — Nv ${e.level}`).join('\n');
                        return interaction.editReply({ embeds: [emb('Top niveis', lines || 'Vazio')] });
                    }
                }
            }

            if (id === 'painel_social') {
                if (val === 'back') return goBack();
                if (val === 'perfil') {
                    await interaction.deferReply();
                    const lv = getLevelData(user.id);
                    const c = iniciarConta(user.id);
                    const rep = reps.get(user.id) || 0;
                    const tag = getTagDisplay(user.id);
                    try {
                        const buf = await generateProfileCard(user, lv, c.carteira + c.banco, rep, tag);
                        return interaction.editReply({ files: [new AttachmentBuilder(buf, { name: 'perfil.png' })] });
                    } catch {
                        return interaction.editReply({ embeds: [emb('Perfil', formatUser(user.id, user.username), { thumb: user.displayAvatarURL() })] });
                    }
                }
                if (val === 'afk') {
                    afkMap.set(user.id, 'AFK');
                    return interaction.reply({ embeds: [emb('AFK', 'Status AFK ativado. Mande qualquer msg para sair.', { thumb: BLUU.face })] });
                }
                if (val === 'unafk') {
                    afkMap.delete(user.id);
                    return interaction.reply({ embeds: [emb('AFK removido', null, { thumb: BLUU.face })] });
                }
                if (val === 'divorciar') {
                    if (!marriages.has(user.id)) return interaction.reply({ content: 'Voce nao esta casado.', ephemeral: true });
                    const outro = marriages.get(user.id);
                    marriages.delete(user.id);
                    marriages.delete(outro);
                    persistMarriages();
                    return interaction.reply({ embeds: [emb('Divorcio', null, { thumb: BLUU.face })] });
                }
            }

            if (id === 'painel_fun') {
                if (val === 'back') return goBack();
                if (val === 'meme') return interaction.reply({ embeds: [emb('Meme', 'tem bluudude get in nowww!!!', { image: BLUU.dance })] });
                if (val === 'dado') return interaction.reply({ embeds: [emb('Dado', `**${1 + Math.floor(Math.random() * 6)}**`, { thumb: BLUU.face })] });
                if (val === 'moeda') return interaction.reply({ embeds: [emb('Moeda', Math.random() < 0.5 ? 'Cara' : 'Coroa', { image: BLUU.dance })] });
                if (val === 'piada') {
                    const list = ['Por que o Bluudud nao usa espada? Prefere pirulito.', 'O que fala no mic? Mwehehe!'];
                    return interaction.reply({ embeds: [emb('Piada', list[Math.floor(Math.random() * list.length)], { thumb: BLUU.face })] });
                }
                if (val === 'cantada') return interaction.reply({ embeds: [emb('Cantada', 'Things are getting a whole lot bluer…', { image: BLUU.dance })] });
                if (val === 'bluudanc') return interaction.reply({ embeds: [emb('Bluudanc', 'yayyy wahooo weeeeee', { image: BLUU.dance })] });
                if (val === 'howgay' || val === 'rizz') {
                    const n = Math.floor(Math.random() * 101);
                    return interaction.reply({ embeds: [emb(val === 'howgay' ? 'How gay' : 'Rizz', `**${user.username}**: **${n}%**`, { thumb: BLUU.face })] });
                }
            }

            if (id === 'painel_util') {
                if (val === 'back' || val === 'util') return goBack();
                if (val === 'ping') return interaction.reply({ embeds: [emb('Ping', `API: **${client.ws.ping}ms**`, { thumb: BLUU.face })] });
                if (val === 'ajuda') {
                    return interaction.reply({
                        embeds: [emb('Ajuda', [
                            '**/painel** — menu com todas as opcoes',
                            '**/config** · **/mod** — staff',
                            '**IA:** marque o bot ou responda a mensagem dele',
                            'Site: daily, rank universal e chat IA'
                        ].join('\n'), { image: BLUU.dance })]
                    });
                }
                if (val === 'serverinfo') {
                    return interaction.reply({
                        embeds: [emb(guild.name, null, {
                            thumb: guild.iconURL({ size: 128 }),
                            fields: [
                                { name: 'Membros', value: `${guild.memberCount}`, inline: true },
                                { name: 'Criado', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }
                            ]
                        })]
                    });
                }
                if (val === 'uptime') {
                    const s = Math.floor(process.uptime());
                    return interaction.reply({ embeds: [emb('Uptime', `**${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m**`, { thumb: BLUU.face })] });
                }
                if (val === 'convite') {
                    const url = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`;
                    return interaction.reply({ embeds: [emb('Convite', `[Clique aqui](${url})`, { image: BLUU.dance })] });
                }
            }
        }
    } catch (err) {
        console.error('Interaction error:', err);
        const payload = { content: 'Erro ao executar.', ephemeral: true };
        if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
        else await interaction.reply(payload).catch(() => {});
    }
});

client.login(process.env.TOKEN).catch(err => {
    console.error('Login falhou:', err.message);
    process.exit(1);
});

// ==================== EXPRESS (DEPOIS do client) ====================
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
    if (!req.session.user) return res.status(401).json({ error: 'Nao autenticado' });
    res.json(req.session.user);
});

app.get('/api/servers', async (req, res) => {
    if (!req.session.token) return res.status(401).json({ error: 'Nao autenticado' });
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

app.get('/api/welcome/:guildId', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Nao autenticado' });
    const cfg = configBoasVindas.get(req.params.guildId) || {};
    res.json({ channelId: cfg.canalId || null, roleId: cfg.cargoId || null, message: cfg.mensagem || null });
});

app.post('/api/welcome/:guildId', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Nao autenticado' });
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
    if (!req.session.user) return res.status(401).json({ error: 'Nao autenticado' });
    const cfg = configBoasVindas.get(req.params.guildId);
    if (!cfg?.canalId) return res.status(400).json({ error: 'Nenhum canal configurado' });
    const g = client.guilds.cache.get(req.params.guildId);
    if (!g) return res.status(404).json({ error: 'Bot nao esta no servidor' });
    const ch = g.channels.cache.get(cfg.canalId);
    if (!ch) return res.status(404).json({ error: 'Canal nao encontrado' });
    let texto = (cfg.mensagem || 'Seja bem-vindo(a)!')
        .replace(/{membro}/g, `<@${req.session.user.id}>`)
        .replace(/{servidor}/g, g.name)
        .replace(/{total}/g, g.memberCount);
    try {
        await ch.send({ embeds: [emb('Teste de boas-vindas', texto, { image: BLUU.dance })] });
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Erro ao enviar' });
    }
});

app.post('/api/ai', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Nao autenticado' });
    const { message } = req.body;
    if (!message || typeof message !== 'string') return res.status(400).json({ error: 'Invalido' });
    try {
        res.json({ reply: await askGroq(message.trim().slice(0, 1000)) });
    } catch {
        res.status(500).json({ error: 'Erro IA' });
    }
});

// APIs do site — DEPOIS do app = express()
app.get('/api/profile', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Nao autenticado' });
    const id = req.session.user.id;
    const c = iniciarConta(id);
    const lv = getLevelData(id);
    const inv = getInv(id);
    const rep = reps.get(id) || 0;
    const key = `${id}:daily`;
    let dailyCd = 0;
    if (cooldowns.has(key)) {
        const left = Math.ceil((cooldowns.get(key) - Date.now()) / 1000);
        dailyCd = left > 0 ? left : 0;
    }
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
        tag: getTagDisplay(id),
        equippedTag: inv.equippedTag,
        tags: inv.tags || [],
        dailyCooldown: dailyCd,
        marriedTo: marriages.get(id) || null
    });
});

app.post('/api/daily', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Nao autenticado' });
    const id = req.session.user.id;
    const cd = checkCd(id, 'daily', 24 * 60 * 60 * 1000);
    if (cd) return res.status(429).json({ error: 'Aguarde', cooldown: cd });
    const c = iniciarConta(id);
    const ganho = 200 + Math.floor(Math.random() * 150);
    c.carteira += ganho;
    persistBanco();
    res.json({ success: true, ganho, saldo: c.carteira });
});

app.get('/api/rank', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Nao autenticado' });
    const sorted = [...levels.entries()]
        .map(([id, v]) => ({ id, level: v.level || 1, xp: v.xp || 0, tag: getTagDisplay(id) }))
        .sort((a, b) => b.level - a.level || b.xp - a.xp)
        .slice(0, 25);
    const enriched = sorted.map((e, i) => {
        let username = e.id, avatar = null;
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
        me: { id: meId, rank: myPos || null, level: myData.level, xp: myData.xp, tag: getTagDisplay(meId) }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dashboard na porta ${PORT}`));