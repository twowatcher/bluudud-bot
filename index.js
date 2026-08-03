require('dotenv').config();
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    PermissionsBitField,
    ApplicationCommandOptionType,
    ChannelType
} = require('discord.js');
const Groq = require('groq-sdk');
const crypto = require('crypto');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ]
});

// ==================== BANCOS EM MEMÓRIA ====================
const banco = new Map();
const configBoasVindas = new Map();
const dailyCooldown = new Map();
const afkUsers = new Map();

const iniciarConta = (id) => {
    if (!banco.has(id)) banco.set(id, { carteira: 100 });
};

// ==================== GROQ AI (seguro) ====================
let groq = null;
if (process.env.GROQ_API_KEY) {
    try {
        groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        console.log('✅ Groq AI carregada');
    } catch (e) {
        console.error('❌ Erro ao iniciar Groq:', e.message);
    }
} else {
    console.warn('⚠️ GROQ_API_KEY não definida. Comandos de IA desativados.');
}

async function askGroq(prompt, system = 'Você é um assistente útil, divertido e conciso em português brasileiro.') {
    if (!groq) {
        return '❌ A IA não está configurada. Defina a variável `GROQ_API_KEY` no ambiente.';
    }
    try {
        const completion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: prompt }
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.7,
            max_tokens: 1024
        });
        return completion.choices[0]?.message?.content || 'Não consegui gerar uma resposta.';
    } catch (err) {
        console.error('Erro Groq:', err.message);
        return '❌ Erro ao se comunicar com a IA. Tente novamente mais tarde.';
    }
}

// Helpers de embed
const embed = (title, desc, color = 0x2F3136) =>
    new EmbedBuilder().setColor(color).setTitle(title).setDescription(desc).setTimestamp();

const erro = (msg) =>
    new EmbedBuilder().setColor(0xED4245).setTitle('❌ Erro').setDescription(msg);

const sucesso = (title, msg) =>
    new EmbedBuilder().setColor(0x57F287).setTitle(`✅ ${title}`).setDescription(msg);

// ==================== SLASH COMMANDS ====================
const commandsData = [
    // === ORIGINAIS ===
    { name: 'config-boasvindas', description: 'Configura o canal de boas-vindas do servidor.', options: [{ name: 'canal', description: 'Selecione o canal de texto', type: ApplicationCommandOptionType.Channel, channelTypes: [ChannelType.GuildText], required: true }] },
    { name: 'config-mensagem', description: 'Define a mensagem customizada de boas-vindas.', options: [{ name: 'mensagem', description: 'Use {membro}, {servidor} e {total}', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'config-cargo', description: 'Define o cargo automático dado aos novos membros.', options: [{ name: 'cargo', description: 'Selecione o cargo', type: ApplicationCommandOptionType.Role, required: true }] },
    { name: 'ping', description: 'Mostra a latência do bot.' },
    { name: 'limpar', description: 'Apaga mensagens do canal.', options: [{ name: 'quantidade', description: 'Quantidade (1 a 99)', type: ApplicationCommandOptionType.Integer, required: true }] },
    { name: 'expulsar', description: 'Expulsa um membro.', options: [{ name: 'membro', description: 'Membro', type: ApplicationCommandOptionType.User, required: true }, { name: 'motivo', description: 'Motivo', type: ApplicationCommandOptionType.String, required: false }] },
    { name: 'banir', description: 'Bane um membro.', options: [{ name: 'membro', description: 'Membro', type: ApplicationCommandOptionType.User, required: true }, { name: 'motivo', description: 'Motivo', type: ApplicationCommandOptionType.String, required: false }] },
    { name: 'meme', description: 'Envia um meme ou frase engraçada.' },
    { name: 'lock', description: 'Tranca o canal atual.' },
    { name: 'unlock', description: 'Destranca o canal atual.' },
    { name: 'modolento', description: 'Define o modo lento.', options: [{ name: 'segundos', description: 'Segundos (0 para desativar)', type: ApplicationCommandOptionType.Integer, required: true }] },
    { name: 'warn', description: 'Avisa um membro.', options: [{ name: 'membro', description: 'Membro', type: ApplicationCommandOptionType.User, required: true }, { name: 'motivo', description: 'Motivo', type: ApplicationCommandOptionType.String, required: false }] },
    { name: 'setnick', description: 'Altera o apelido de um membro.', options: [{ name: 'membro', description: 'Membro', type: ApplicationCommandOptionType.User, required: true }, { name: 'apelido', description: 'Novo apelido', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'serverinfo', description: 'Informações do servidor.' },
    { name: 'avatar', description: 'Mostra o avatar de um usuário.', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'userinfo', description: 'Informações de um usuário.', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'uptime', description: 'Tempo online do bot.' },
    { name: 'falar', description: 'Faz o bot falar algo.', options: [{ name: 'mensagem', description: 'Mensagem', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'sorteio', description: 'Sorteio rápido.', options: [{ name: 'premio', description: 'Prêmio', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'convite', description: 'Link de convite do bot.' },
    { name: 'calculadora', description: 'Operação matemática.', options: [
        { name: 'n1', description: 'Primeiro número', type: ApplicationCommandOptionType.Number, required: true },
        { name: 'operacao', description: 'Operação', type: ApplicationCommandOptionType.String, required: true, choices: [
            { name: 'Soma (+)', value: '+' }, { name: 'Subtração (-)', value: '-' },
            { name: 'Multiplicação (*)', value: '*' }, { name: 'Divisão (/)', value: '/' }
        ]},
        { name: 'n2', description: 'Segundo número', type: ApplicationCommandOptionType.Number, required: true }
    ]},
    { name: 'regras', description: 'Regras do servidor.' },
    { name: 'links', description: 'Links úteis.' },
    { name: 'dado', description: 'Rola um dado.', options: [{ name: 'lados', description: 'Lados (padrão 6)', type: ApplicationCommandOptionType.Integer, required: false }] },
    { name: 'moeda', description: 'Cara ou coroa.' },
    { name: 'biscoito', description: 'Biscoito da sorte.' },
    { name: '8ball', description: 'Bola de cristal.', options: [{ name: 'pergunta', description: 'Pergunta', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'abracar', description: 'Abraça alguém.', options: [{ name: 'membro', description: 'Membro', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'beijar', description: 'Beija alguém.', options: [{ name: 'membro', description: 'Membro', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'tapa', description: 'Dá um tapa.', options: [{ name: 'membro', description: 'Membro', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'cantada', description: 'Manda uma cantada.' },
    { name: 'piada', description: 'Conta uma piada.' },
    { name: 'atacar', description: 'Ataca alguém.', options: [{ name: 'membro', description: 'Membro', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'elogiar', description: 'Elogia alguém.', options: [{ name: 'membro', description: 'Membro', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'reverso', description: 'Inverte o texto.', options: [{ name: 'texto', description: 'Texto', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'ship', description: 'Shipa você com alguém.', options: [{ name: 'membro', description: 'Membro', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'chances', description: 'Calcula chances.', options: [{ name: 'pergunta', description: 'De quê?', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'gado', description: 'Nível de gado.', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'qi', description: 'Calcula o QI.', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'dolar', description: 'Info sobre o dólar.' },
    { name: 'escolha', description: 'Escolhe entre opções.', options: [
        { name: 'opcao1', description: 'Opção 1', type: ApplicationCommandOptionType.String, required: true },
        { name: 'opcao2', description: 'Opção 2', type: ApplicationCommandOptionType.String, required: true }
    ]},
    { name: 'diga', description: 'Mensagem de boas-vindas do bot.' },
    { name: 'votar', description: 'Cria enquete sim/não.', options: [{ name: 'tema', description: 'Tema', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'saldo', description: 'Mostra seu saldo.' },
    { name: 'daily', description: 'Resgata o daily.' },
    { name: 'trabalhar', description: 'Trabalha e ganha dinheiro.' },
    { name: 'apostar', description: 'Aposta em cara ou coroa.', options: [{ name: 'valor', description: 'Valor', type: ApplicationCommandOptionType.Integer, required: true }] },
    { name: 'doar', description: 'Doa dinheiro.', options: [
        { name: 'membro', description: 'Destinatário', type: ApplicationCommandOptionType.User, required: true },
        { name: 'valor', description: 'Valor', type: ApplicationCommandOptionType.Integer, required: true }
    ]},
    { name: 'jokenpo', description: 'Pedra, papel ou tesoura.', options: [{ name: 'jogada', description: 'Sua jogada', type: ApplicationCommandOptionType.String, required: true, choices: [
        { name: 'Pedra 🪨', value: 'pedra' }, { name: 'Papel 📄', value: 'papel' }, { name: 'Tesoura ✂️', value: 'tesoura' }
    ]}]},
    { name: 'adivinhe', description: 'Adivinhe de 1 a 10.', options: [{ name: 'numero', description: 'Palpite', type: ApplicationCommandOptionType.Integer, required: true }] },
    { name: 'fps', description: 'FPS do seu humor.' },
    { name: 'hackear', description: 'Hackeia alguém (fake).', options: [{ name: 'membro', description: 'Alvo', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'roleta', description: 'Roleta russa.' },
    { name: 'soco', description: 'Dá um soco.', options: [{ name: 'membro', description: 'Alvo', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'morder', description: 'Morde alguém.', options: [{ name: 'membro', description: 'Alvo', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'matar', description: 'Elimina alguém no chat.', options: [{ name: 'membro', description: 'Alvo', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'correr', description: 'Foge do canal.' },
    { name: 'ajuda', description: 'Lista de comandos.' },

    // ==================== IA GROQ ====================
    { name: 'ai', description: 'Converse com a IA (Groq)', options: [{ name: 'pergunta', description: 'O que você quer perguntar?', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'traduzir', description: 'Traduz texto com IA', options: [
        { name: 'texto', description: 'Texto', type: ApplicationCommandOptionType.String, required: true },
        { name: 'idioma', description: 'Idioma de destino', type: ApplicationCommandOptionType.String, required: true }
    ]},
    { name: 'resumir', description: 'Resume um texto', options: [{ name: 'texto', description: 'Texto', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'corrigir', description: 'Corrige gramática/ortografia', options: [{ name: 'texto', description: 'Texto', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'ai-imagine', description: 'Gera prompt de imagem com IA', options: [{ name: 'ideia', description: 'Ideia da imagem', type: ApplicationCommandOptionType.String, required: true }] },

    // ==================== +50 NOVOS ====================
    // Utilitários
    { name: 'senha', description: 'Gera senha segura', options: [{ name: 'tamanho', description: 'Tamanho (8-64)', type: ApplicationCommandOptionType.Integer, required: false }] },
    { name: 'uuid', description: 'Gera um UUID' },
    { name: 'cor', description: 'Gera cor hexadecimal aleatória' },
    { name: 'timestamp', description: 'Timestamp atual do Discord' },
    { name: 'base64', description: 'Encode/decode Base64', options: [
        { name: 'acao', description: 'encode ou decode', type: ApplicationCommandOptionType.String, required: true, choices: [{ name: 'Encode', value: 'encode' }, { name: 'Decode', value: 'decode' }] },
        { name: 'texto', description: 'Texto', type: ApplicationCommandOptionType.String, required: true }
    ]},
    { name: 'morse', description: 'Texto para código Morse', options: [{ name: 'texto', description: 'Texto', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'binario', description: 'Texto para binário', options: [{ name: 'texto', description: 'Texto', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'hash', description: 'Hash MD5 de um texto', options: [{ name: 'texto', description: 'Texto', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'emojify', description: 'Transforma em emojis de bandeira', options: [{ name: 'texto', description: 'Texto', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'mock', description: 'TeXtO mOcKaDo', options: [{ name: 'texto', description: 'Texto', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'uwu', description: 'Transforma em uwu', options: [{ name: 'texto', description: 'Texto', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'palmas', description: 'Adiciona 👏 entre palavras', options: [{ name: 'texto', description: 'Texto', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'vaporwave', description: 'Estilo vaporwave', options: [{ name: 'texto', description: 'Texto', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'inverter-palavras', description: 'Inverte ordem das palavras', options: [{ name: 'texto', description: 'Texto', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'contar', description: 'Conta caracteres, palavras e linhas', options: [{ name: 'texto', description: 'Texto', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'lembrar', description: 'Define um lembrete', options: [
        { name: 'minutos', description: 'Minutos', type: ApplicationCommandOptionType.Integer, required: true },
        { name: 'mensagem', description: 'O que lembrar', type: ApplicationCommandOptionType.String, required: true }
    ]},

    // Diversão
    { name: 'zoar', description: 'Roasta alguém', options: [{ name: 'membro', description: 'Alvo', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'sua-mae', description: 'Piada de sua mãe' },
    { name: 'frase', description: 'Frase motivacional' },
    { name: 'fato', description: 'Fato aleatório' },
    { name: 'conselho', description: 'Conselho aleatório' },
    { name: 'voce-prefere', description: 'Você prefere...?' },
    { name: 'verdade-ou-desafio', description: 'Verdade ou desafio' },
    { name: 'eu-nunca', description: 'Eu nunca...' },
    { name: 'avaliar', description: 'Avalia algo de 0 a 10', options: [{ name: 'algo', description: 'O quê?', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'howgay', description: 'Nível de gay', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'howhot', description: 'Nível de hot', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'pp', description: 'Tamanho do pp', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'sus', description: 'Nível de sus', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'simp', description: 'Nível de simp', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'rizz', description: 'Nível de rizz', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'aura', description: 'Nível de aura', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'sigma', description: 'Nível de sigma', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'npc', description: 'Nível de NPC', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },
    { name: 'brainrot', description: 'Nível de brainrot', options: [{ name: 'usuario', description: 'Usuário', type: ApplicationCommandOptionType.User, required: false }] },

    // Economia extra
    { name: 'roubar', description: 'Tenta roubar alguém', options: [{ name: 'membro', description: 'Alvo', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'crime', description: 'Comete um crime' },
    { name: 'slots', description: 'Caça-níqueis', options: [{ name: 'valor', description: 'Aposta', type: ApplicationCommandOptionType.Integer, required: true }] },
    { name: 'ranking', description: 'Ranking dos mais ricos' },
    { name: 'pagar', description: 'Paga alguém (alias de doar)', options: [
        { name: 'membro', description: 'Destinatário', type: ApplicationCommandOptionType.User, required: true },
        { name: 'valor', description: 'Valor', type: ApplicationCommandOptionType.Integer, required: true }
    ]},

    // Moderação extra
    { name: 'mutar', description: 'Muta temporariamente', options: [
        { name: 'membro', description: 'Membro', type: ApplicationCommandOptionType.User, required: true },
        { name: 'minutos', description: 'Duração em minutos', type: ApplicationCommandOptionType.Integer, required: true },
        { name: 'motivo', description: 'Motivo', type: ApplicationCommandOptionType.String, required: false }
    ]},
    { name: 'desmutar', description: 'Remove o mute', options: [{ name: 'membro', description: 'Membro', type: ApplicationCommandOptionType.User, required: true }] },
    { name: 'desbanir', description: 'Desbane um usuário', options: [{ name: 'userid', description: 'ID do usuário', type: ApplicationCommandOptionType.String, required: true }] },
    { name: 'softban', description: 'Ban + unban (limpa mensagens)', options: [
        { name: 'membro', description: 'Membro', type: ApplicationCommandOptionType.User, required: true },
        { name: 'motivo', description: 'Motivo', type: ApplicationCommandOptionType.String, required: false }
    ]},
    { name: 'adicionar-cargo', description: 'Adiciona cargo a um membro', options: [
        { name: 'membro', description: 'Membro', type: ApplicationCommandOptionType.User, required: true },
        { name: 'cargo', description: 'Cargo', type: ApplicationCommandOptionType.Role, required: true }
    ]},
    { name: 'remover-cargo', description: 'Remove cargo de um membro', options: [
        { name: 'membro', description: 'Membro', type: ApplicationCommandOptionType.User, required: true },
        { name: 'cargo', description: 'Cargo', type: ApplicationCommandOptionType.Role, required: true }
    ]},
    { name: 'canal-info', description: 'Info do canal atual' },
    { name: 'cargo-info', description: 'Info de um cargo', options: [{ name: 'cargo', description: 'Cargo', type: ApplicationCommandOptionType.Role, required: true }] },
    { name: 'afk', description: 'Define status AFK', options: [{ name: 'motivo', description: 'Motivo', type: ApplicationCommandOptionType.String, required: false }] }
];

// ==================== EVENTOS ====================
client.on('guildMemberAdd', async (member) => {
    const serverConfig = configBoasVindas.get(member.guild.id);
    if (!serverConfig) return;

    if (serverConfig.cargoId) {
        const cargo = member.guild.roles.cache.get(serverConfig.cargoId);
        if (cargo) await member.roles.add(cargo).catch(() => {});
    }

    if (serverConfig.canalId) {
        const canal = member.guild.channels.cache.get(serverConfig.canalId);
        if (canal) {
            let texto = serverConfig.mensagem || 'Seja bem-vindo(a) ao nosso servidor!';
            texto = texto
                .replace(/{membro}/g, `${member}`)
                .replace(/{servidor}/g, member.guild.name)
                .replace(/{total}/g, member.guild.memberCount);

            const emb = new EmbedBuilder()
                .setColor(0x00FF99)
                .setTitle('✨ Nova chegada!')
                .setDescription(texto)
                .setThumbnail(member.user.displayAvatarURL({ forceStatic: false }))
                .setTimestamp();

            await canal.send({ embeds: [emb] }).catch(() => {});
        }
    }
});

client.once('ready', async () => {
    console.log(`✅ ${client.user.tag} ONLINE!`);
    client.user.setActivity('fazendo moderação com estilo + IA', { type: 3 });

    try {
        await client.application.commands.set(commandsData);
        console.log('✅ Slash Commands registrados!');
    } catch (error) {
        console.error('Erro ao registrar comandos:', error);
    }
});

// ==================== HANDLER ====================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, guild, member, channel, user } = interaction;

    if (!configBoasVindas.has(guild.id)) {
        configBoasVindas.set(guild.id, { canalId: null, cargoId: null, mensagem: null });
    }
    const dadosServidor = configBoasVindas.get(guild.id);

    // ===== CONFIG =====
    if (commandName === 'config-boasvindas') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator))
            return interaction.reply({ embeds: [erro('Apenas administradores.')], ephemeral: true });
        dadosServidor.canalId = options.getChannel('canal').id;
        return interaction.reply({ embeds: [sucesso('Config', `Canal de boas-vindas: <#${dadosServidor.canalId}>`)], ephemeral: true });
    }
    if (commandName === 'config-mensagem') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator))
            return interaction.reply({ embeds: [erro('Apenas administradores.')], ephemeral: true });
        dadosServidor.mensagem = options.getString('mensagem');
        return interaction.reply({ embeds: [sucesso('Config', 'Mensagem de boas-vindas atualizada!')], ephemeral: true });
    }
    if (commandName === 'config-cargo') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator))
            return interaction.reply({ embeds: [erro('Apenas administradores.')], ephemeral: true });
        const cargo = options.getRole('cargo');
        dadosServidor.cargoId = cargo.id;
        return interaction.reply({ embeds: [sucesso('Config', `Cargo automático: **${cargo.name}**`)], ephemeral: true });
    }

    // ===== MODERAÇÃO =====
    if (commandName === 'ping') {
        return interaction.reply({ embeds: [embed('🏓 Pong!', `Latência: \`${Date.now() - interaction.createdTimestamp}ms\``, 0x5865F2)] });
    }
    if (commandName === 'limpar') {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages))
            return interaction.reply({ embeds: [erro('Sem permissão.')], ephemeral: true });
        const qtd = options.getInteger('quantidade');
        if (qtd < 1 || qtd > 99) return interaction.reply({ embeds: [erro('Use entre 1 e 99.')], ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        await channel.bulkDelete(qtd, true).catch(() => {});
        return interaction.editReply({ embeds: [embed('🧹 Limpeza', `Apaguei **${qtd}** mensagens.`, 0x57F287)] });
    }
    if (commandName === 'expulsar') {
        if (!member.permissions.has(PermissionsBitField.Flags.KickMembers))
            return interaction.reply({ embeds: [erro('Sem permissão.')], ephemeral: true });
        const alvo = options.getUser('membro');
        const motivo = options.getString('motivo') || 'Sem motivo';
        const m = await guild.members.fetch(alvo.id).catch(() => null);
        if (!m) return interaction.reply({ embeds: [erro('Membro não encontrado.')], ephemeral: true });
        await m.kick(motivo).catch(() => {});
        return interaction.reply({ embeds: [embed('🚪 Expulso', `**${alvo.tag}** foi expulso.\nMotivo: ${motivo}`, 0xED4245)] });
    }
    if (commandName === 'banir') {
        if (!member.permissions.has(PermissionsBitField.Flags.BanMembers))
            return interaction.reply({ embeds: [erro('Sem permissão.')], ephemeral: true });
        const alvo = options.getUser('membro');
        const motivo = options.getString('motivo') || 'Quebrou as regras';
        const m = await guild.members.fetch(alvo.id).catch(() => null);
        if (!m) return interaction.reply({ embeds: [erro('Membro não encontrado.')], ephemeral: true });
        await m.ban({ reason: motivo }).catch(() => {});
        return interaction.reply({ embeds: [embed('🔨 Banido', `**${alvo.tag}** foi banido.\nMotivo: ${motivo}`, 0xED4245)] });
    }
    if (commandName === 'lock') {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels))
            return interaction.reply({ embeds: [erro('Sem permissão.')], ephemeral: true });
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).catch(() => {});
        return interaction.reply({ embeds: [embed('🔒 Trancado', 'Canal trancado.', 0xED4245)] });
    }
    if (commandName === 'unlock') {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels))
            return interaction.reply({ embeds: [erro('Sem permissão.')], ephemeral: true });
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }).catch(() => {});
        return interaction.reply({ embeds: [embed('🔓 Destrancado', 'Canal destrancado.', 0x57F287)] });
    }
    if (commandName === 'modolento') {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels))
            return interaction.reply({ embeds: [erro('Sem permissão.')], ephemeral: true });
        const s = options.getInteger('segundos');
        await channel.setRateLimitPerUser(s).catch(() => {});
        return interaction.reply({ embeds: [embed('⏳ Modo lento', `Definido para **${s}s**.`, 0x5865F2)] });
    }
    if (commandName === 'warn') {
        const alvo = options.getUser('membro');
        const motivo = options.getString('motivo') || 'Comportamento inadequado';
        return interaction.reply({ embeds: [embed('⚠️ Aviso', `**${alvo}** foi avisado.\nMotivo: ${motivo}`, 0xFEE75C)] });
    }
    if (commandName === 'setnick') {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageNicknames))
            return interaction.reply({ embeds: [erro('Sem permissão.')], ephemeral: true });
        const alvo = options.getUser('membro');
        const nick = options.getString('apelido');
        const m = await guild.members.fetch(alvo.id).catch(() => null);
        if (!m) return interaction.reply({ embeds: [erro('Membro inválido.')], ephemeral: true });
        await m.setNickname(nick).catch(() => {});
        return interaction.reply({ embeds: [embed('📝 Apelido', `Apelido de ${alvo} → **${nick}**`, 0x5865F2)] });
    }
    if (commandName === 'mutar') {
        if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
            return interaction.reply({ embeds: [erro('Sem permissão.')], ephemeral: true });
        const alvo = options.getUser('membro');
        const mins = options.getInteger('minutos');
        const motivo = options.getString('motivo') || 'Sem motivo';
        const m = await guild.members.fetch(alvo.id).catch(() => null);
        if (!m) return interaction.reply({ embeds: [erro('Membro não encontrado.')], ephemeral: true });
        await m.timeout(mins * 60 * 1000, motivo).catch(() => {});
        return interaction.reply({ embeds: [embed('🔇 Mutado', `**${alvo.tag}** mutado por **${mins}** min.\nMotivo: ${motivo}`, 0xFEE75C)] });
    }
    if (commandName === 'desmutar') {
        if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
            return interaction.reply({ embeds: [erro('Sem permissão.')], ephemeral: true });
        const alvo = options.getUser('membro');
        const m = await guild.members.fetch(alvo.id).catch(() => null);
        if (!m) return interaction.reply({ embeds: [erro('Membro não encontrado.')], ephemeral: true });
        await m.timeout(null).catch(() => {});
        return interaction.reply({ embeds: [embed('🔊 Desmutado', `**${alvo.tag}** foi desmutado.`, 0x57F287)] });
    }
    if (commandName === 'desbanir') {
        if (!member.permissions.has(PermissionsBitField.Flags.BanMembers))
            return interaction.reply({ embeds: [erro('Sem permissão.')], ephemeral: true });
        const id = options.getString('userid');
        await guild.members.unban(id).catch(() => null);
        return interaction.reply({ embeds: [embed('🔓 Desban', `Usuário \`${id}\` desbanido.`, 0x57F287)] });
    }
    if (commandName === 'softban') {
        if (!member.permissions.has(PermissionsBitField.Flags.BanMembers))
            return interaction.reply({ embeds: [erro('Sem permissão.')], ephemeral: true });
        const alvo = options.getUser('membro');
        const motivo = options.getString('motivo') || 'Softban';
        const m = await guild.members.fetch(alvo.id).catch(() => null);
        if (!m) return interaction.reply({ embeds: [erro('Membro não encontrado.')], ephemeral: true });
        await m.ban({ deleteMessageSeconds: 604800, reason: motivo }).catch(() => {});
        await guild.members.unban(alvo.id).catch(() => {});
        return interaction.reply({ embeds: [embed('🔨 Softban', `**${alvo.tag}** softbanido.\nMotivo: ${motivo}`, 0xED4245)] });
    }
    if (commandName === 'adicionar-cargo') {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageRoles))
            return interaction.reply({ embeds: [erro('Sem permissão.')], ephemeral: true });
        const alvo = options.getUser('membro');
        const cargo = options.getRole('cargo');
        const m = await guild.members.fetch(alvo.id).catch(() => null);
        if (!m) return interaction.reply({ embeds: [erro('Membro não encontrado.')], ephemeral: true });
        await m.roles.add(cargo).catch(() => {});
        return interaction.reply({ embeds: [sucesso('Cargo', `Cargo ${cargo} adicionado a ${alvo}.`)] });
    }
    if (commandName === 'remover-cargo') {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageRoles))
            return interaction.reply({ embeds: [erro('Sem permissão.')], ephemeral: true });
        const alvo = options.getUser('membro');
        const cargo = options.getRole('cargo');
        const m = await guild.members.fetch(alvo.id).catch(() => null);
        if (!m) return interaction.reply({ embeds: [erro('Membro não encontrado.')], ephemeral: true });
        await m.roles.remove(cargo).catch(() => {});
        return interaction.reply({ embeds: [sucesso('Cargo', `Cargo ${cargo} removido de ${alvo}.`)] });
    }

    // ===== UTILS =====
    if (commandName === 'serverinfo') {
        const emb = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`📊 ${guild.name}`)
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .addFields(
                { name: 'Membros', value: `${guild.memberCount}`, inline: true },
                { name: 'Criado em', value: guild.createdAt.toLocaleDateString('pt-BR'), inline: true }
            );
        return interaction.reply({ embeds: [emb] });
    }
    if (commandName === 'avatar') {
        const u = options.getUser('usuario') || user;
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`🖼️ ${u.username}`).setImage(u.displayAvatarURL({ dynamic: true, size: 1024 }))] });
    }
    if (commandName === 'userinfo') {
        const u = options.getUser('usuario') || user;
        return interaction.reply({ embeds: [embed('👤 User Info', `**Tag:** ${u.tag}\n**ID:** ${u.id}\n**Criado em:** ${u.createdAt.toLocaleDateString('pt-BR')}`, 0x5865F2)] });
    }
    if (commandName === 'uptime') {
        let t = Math.floor(client.uptime / 1000);
        const d = Math.floor(t / 86400); t %= 86400;
        const h = Math.floor(t / 3600); t %= 3600;
        const m = Math.floor(t / 60); const s = t % 60;
        return interaction.reply({ embeds: [embed('⏰ Uptime', `\`${d}d ${h}h ${m}m ${s}s\``, 0x5865F2)] });
    }
    if (commandName === 'falar') {
        const msg = options.getString('mensagem');
        await interaction.reply({ content: 'Enviado!', ephemeral: true });
        return channel.send(msg);
    }
    if (commandName === 'sorteio') {
        const premio = options.getString('premio');
        const membros = await guild.members.fetch();
        const ganhador = membros.filter(m => !m.user.bot).random();
        if (!ganhador) return interaction.reply({ embeds: [erro('Poucos membros.')], ephemeral: true });
        return interaction.reply({ embeds: [embed('🎉 Sorteio', `**Prêmio:** ${premio}\n**Ganhador:** ${ganhador}`, 0xEB459E)] });
    }
    if (commandName === 'convite') {
        return interaction.reply({ embeds: [embed('🔗 Convite', `[Clique para me adicionar](https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands)`, 0x5865F2)] });
    }
    if (commandName === 'calculadora') {
        const n1 = options.getNumber('n1');
        const op = options.getString('operacao');
        const n2 = options.getNumber('n2');
        let res;
        if (op === '+') res = n1 + n2;
        else if (op === '-') res = n1 - n2;
        else if (op === '*') res = n1 * n2;
        else res = n2 !== 0 ? n1 / n2 : 'Divisão por zero';
        return interaction.reply({ embeds: [embed('🔢 Calculadora', `${n1} ${op} ${n2} = **${res}**`, 0x5865F2)] });
    }
    if (commandName === 'regras') {
        return interaction.reply({ embeds: [embed('📜 Regras', '1. Não seja chato.\n2. Não floode.\n3. Respeite todo mundo.', 0x5865F2)] });
    }
    if (commandName === 'links') {
        return interaction.reply({ embeds: [embed('🌐 Links', 'Site: Em breve\nTwitter: Em breve', 0x5865F2)] });
    }
    if (commandName === 'canal-info') {
        return interaction.reply({ embeds: [embed('📌 Canal', `**Nome:** ${channel.name}\n**ID:** ${channel.id}\n**Criado:** ${channel.createdAt.toLocaleDateString('pt-BR')}`, 0x5865F2)] });
    }
    if (commandName === 'cargo-info') {
        const cargo = options.getRole('cargo');
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(cargo.color || 0x5865F2).setTitle(`🎭 ${cargo.name}`).addFields(
            { name: 'ID', value: cargo.id, inline: true },
            { name: 'Membros', value: `${cargo.members.size}`, inline: true },
            { name: 'Cor', value: cargo.hexColor, inline: true }
        )] });
    }
    if (commandName === 'lembrar') {
        const mins = options.getInteger('minutos');
        const msg = options.getString('mensagem');
        await interaction.reply({ embeds: [embed('⏰ Lembrete', `Vou te lembrar em **${mins}** min: "${msg}"`, 0x57F287)], ephemeral: true });
        setTimeout(() => {
            user.send({ embeds: [embed('⏰ Lembrete', msg, 0xFEE75C)] }).catch(() => {});
        }, mins * 60 * 1000);
        return;
    }
    if (commandName === 'afk') {
        const motivo = options.getString('motivo') || 'AFK';
        afkUsers.set(user.id, { motivo, since: Date.now() });
        return interaction.reply({ embeds: [embed('💤 AFK', `Você está AFK: **${motivo}**`, 0x5865F2)] });
    }

    // ===== DIVERSÃO ORIGINAIS =====
    if (commandName === 'meme') {
        const memes = ['Por que o programador faliu? Porque usava muito break!', 'O código funciona, mas eu não sei o porquê. Não mexa.', 'Tudo na vida passa, menos a vontade de pizza.'];
        return interaction.reply({ embeds: [embed('😂 Meme', memes[Math.floor(Math.random() * memes.length)], 0xFEE75C)] });
    }
    if (commandName === 'dado') {
        const lados = options.getInteger('lados') || 6;
        return interaction.reply({ embeds: [embed('🎲 Dado', `d${lados} → **${Math.floor(Math.random() * lados) + 1}**`, 0x5865F2)] });
    }
    if (commandName === 'moeda') {
        return interaction.reply({ embeds: [embed('🪙 Moeda', Math.random() > 0.5 ? '**Cara**' : '**Coroa**', 0xFEE75C)] });
    }
    if (commandName === 'biscoito') {
        const f = ['Você terá um dia incrível!', 'A recompensa pelo bom trabalho é mais trabalho.', 'Amanhã você acorda rico (ou não).'];
        return interaction.reply({ embeds: [embed('🥠 Biscoito', f[Math.floor(Math.random() * f.length)], 0xFEE75C)] });
    }
    if (commandName === '8ball') {
        const r = ['Sim!', 'Com certeza', 'Talvez', 'Não', 'Definitivamente não.'];
        return interaction.reply({ embeds: [embed('🔮 8-Ball', `**Pergunta:** ${options.getString('pergunta')}\n**Resposta:** ${r[Math.floor(Math.random() * r.length)]}`, 0x5865F2)] });
    }
    if (commandName === 'abracar') return interaction.reply({ embeds: [embed('🤗 Abraço', `${user} abraçou ${options.getUser('membro')}!`, 0xEB459E)] });
    if (commandName === 'beijar') return interaction.reply({ embeds: [embed('💋 Beijo', `${user} beijou ${options.getUser('membro')}!`, 0xEB459E)] });
    if (commandName === 'tapa') return interaction.reply({ embeds: [embed('💥 Tapa', `${user} deu um tapa em ${options.getUser('membro')}!`, 0xED4245)] });
    if (commandName === 'cantada') {
        const c = ['Você não é Wi-Fi, mas sinto uma conexão.', 'Me chama de tabela periódica e diz que rola química.'];
        return interaction.reply({ embeds: [embed('😏 Cantada', c[Math.floor(Math.random() * c.length)], 0xEB459E)] });
    }
    if (commandName === 'piada') {
        const p = ['Por que o jacaré tirou o filho da escola? Porque ele ré-ptil de ano.', 'O que o tomate foi fazer no banco? Tirar o extrato.'];
        return interaction.reply({ embeds: [embed('🤡 Piada', p[Math.floor(Math.random() * p.length)], 0xFEE75C)] });
    }
    if (commandName === 'atacar') return interaction.reply({ embeds: [embed('⚔️ Ataque', `${user} atacou ${options.getUser('membro')} e causou **${Math.floor(Math.random() * 100)}** de dano!`, 0xED4245)] });
    if (commandName === 'elogiar') return interaction.reply({ embeds: [embed('✨ Elogio', `${options.getUser('membro')}, ${user} te acha incrível!`, 0x57F287)] });
    if (commandName === 'reverso') return interaction.reply({ embeds: [embed('🔄 Reverso', options.getString('texto').split('').reverse().join(''), 0x5865F2)] });
    if (commandName === 'ship') {
        const t = options.getUser('membro');
        return interaction.reply({ embeds: [embed('❤️ Ship', `${user.username} + ${t.username} = **${Math.floor(Math.random() * 101)}%**`, 0xEB459E)] });
    }
    if (commandName === 'chances') return interaction.reply({ embeds: [embed('📊 Chances', `"${options.getString('pergunta')}" → **${Math.floor(Math.random() * 101)}%**`, 0x5865F2)] });
    if (commandName === 'gado') {
        const t = options.getUser('usuario') || user;
        return interaction.reply({ embeds: [embed('🐂 Gado', `${t.username} é **${Math.floor(Math.random() * 101)}%** gado.`, 0xFEE75C)] });
    }
    if (commandName === 'qi') {
        const t = options.getUser('usuario') || user;
        return interaction.reply({ embeds: [embed('🧠 QI', `QI de ${t.username}: **${Math.floor(Math.random() * 200)}**`, 0x5865F2)] });
    }
    if (commandName === 'dolar') return interaction.reply({ embeds: [embed('💵 Dólar', 'O dólar está alto. Vá trabalhar!', 0x57F287)] });
    if (commandName === 'escolha') {
        const o = [options.getString('opcao1'), options.getString('opcao2')];
        return interaction.reply({ embeds: [embed('🤔 Escolha', `Eu escolho: **${o[Math.floor(Math.random() * 2)]}**`, 0x5865F2)] });
    }
    if (commandName === 'diga') return interaction.reply({ embeds: [embed('👋 Olá', 'Use `/` para ver os comandos!', 0x5865F2)] });
    if (commandName === 'votar') {
        const tema = options.getString('tema');
        const msg = await interaction.reply({ embeds: [embed('📊 Votação', tema, 0x5865F2)], fetchReply: true });
        await msg.react('👍');
        await msg.react('👎');
        return;
    }

    // ===== ECONOMIA =====
    if (commandName === 'saldo') {
        iniciarConta(user.id);
        return interaction.reply({ embeds: [embed('💰 Saldo', `Você tem **$${banco.get(user.id).carteira}**`, 0xFEE75C)] });
    }
    if (commandName === 'daily') {
        const agora = Date.now();
        if (dailyCooldown.has(user.id) && agora - dailyCooldown.get(user.id) < 86400000) {
            const resto = Math.ceil((86400000 - (agora - dailyCooldown.get(user.id))) / 3600000);
            return interaction.reply({ embeds: [erro(`Daily já resgatado. Volte em ~${resto}h.`)], ephemeral: true });
        }
        iniciarConta(user.id);
        banco.get(user.id).carteira += 200;
        dailyCooldown.set(user.id, agora);
        return interaction.reply({ embeds: [embed('📆 Daily', 'Você resgatou **$200**!', 0x57F287)] });
    }
    if (commandName === 'trabalhar') {
        iniciarConta(user.id);
        const ganho = Math.floor(Math.random() * 80) + 20;
        banco.get(user.id).carteira += ganho;
        return interaction.reply({ embeds: [embed('💼 Trabalho', `Você ganhou **$${ganho}**.`, 0x57F287)] });
    }
    if (commandName === 'apostar') {
        iniciarConta(user.id);
        const conta = banco.get(user.id);
        const valor = options.getInteger('valor');
        if (valor <= 0 || valor > conta.carteira)
            return interaction.reply({ embeds: [erro('Valor inválido ou saldo insuficiente.')], ephemeral: true });
        if (Math.random() > 0.5) {
            conta.carteira += valor;
            return interaction.reply({ embeds: [embed('🎉 Ganhou!', `+$${valor}`, 0x57F287)] });
        }
        conta.carteira -= valor;
        return interaction.reply({ embeds: [embed('😭 Perdeu', `-$${valor}`, 0xED4245)] });
    }
    if (commandName === 'doar' || commandName === 'pagar') {
        iniciarConta(user.id);
        const alvo = options.getUser('membro');
        const valor = options.getInteger('valor');
        if (valor <= 0) return interaction.reply({ embeds: [erro('Valor deve ser > 0.')], ephemeral: true });
        iniciarConta(alvo.id);
        if (banco.get(user.id).carteira < valor)
            return interaction.reply({ embeds: [erro('Saldo insuficiente.')], ephemeral: true });
        banco.get(user.id).carteira -= valor;
        banco.get(alvo.id).carteira += valor;
        return interaction.reply({ embeds: [embed('💸 Transferência', `Você enviou **$${valor}** para ${alvo.username}.`, 0x57F287)] });
    }
    if (commandName === 'roubar') {
        const alvo = options.getUser('membro');
        if (alvo.id === user.id) return interaction.reply({ embeds: [erro('Não dá pra se roubar.')], ephemeral: true });
        iniciarConta(user.id);
        iniciarConta(alvo.id);
        if (banco.get(alvo.id).carteira < 50)
            return interaction.reply({ embeds: [erro('Essa pessoa é pobre demais.')], ephemeral: true });
        if (Math.random() < 0.4) {
            const roubado = Math.floor(Math.random() * 80) + 20;
            banco.get(user.id).carteira += roubado;
            banco.get(alvo.id).carteira -= roubado;
            return interaction.reply({ embeds: [embed('💰 Roubo', `Você roubou **$${roubado}** de ${alvo.username}!`, 0x57F287)] });
        }
        const multa = Math.floor(Math.random() * 50) + 10;
        banco.get(user.id).carteira = Math.max(0, banco.get(user.id).carteira - multa);
        return interaction.reply({ embeds: [embed('🚔 Falhou', `Você foi pego e perdeu **$${multa}**.`, 0xED4245)] });
    }
    if (commandName === 'crime') {
        iniciarConta(user.id);
        const crimes = [
            { nome: 'Assalto a banco', chance: 0.3, premio: 300, multa: 100 },
            { nome: 'Furto de carteira', chance: 0.6, premio: 80, multa: 30 },
            { nome: 'Hackear sistema', chance: 0.4, premio: 200, multa: 70 }
        ];
        const c = crimes[Math.floor(Math.random() * crimes.length)];
        if (Math.random() < c.chance) {
            banco.get(user.id).carteira += c.premio;
            return interaction.reply({ embeds: [embed('🦹 Crime', `**${c.nome}** deu certo! +$${c.premio}`, 0x57F287)] });
        }
        banco.get(user.id).carteira = Math.max(0, banco.get(user.id).carteira - c.multa);
        return interaction.reply({ embeds: [embed('🚔 Crime', `**${c.nome}** falhou. -$${c.multa}`, 0xED4245)] });
    }
    if (commandName === 'slots') {
        iniciarConta(user.id);
        const valor = options.getInteger('valor');
        const conta = banco.get(user.id);
        if (valor <= 0 || valor > conta.carteira)
            return interaction.reply({ embeds: [erro('Valor inválido.')], ephemeral: true });
        const emojis = ['🍒', '🍋', '🍊', '🍇', '💎', '7️⃣'];
        const roll = [emojis[Math.floor(Math.random()*6)], emojis[Math.floor(Math.random()*6)], emojis[Math.floor(Math.random()*6)]];
        let mult = 0;
        if (roll[0] === roll[1] && roll[1] === roll[2]) mult = roll[0] === '💎' ? 10 : 5;
        else if (roll[0] === roll[1] || roll[1] === roll[2]) mult = 2;
        if (mult > 0) {
            const ganho = valor * mult;
            conta.carteira += ganho;
            return interaction.reply({ embeds: [embed('🎰 Slots', `${roll.join(' | ')}\nVocê ganhou **$${ganho}** (x${mult})!`, 0x57F287)] });
        }
        conta.carteira -= valor;
        return interaction.reply({ embeds: [embed('🎰 Slots', `${roll.join(' | ')}\nVocê perdeu **$${valor}**.`, 0xED4245)] });
    }
    if (commandName === 'ranking') {
        const top = [...banco.entries()]
            .sort((a, b) => b[1].carteira - a[1].carteira)
            .slice(0, 10)
            .map(([id, d], i) => `${i + 1}. <@${id}> — **$${d.carteira}**`)
            .join('\n') || 'Ninguém ainda.';
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFFD700).setTitle('🏆 Ranking').setDescription(top)] });
    }

    // ===== MINI GAMES =====
    if (commandName === 'jokenpo') {
        const bot = ['pedra', 'papel', 'tesoura'][Math.floor(Math.random() * 3)];
        const userC = options.getString('jogada');
        if (userC === bot) return interaction.reply({ embeds: [embed('🤝 Empate', `Ambos: **${bot}**`, 0xFEE75C)] });
        const win = (userC === 'pedra' && bot === 'tesoura') || (userC === 'papel' && bot === 'pedra') || (userC === 'tesoura' && bot === 'papel');
        return interaction.reply({ embeds: [embed(win ? '🎉 Vitória' : '😔 Derrota', `Você: **${userC}** | Eu: **${bot}**`, win ? 0x57F287 : 0xED4245)] });
    }
    if (commandName === 'adivinhe') {
        const segredo = Math.floor(Math.random() * 10) + 1;
        const palpite = options.getInteger('numero');
        if (palpite === segredo) return interaction.reply({ embeds: [embed('🎯 Acertou!', 'Mandou bem!', 0x57F287)] });
        return interaction.reply({ embeds: [embed('❌ Errou', `Era **${segredo}**.`, 0xED4245)] });
    }
    if (commandName === 'fps') return interaction.reply({ embeds: [embed('🎮 FPS', `Rodando a **${Math.floor(Math.random() * 60) + 180} FPS**.`, 0x57F287)] });
    if (commandName === 'hackear') return interaction.reply({ embeds: [embed('💻 Hack', `Hackeando ${options.getUser('membro').username}...\nSenha: \`batatinha123\``, 0x5865F2)] });
    if (commandName === 'roleta') {
        if (Math.random() < 0.16) return interaction.reply({ embeds: [embed('💥 Roleta', 'MORREU!', 0xED4245)] });
        return interaction.reply({ embeds: [embed('🏳️ Roleta', 'Sobreviveu!', 0x57F287)] });
    }
    if (commandName === 'soco') return interaction.reply({ embeds: [embed('🥊 Soco', `${user} socou ${options.getUser('membro')}!`, 0xED4245)] });
    if (commandName === 'morder') return interaction.reply({ embeds: [embed('😬 Mordida', `${user} mordeu ${options.getUser('membro')}!`, 0xEB459E)] });
    if (commandName === 'matar') return interaction.reply({ embeds: [embed('💀 Eliminação', `${user} eliminou ${options.getUser('membro')}!`, 0xED4245)] });
    if (commandName === 'correr') return interaction.reply({ embeds: [embed('🏃 Fuga', 'Você saiu correndo!', 0x5865F2)] });

    // ===== IA =====
    if (commandName === 'ai') {
        await interaction.deferReply();
        const r = await askGroq(options.getString('pergunta'));
        return interaction.editReply({ embeds: [embed('🤖 IA (Groq)', r, 0x00FFAA)] });
    }
    if (commandName === 'traduzir') {
        await interaction.deferReply();
        const r = await askGroq(`Traduza para ${options.getString('idioma')}:\n\n${options.getString('texto')}`, 'Responda apenas com a tradução.');
        return interaction.editReply({ embeds: [embed('🌐 Tradução', r, 0x00FFAA)] });
    }
    if (commandName === 'resumir') {
        await interaction.deferReply();
        const r = await askGroq(`Resuma de forma clara:\n\n${options.getString('texto')}`);
        return interaction.editReply({ embeds: [embed('📝 Resumo', r, 0x00FFAA)] });
    }
    if (commandName === 'corrigir') {
        await interaction.deferReply();
        const r = await askGroq(`Corrija a gramática e ortografia. Responda só com o texto corrigido:\n\n${options.getString('texto')}`);
        return interaction.editReply({ embeds: [embed('✏️ Corrigido', r, 0x00FFAA)] });
    }
    if (commandName === 'ai-imagine') {
        await interaction.deferReply();
        const r = await askGroq(`Crie um prompt detalhado em inglês para gerar imagem com IA baseado em: "${options.getString('ideia')}"`);
        return interaction.editReply({ embeds: [embed('🎨 Prompt', r, 0x00FFAA)] });
    }

    // ===== NOVOS UTILITÁRIOS =====
    if (commandName === 'senha') {
        const len = options.getInteger('tamanho') || 16;
        if (len < 8 || len > 64) return interaction.reply({ embeds: [erro('Tamanho 8–64.')], ephemeral: true });
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
        let p = '';
        for (let i = 0; i < len; i++) p += chars[Math.floor(Math.random() * chars.length)];
        return interaction.reply({ embeds: [embed('🔐 Senha', `\`${p}\``, 0x5865F2)], ephemeral: true });
    }
    if (commandName === 'uuid') {
        const u = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
        return interaction.reply({ embeds: [embed('🆔 UUID', `\`${u}\``, 0x5865F2)] });
    }
    if (commandName === 'cor') {
        const c = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
        return interaction.reply({ embeds: [embed('🎨 Cor', `\`${c}\``, parseInt(c.slice(1), 16))] });
    }
    if (commandName === 'timestamp') {
        const now = Math.floor(Date.now() / 1000);
        return interaction.reply({ embeds: [embed('⏰ Timestamp', `<t:${now}:F>\n\`\`\`<t:${now}:F>\`\`\``, 0x5865F2)] });
    }
    if (commandName === 'base64') {
        const acao = options.getString('acao');
        const texto = options.getString('texto');
        try {
            const r = acao === 'encode' ? Buffer.from(texto).toString('base64') : Buffer.from(texto, 'base64').toString('utf8');
            return interaction.reply({ embeds: [embed('📦 Base64', `\`\`\`${r}\`\`\``, 0x5865F2)] });
        } catch {
            return interaction.reply({ embeds: [erro('Erro no Base64.')], ephemeral: true });
        }
    }
    if (commandName === 'morse') {
        const map = { A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..','0':'-----','1':'.----','2':'..---','3':'...--','4':'....-','5':'.....','6':'-....','7':'--...','8':'---..','9':'----.',' ':'/' };
        const r = options.getString('texto').toUpperCase().split('').map(c => map[c] || c).join(' ');
        return interaction.reply({ embeds: [embed('📡 Morse', r, 0x5865F2)] });
    }
    if (commandName === 'binario') {
        const r = options.getString('texto').split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
        return interaction.reply({ embeds: [embed('💻 Binário', r, 0x5865F2)] });
    }
    if (commandName === 'hash') {
        const h = crypto.createHash('md5').update(options.getString('texto')).digest('hex');
        return interaction.reply({ embeds: [embed('🔒 MD5', `\`${h}\``, 0x5865F2)] });
    }
    if (commandName === 'emojify') {
        const map = { a:'🇦',b:'🇧',c:'🇨',d:'🇩',e:'🇪',f:'🇫',g:'🇬',h:'🇭',i:'🇮',j:'🇯',k:'🇰',l:'🇱',m:'🇲',n:'🇳',o:'🇴',p:'🇵',q:'🇶',r:'🇷',s:'🇸',t:'🇹',u:'🇺',v:'🇻',w:'🇼',x:'🇽',y:'🇾',z:'🇿' };
        const r = options.getString('texto').toLowerCase().split('').map(c => map[c] || c).join(' ');
        return interaction.reply({ embeds: [embed('🔤 Emojify', r, 0x5865F2)] });
    }
    if (commandName === 'mock') {
        const r = options.getString('texto').split('').map((c, i) => i % 2 ? c.toUpperCase() : c.toLowerCase()).join('');
        return interaction.reply({ embeds: [embed('🤡 Mock', r, 0xFEE75C)] });
    }
    if (commandName === 'uwu') {
        let t = options.getString('texto').replace(/(?:r|l)/gi, m => m === m.toUpperCase() ? 'W' : 'w');
        return interaction.reply({ embeds: [embed('UwU', t + ' uwu', 0xEB459E)] });
    }
    if (commandName === 'palmas') {
        return interaction.reply({ embeds: [embed('👏 Palmas', options.getString('texto').split(' ').join(' 👏 '), 0xFEE75C)] });
    }
    if (commandName === 'vaporwave') {
        return interaction.reply({ embeds: [embed('🌊 Vaporwave', options.getString('texto').split('').join(' '), 0x5865F2)] });
    }
    if (commandName === 'inverter-palavras') {
        return interaction.reply({ embeds: [embed('🔄 Palavras', options.getString('texto').split(' ').reverse().join(' '), 0x5865F2)] });
    }
    if (commandName === 'contar') {
        const t = options.getString('texto');
        return interaction.reply({ embeds: [embed('🔢 Contagem', `**Caracteres:** ${t.length}\n**Palavras:** ${t.trim().split(/\s+/).filter(Boolean).length}\n**Linhas:** ${t.split('\n').length}`, 0x5865F2)] });
    }

    // ===== NOVOS DIVERSÃO =====
    if (commandName === 'zoar') {
        const roasts = ['Você é tão lento que o Windows atualiza mais rápido.', 'Se a estupidez fosse arte, você seria Picasso.', 'Até o reflexo no espelho te evita.'];
        return interaction.reply({ embeds: [embed('🔥 Zoar', `${options.getUser('membro')}, ${roasts[Math.floor(Math.random() * roasts.length)]}`, 0xED4245)] });
    }
    if (commandName === 'sua-mae') {
        const j = ['Sua mãe é tão gorda que quando cai o chão rachou de rir.', 'Sua mãe é tão velha que o CPF dela é 1.'];
        return interaction.reply({ embeds: [embed('😂 Sua mãe', j[Math.floor(Math.random() * j.length)], 0xFEE75C)] });
    }
    if (commandName === 'frase') {
        const f = ['A vida é 10% o que acontece e 90% como você reage.', 'O sucesso é a soma de pequenos esforços diários.'];
        return interaction.reply({ embeds: [embed('💬 Frase', f[Math.floor(Math.random() * f.length)], 0x5865F2)] });
    }
    if (commandName === 'fato') {
        const f = ['O mel nunca estraga.', 'Um polvo tem três corações.', 'Bananas são bagas.'];
        return interaction.reply({ embeds: [embed('🧠 Fato', f[Math.floor(Math.random() * f.length)], 0x57F287)] });
    }
    if (commandName === 'conselho') {
        const c = ['Beba água.', 'Durma mais.', 'Faça backup.'];
        return interaction.reply({ embeds: [embed('💡 Conselho', c[Math.floor(Math.random() * c.length)], 0xFEE75C)] });
    }
    if (commandName === 'voce-prefere') {
        const q = ['Voar ou ser invisível?', 'Nunca mais redes sociais ou nunca mais fast food?', 'Saber a data ou a causa da sua morte?'];
        return interaction.reply({ embeds: [embed('🤔 Você prefere...', q[Math.floor(Math.random() * q.length)], 0x5865F2)] });
    }
    if (commandName === 'verdade-ou-desafio') {
        const tipo = Math.random() > 0.5 ? 'Verdade' : 'Desafio';
        const v = ['Qual foi a última mentira?', 'Qual seu maior medo?'];
        const d = ['Mande mensagem aleatória pra alguém.', 'Fale em voz de pato por 1 min.'];
        const c = tipo === 'Verdade' ? v[Math.floor(Math.random() * v.length)] : d[Math.floor(Math.random() * d.length)];
        return interaction.reply({ embeds: [embed(`🎲 ${tipo}`, c, 0xEB459E)] });
    }
    if (commandName === 'eu-nunca') {
        const l = ['Eu nunca... traí alguém.', 'Eu nunca... menti sobre minha idade.', 'Eu nunca... fingi estar doente.'];
        return interaction.reply({ embeds: [embed('🚫 Eu nunca...', l[Math.floor(Math.random() * l.length)], 0xFEE75C)] });
    }
    if (commandName === 'avaliar') {
        return interaction.reply({ embeds: [embed('⭐ Avaliar', `**${options.getString('algo')}** → **${(Math.random() * 10).toFixed(1)}/10**`, 0xFEE75C)] });
    }
    if (['howgay', 'howhot', 'pp', 'sus', 'simp', 'rizz', 'aura', 'sigma', 'npc', 'brainrot'].includes(commandName)) {
        const t = options.getUser('usuario') || user;
        const v = Math.floor(Math.random() * 101);
        const titles = {
            howgay: '🏳️‍🌈 How Gay', howhot: '🔥 How Hot', pp: '🍆 PP',
            sus: '📮 Sus', simp: '🥺 Simp', rizz: '😎 Rizz',
            aura: '✨ Aura', sigma: '🗿 Sigma', npc: '🤖 NPC', brainrot: '🧠 Brainrot'
        };
        const desc = commandName === 'pp'
            ? `${t.username}: 8${'='.repeat(Math.floor(v / 10))}D`
            : `${t.username} é **${v}%** ${commandName.replace('how', '')}`;
        return interaction.reply({ embeds: [embed(titles[commandName], desc, 0xEB459E)] });
    }

    // ===== AJUDA =====
    if (commandName === 'ajuda') {
        const emb = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('🔥 BLUUDUD BOT — Comandos')
            .setDescription('Bot completo com moderação, economia, diversão e **IA Groq**')
            .addFields(
                { name: '🤖 IA', value: '`/ai` `/traduzir` `/resumir` `/corrigir` `/ai-imagine`', inline: false },
                { name: '⚙️ Config', value: '`/config-boasvindas` `/config-mensagem` `/config-cargo`', inline: false },
                { name: '🛡️ Moderação', value: '`/limpar` `/expulsar` `/banir` `/mutar` `/desmutar` `/lock` `/unlock` `/modolento` `/warn` `/setnick` `/desbanir` `/softban` `/adicionar-cargo` `/remover-cargo`', inline: false },
                { name: '📊 Utilidades', value: '`/ping` `/serverinfo` `/avatar` `/userinfo` `/uptime` `/falar` `/sorteio` `/convite` `/calculadora` `/senha` `/uuid` `/cor` `/timestamp` `/base64` `/morse` `/binario` `/hash` `/emojify` `/mock` `/uwu` `/palmas` `/contar` `/lembrar` `/afk` `/canal-info` `/cargo-info`', inline: false },
                { name: '😂 Diversão', value: '`/meme` `/dado` `/moeda` `/biscoito` `/8ball` `/abracar` `/beijar` `/tapa` `/cantada` `/piada` `/ship` `/gado` `/qi` `/zoar` `/sua-mae` `/frase` `/fato` `/conselho` `/voce-prefere` `/verdade-ou-desafio` `/eu-nunca` `/avaliar` `/howgay` `/howhot` `/pp` `/sus` `/simp` `/rizz` `/aura` `/sigma` `/npc` `/brainrot`', inline: false },
                { name: '💰 Economia', value: '`/saldo` `/daily` `/trabalhar` `/apostar` `/doar` `/pagar` `/roubar` `/crime` `/slots` `/ranking`', inline: false },
                { name: '🎮 Games', value: '`/jokenpo` `/adivinhe` `/fps` `/hackear` `/roleta` `/soco` `/morder` `/matar` `/correr`', inline: false }
            );
        return interaction.reply({ embeds: [emb] });
    }
});

client.login(process.env.TOKEN);

// ==================== KEEP-ALIVE ====================
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bluudud Bot online com Slash Commands + IA! 🔥'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Keep-alive na porta ${PORT}`));
