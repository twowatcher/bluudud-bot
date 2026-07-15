require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    PermissionsBitField, 
    ApplicationCommandOptionType, 
    ChannelType 
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers
    ]
});

// Bancos de dados temporários na memória
const banco = new Map();
const configBoasVindas = new Map();

// Helper para iniciar conta bancária
const iniciarConta = (id) => {
    if (!banco.has(id)) banco.set(id, { carteira: 100 });
};

// ==================== REGISTRO DOS SLASH COMMANDS ====================
const commandsData = [
    {
        name: 'config-boasvindas',
        description: 'Configura o canal de boas-vindas do servidor.',
        options: [{
            name: 'canal',
            description: 'Selecione o canal de texto',
            type: ApplicationCommandOptionType.Channel,
            channelTypes: [ChannelType.GuildText],
            required: true
        }]
    },
    {
        name: 'config-mensagem',
        description: 'Define a mensagem customizada de boas-vindas.',
        options: [{
            name: 'mensagem',
            description: 'Use {membro}, {servidor} e {total} para customizar',
            type: ApplicationCommandOptionType.String,
            required: true
        }]
    },
    {
        name: 'config-cargo',
        description: 'Define o cargo automático dado aos novos membros.',
        options: [{
            name: 'cargo',
            description: 'Selecione o cargo',
            type: ApplicationCommandOptionType.Role,
            required: true
        }]
    },
    {
        name: 'ping',
        description: 'Mostra a latência do bot.'
    },
    {
        name: 'limpar',
        description: 'Apaga uma quantidade específica de mensagens do canal.',
        options: [{
            name: 'quantidade',
            description: 'Quantidade de mensagens (1 a 99)',
            type: ApplicationCommandOptionType.Integer,
            required: true
        }]
    },
    {
        name: 'expulsar',
        description: 'Expulsa um membro do servidor.',
        options: [
            { name: 'membro', description: 'Membro a ser expulso', type: ApplicationCommandOptionType.User, required: true },
            { name: 'motivo', description: 'Motivo do kick', type: ApplicationCommandOptionType.String, required: false }
        ]
    },
    {
        name: 'banir',
        description: 'Bane um membro do servidor.',
        options: [
            { name: 'membro', description: 'Membro a ser banido', type: ApplicationCommandOptionType.User, required: true },
            { name: 'motivo', description: 'Motivo do banimento', type: ApplicationCommandOptionType.String, required: false }
        ]
    },
    {
        name: 'meme',
        description: 'Envia um meme ou frase engraçada aleatória.'
    },
    {
        name: 'lock',
        description: 'Tranca o canal de texto atual.'
    },
    {
        name: 'unlock',
        description: 'Destranca o canal de texto atual.'
    },
    {
        name: 'modolento',
        description: 'Define o modo lento do canal atual.',
        options: [{
            name: 'segundos',
            description: 'Tempo em segundos (use 0 para desativar)',
            type: ApplicationCommandOptionType.Integer,
            required: true
        }]
    },
    {
        name: 'warn',
        description: 'Dá um aviso chamando a atenção de um membro.',
        options: [
            { name: 'membro', description: 'Membro a receber o aviso', type: ApplicationCommandOptionType.User, required: true },
            { name: 'motivo', description: 'Motivo do aviso', type: ApplicationCommandOptionType.String, required: false }
        ]
    },
    {
        name: 'setnick',
        description: 'Altera o apelido de um membro.',
        options: [
            { name: 'membro', description: 'Selecione o membro', type: ApplicationCommandOptionType.User, required: true },
            { name: 'apelido', description: 'Novo apelido', type: ApplicationCommandOptionType.String, required: true }
        ]
    },
    {
        name: 'serverinfo',
        description: 'Exibe informações do servidor.'
    },
    {
        name: 'avatar',
        description: 'Mostra o avatar de um usuário ou o seu próprio.',
        options: [{
            name: 'usuario',
            description: 'Selecione o usuário (deixe em branco para o seu)',
            type: ApplicationCommandOptionType.User,
            required: false
        }]
    },
    {
        name: 'userinfo',
        description: 'Mostra informações de um usuário.',
        options: [{
            name: 'usuario',
            description: 'Selecione o usuário (deixe em branco para o seu)',
            type: ApplicationCommandOptionType.User,
            required: false
        }]
    },
    {
        name: 'uptime',
        description: 'Mostra há quanto tempo estou online.'
    },
    {
        name: 'falar',
        description: 'Faz o bot falar algo no canal.',
        options: [{
            name: 'mensagem',
            description: 'O que eu devo falar?',
            type: ApplicationCommandOptionType.String,
            required: true
        }]
    },
    {
        name: 'sorteio',
        description: 'Realiza um sorteio rápido entre os membros online/reais.',
        options: [{
            name: 'premio',
            description: 'O que está sendo sorteado?',
            type: ApplicationCommandOptionType.String,
            required: true
        }]
    },
    {
        name: 'convite',
        description: 'Link para me convidar para o seu servidor.'
    },
    {
        name: 'calculadora',
        description: 'Realiza uma operação matemática simples.',
        options: [
            { name: 'n1', description: 'Primeiro número', type: ApplicationCommandOptionType.Number, required: true },
            { 
                name: 'operacao', 
                description: 'Escolha a operação', 
                type: ApplicationCommandOptionType.String, 
                required: true,
                choices: [
                    { name: 'Soma (+)', value: '+' },
                    { name: 'Subtração (-)', value: '-' },
                    { name: 'Multiplicação (*)', value: '*' },
                    { name: 'Divisão (/)', value: '/' }
                ]
            },
            { name: 'n2', description: 'Segundo número', type: ApplicationCommandOptionType.Number, required: true }
        ]
    },
    {
        name: 'regras',
        description: 'Mostra as regras básicas do servidor.'
    },
    {
        name: 'links',
        description: 'Mostra as redes sociais e links úteis.'
    },
    {
        name: 'dado',
        description: 'Rola um dado de quantos lados você quiser.',
        options: [{
            name: 'lados',
            description: 'Quantidade de lados (Padrão: 6)',
            type: ApplicationCommandOptionType.Integer,
            required: false
        }]
    },
    {
        name: 'moeda',
        description: 'Joga Cara ou Coroa.'
    },
    {
        name: 'biscoito',
        description: 'Abre um biscoito da sorte.'
    },
    {
        name: '8ball',
        description: 'Faz uma pergunta para a bola de cristal.',
        options: [{
            name: 'pergunta',
            description: 'Escreva a sua pergunta',
            type: ApplicationCommandOptionType.String,
            required: true
        }]
    },
    {
        name: 'abracar',
        description: 'Dá um abraço em alguém do servidor.',
        options: [{ name: 'membro', description: 'Quem você quer abraçar?', type: ApplicationCommandOptionType.User, required: true }]
    },
    {
        name: 'beijar',
        description: 'Dá um beijinho em alguém do servidor.',
        options: [{ name: 'membro', description: 'Quem você quer beijar?', type: ApplicationCommandOptionType.User, required: true }]
    },
    {
        name: 'tapa',
        description: 'Dá um tapa estalado em alguém.',
        options: [{ name: 'membro', description: 'Quem merece o tapa?', type: ApplicationCommandOptionType.User, required: true }]
    },
    {
        name: 'cantada',
        description: 'Manda aquela cantada infalível.'
    },
    {
        name: 'piada',
        description: 'Conta uma piada digna do Tio do Pavê.'
    },
    {
        name: 'atacar',
        description: 'Ataca um usuário e calcula o dano.',
        options: [{ name: 'membro', description: 'Quem você vai atacar?', type: ApplicationCommandOptionType.User, required: true }]
    },
    {
        name: 'elogiar',
        description: 'Elogia um membro de forma amigável.',
        options: [{ name: 'membro', description: 'Quem você quer elogiar?', type: ApplicationCommandOptionType.User, required: true }]
    },
    {
        name: 'reverso',
        description: 'Inverte o texto enviado.',
        options: [{ name: 'texto', description: 'Texto a ser invertido', type: ApplicationCommandOptionType.String, required: true }]
    },
    {
        name: 'ship',
        description: 'Calcula as chances de amor entre você e outra pessoa.',
        options: [{ name: 'membro', description: 'O alvo do cupido', type: ApplicationCommandOptionType.User, required: true }]
    },
    {
        name: 'chances',
        description: 'Calcula a porcentagem de chances de algo acontecer.',
        options: [{ name: 'pergunta', description: 'Chances de que?', type: ApplicationCommandOptionType.String, required: true }]
    },
    {
        name: 'gado',
        description: 'Mede o nível de gado de um usuário.',
        options: [{ name: 'usuario', description: 'Selecione o usuário (ou você mesmo)', type: ApplicationCommandOptionType.User, required: false }]
    },
    {
        name: 'qi',
        description: 'Calcula o QI mental de alguém.',
        options: [{ name: 'usuario', description: 'Selecione o usuário (ou você mesmo)', type: ApplicationCommandOptionType.User, required: false }]
    },
    {
        name: 'dolar',
        description: 'Dá aquela informação sincera sobre o dólar.'
    },
    {
        name: 'escolha',
        description: 'Faz o bot decidir entre duas ou mais opções.',
        options: [
            { name: 'opcao1', description: 'Primeira opção', type: ApplicationCommandOptionType.String, required: true },
            { name: 'opcao2', description: 'Segunda opção', type: ApplicationCommandOptionType.String, required: true }
        ]
    },
    {
        name: 'diga',
        description: 'Mensagem de boas-vindas do bot.'
    },
    {
        name: 'votar',
        description: 'Cria uma enquete de sim ou não.',
        options: [{ name: 'tema', description: 'Tema da votação', type: ApplicationCommandOptionType.String, required: true }]
    },
    {
        name: 'saldo',
        description: 'Mostra quantos dinheiros você tem.'
    },
    {
        name: 'daily',
        description: 'Resgata seus dinheiros diários.'
    },
    {
        name: 'trabalhar',
        description: 'Faça um bico e ganhe uns trocados.'
    },
    {
        name: 'apostar',
        description: 'Aposte seus dinheiros num Cara ou Coroa valendo o dobro.',
        options: [{ name: 'valor', description: 'Quantidade a apostar', type: ApplicationCommandOptionType.Integer, required: true }]
    },
    {
        name: 'doar',
        description: 'Diga adeus ao seu suado dinheiro doando para um amigo.',
        options: [
            { name: 'membro', description: 'Membro beneficiado', type: ApplicationCommandOptionType.User, required: true },
            { name: 'valor', description: 'Quantidade a doar', type: ApplicationCommandOptionType.Integer, required: true }
        ]
    },
    {
        name: 'jokenpo',
        description: 'Jogue Pedra, Papel ou Tesoura contra mim.',
        options: [{
            name: 'jogada',
            description: 'Escolha seu elemento',
            type: ApplicationCommandOptionType.String,
            required: true,
            choices: [
                { name: 'Pedra 🪨', value: 'pedra' },
                { name: 'Papel 📄', value: 'papel' },
                { name: 'Tesoura ✂️', value: 'tesoura' }
            ]
        }]
    },
    {
        name: 'adivinhe',
        description: 'Adivinhe um número de 1 a 10.',
        options: [{ name: 'numero', description: 'Seu palpite', type: ApplicationCommandOptionType.Integer, required: true }]
    },
    {
        name: 'fps',
        description: 'Calcula os frames por segundo do seu humor.'
    },
    {
        name: 'hackear',
        description: 'Faz um "cyberataque" simulado em um amigo.',
        options: [{ name: 'membro', description: 'Alvo do ataque', type: ApplicationCommandOptionType.User, required: true }]
    },
    {
        name: 'roleta',
        description: 'Roleta russa! Vai encarar a sorte?'
    },
    {
        name: 'soco',
        description: 'Mete um soco em alguém do servidor.',
        options: [{ name: 'membro', description: 'Membro a apanhar', type: ApplicationCommandOptionType.User, required: true }]
    },
    {
        name: 'morder',
        description: 'Dê uma mordida carinhosa (ou dolorida) em alguém.',
        options: [{ name: 'membro', description: 'Membro a morder', type: ApplicationCommandOptionType.User, required: true }]
    },
    {
        name: 'matar',
        description: 'Derrube seu adversário no chat.',
        options: [{ name: 'membro', description: 'Membro a derrubar', type: ApplicationCommandOptionType.User, required: true }]
    },
    {
        name: 'correr',
        description: 'Foge de fininho do canal!'
    },
    {
        name: 'ajuda',
        description: 'Exibe a lista de comandos do bot.'
    }
];

// ==================== EVENTO: GUILD MEMBER ADD ====================
client.on('guildMemberAdd', async (member) => {
    const serverConfig = configBoasVindas.get(member.guild.id);
    if (!serverConfig) return;

    if (serverConfig.cargoId) {
        const cargo = member.guild.roles.cache.get(serverConfig.cargoId);
        if (cargo) {
            await member.roles.add(cargo).catch(() => console.log(`Erro ao dar cargo para ${member.user.tag}`));
        }
    }

    if (serverConfig.canalId) {
        const canal = member.guild.channels.cache.get(serverConfig.canalId);
        if (canal) {
            let textoCustomizado = serverConfig.mensagem || "Seja bem-vindo(a) ao nosso servidor!";
            textoCustomizado = textoCustomizado
                .replace(/{membro}/g, `${member}`)
                .replace(/{servidor}/g, `${member.guild.name}`)
                .replace(/{total}/g, `${member.guild.memberCount}`);

            const embed = new EmbedBuilder()
                .setColor(0x00FF99)
                .setTitle(`✨ Nova chegada!`)
                .setDescription(textoCustomizado)
                .setThumbnail(member.user.displayAvatarURL({ forceStatic: false }))
                .setTimestamp();

            await canal.send({ embeds: [embed] }).catch(() => {});
        }
    }
});

// ==================== READY (REGISTRO GLOBAL AUTOMÁTICO) ====================
client.once('ready', async () => {
    console.log(`✅ BLUUDUD BOT ONLINE COM SLASH COMMANDS! 🔥`);
    client.user.setActivity('fazendo moderação com estilo', { type: 3 });

    try {
        console.log('Iniciando o registro dos Slash Commands...');
        await client.application.commands.set(commandsData);
        console.log('✅ Todos os Slash Commands foram registrados globalmente com sucesso!');
    } catch (error) {
        console.error('Erro ao registrar Slash Commands:', error);
    }
});

// ==================== EXECUÇÃO DOS INTERACTION / SLASH COMMANDS ====================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, guild, member, channel } = interaction;

    // Inicializa a memória de configuração para o servidor caso não exista
    if (!configBoasVindas.has(guild.id)) {
        configBoasVindas.set(guild.id, { canalId: null, cargoId: null, mensagem: null });
    }
    const dadosServidor = configBoasVindas.get(guild.id);

    // --- CONFIGURAÇÕES DE BOAS-VINDAS ---
    if (commandName === 'config-boasvindas') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ Apenas administradores podem configurar o sistema de boas-vindas.', ephemeral: true });
        }
        const canal = options.getChannel('canal');
        dadosServidor.canalId = canal.id;
        return interaction.reply({ content: `✅ Canal de boas-vindas definido com sucesso para: ${canal}!`, ephemeral: true });
    }

    if (commandName === 'config-mensagem') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ Apenas administradores podem usar este comando.', ephemeral: true });
        }
        const msgCustom = options.getString('mensagem');
        dadosServidor.mensagem = msgCustom;
        return interaction.reply({ content: '✅ Mensagem de boas-vindas atualizada com sucesso!', ephemeral: true });
    }

    if (commandName === 'config-cargo') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ Apenas administradores podem usar este comando.', ephemeral: true });
        }
        const cargo = options.getRole('cargo');
        dadosServidor.cargoId = cargo.id;
        return interaction.reply({ content: `✅ Cargo automático definido para: **${cargo.name}**`, ephemeral: true });
    }

    // --- UTILS & MODERAÇÃO ---
    if (commandName === 'ping') {
        return interaction.reply(`🏓 Pong! ${Date.now() - interaction.createdTimestamp}ms`);
    }

    if (commandName === 'limpar') {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return interaction.reply({ content: '❌ Você não tem permissão pra isso, parça.', ephemeral: true });
        }
        const qtd = options.getInteger('quantidade');
        if (qtd < 1 || qtd > 99) {
            return interaction.reply({ content: 'Use um número entre 1 e 99.', ephemeral: true });
        }
        
        await interaction.deferReply({ ephemeral: true });
        await channel.bulkDelete(qtd, true);
        await interaction.editReply(`🧹 Limpei ${qtd} mensagens, tá me devendo um monster!`);
    }

    if (commandName === 'expulsar') {
        if (!member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
            return interaction.reply({ content: '❌ Sem permissão de expulsar membros.', ephemeral: true });
        }
        const user = options.getUser('membro');
        const motivo = options.getString('motivo') || 'Sem motivo especificado';
        const guildMember = await guild.members.fetch(user.id).catch(() => null);
        
        if (!guildMember) return interaction.reply({ content: 'Membro não encontrado neste servidor.', ephemeral: true });
        
        await guildMember.kick(motivo);
        return interaction.reply(`🚪 **${user.tag}** foi expulso. Motivo: ${motivo}`);
    }

    if (commandName === 'banir') {
        if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            return interaction.reply({ content: '❌ Sem permissão de banir membros.', ephemeral: true });
        }
        const user = options.getUser('membro');
        const motivo = options.getString('motivo') || 'Quebrou as regras';
        const guildMember = await guild.members.fetch(user.id).catch(() => null);

        if (!guildMember) return interaction.reply({ content: 'Membro não encontrado neste servidor.', ephemeral: true });

        await guildMember.ban({ reason: motivo });
        return interaction.reply(`🔨 **${user.tag}** foi banido. Motivo: ${motivo}`);
    }

    if (commandName === 'meme') {
        const memes = [
            "https://klipy.com/gifs/shrek-rizz-shrek-meme",
            "Por que o programador faliu? Porque ele usava muito 'break'!",
            "Tudo na vida passa, menos a minha vontade de comer pizza.",
            "O código funciona, mas eu não sei o porquê. Não mexa.",
            "Eu tentando fingir que entendi o que a pessoa falou após ela repetir 3 vezes."
        ];
        const random = memes[Math.floor(Math.random() * memes.length)];
        return interaction.reply(random);
    }

    if (commandName === 'lock') {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
        }
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
        return interaction.reply('🔒 Canal trancado! Silêncio no tribunal.');
    }

    if (commandName === 'unlock') {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
        }
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
        return interaction.reply('🔓 Canal destrancado. Podem falar agora.');
    }

    if (commandName === 'modolento') {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
        }
        const tempo = options.getInteger('segundos');
        await channel.setRateLimitPerUser(tempo);
        return interaction.reply(`⏳ Modo lento definido para ${tempo} segundos.`);
    }

    if (commandName === 'warn') {
        const user = options.getUser('membro');
        const motivo = options.getString('motivo') || 'Comportamento estranho';
        return interaction.reply(`⚠️ **AVISO:** ${user} foi avisado por: *${motivo}*. Fica esperto!`);
    }

    if (commandName === 'setnick') {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
            return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
        }
        const user = options.getUser('membro');
        const novoNick = options.getString('apelido');
        const targetMember = await guild.members.fetch(user.id).catch(() => null);

        if (!targetMember) return interaction.reply({ content: 'Membro inválido.', ephemeral: true });
        await targetMember.setNickname(novoNick);
        return interaction.reply(`📝 Nome de ${user.username} alterado para ${novoNick}.`);
    }

    if (commandName === 'serverinfo') {
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`📊 Informações de ${guild.name}`)
            .addFields(
                { name: 'Membros', value: `${guild.memberCount}`, inline: true },
                { name: 'Criado em', value: `${guild.createdAt.toLocaleDateString('pt-BR')}`, inline: true }
            );
        return interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'avatar') {
        const usuario = options.getUser('usuario') || interaction.user;
        return interaction.reply(`🖼️ Avatar de ${usuario.username}: ${usuario.displayAvatarURL({ forceStatic: false, size: 1024 })}`);
    }

    if (commandName === 'userinfo') {
        const usuario = options.getUser('usuario') || interaction.user;
        return interaction.reply(`👤 **Nome:** ${usuario.tag}\n🆔 **ID:** ${usuario.id}\n📅 **Conta criada em:** ${usuario.createdAt.toLocaleDateString('pt-BR')}`);
    }

    if (commandName === 'uptime') {
        let totalSeconds = (client.uptime / 1000);
        let days = Math.floor(totalSeconds / 86400);
        totalSeconds %= 86400;
        let hours = Math.floor(totalSeconds / 3600);
        totalSeconds %= 3600;
        let minutes = Math.floor(totalSeconds / 60);
        let seconds = Math.floor(totalSeconds % 60);
        return interaction.reply(`⏰ Estou online faz: \`${days}d ${hours}h ${minutes}m ${seconds}s\``);
    }

    if (commandName === 'falar') {
        const fala = options.getString('mensagem');
        await interaction.reply({ content: 'Enviando...', ephemeral: true });
        return channel.send(fala);
    }

    if (commandName === 'sorteio') {
        const premio = options.getString('premio');
        const totalMembers = await guild.members.fetch();
        const ganhador = totalMembers.filter(m => !m.user.bot).random();
        if (!ganhador) return interaction.reply('Não há membros suficientes para sortear.');
        return interaction.reply(`🎉 **SORTEIO!** Prêmio: **${premio}**\n🏆 Ganhador(a): ${ganhador}! Parabéns!`);
    }

    if (commandName === 'convite') {
        return interaction.reply('🔗 Quer me adicionar no seu servidor? Use: https://discord.com/api/oauth2/authorize?client_id=' + client.user.id + '&permissions=8&scope=bot%20applications.commands');
    }

    if (commandName === 'calculadora') {
        const n1 = options.getNumber('n1');
        const op = options.getString('operacao');
        const n2 = options.getNumber('n2');
        let res = 0;
        if (op === '+') res = n1 + n2;
        else if (op === '-') res = n1 - n2;
        else if (op === '*') res = n1 * n2;
        else if (op === '/') res = n1 / n2;
        return interaction.reply(`🔢 Resultado: **${res}**`);
    }

    if (commandName === 'regras') {
        return interaction.reply('📜 **Regras do Servidor:**\n1. Não seja chato.\n2. Não floode.\n3. Respeite todo mundo.');
    }

    if (commandName === 'links') {
        return interaction.reply('🌐 **Nossos links:**\nSite: Em breve\nTwitter: Em breve');
    }

    // --- MINI GAMES & DIVERSÃO ---
    if (commandName === 'dado') {
        const faces = options.getInteger('lados') || 6;
        const result = Math.floor(Math.random() * faces) + 1;
        return interaction.reply(`🎲 Você rolou um dado de ${faces} lados e tirou: **${result}**`);
    }

    if (commandName === 'moeda') {
        const lados = ['Cara', 'Coroa'];
        const escolhido = lados[Math.floor(Math.random() * lados.length)];
        return interaction.reply(`🪙 Caiu... **${escolhido}**!`);
    }

    if (commandName === 'biscoito') {
        const frases = ["Você terá um dia incrível hoje!", "A recompensa pelo bom trabalho é mais trabalho.", "Amanhã você vai acordar mais rico (ou não)."];
        return interaction.reply(`🥠 **Biscoito da Sorte:** ${frases[Math.floor(Math.random() * frases.length)]}`);
    }

    if (commandName === '8ball') {
        const respostas = ['Sim!', 'Com certeza', 'Talvez', 'Não', 'Definitivamente não.'];
        const pergunta = options.getString('pergunta');
        return interaction.reply(`🔮 **Pergunta:** *${pergunta}*\n**Resposta:** ${respostas[Math.floor(Math.random() * respostas.length)]}`);
    }

    if (commandName === 'abracar') {
        const alvo = options.getUser('membro');
        return interaction.reply(`🤗 ${interaction.user} deu um abraço apertado em ${alvo}! https://tenor.com/bFfSZLNFIus.gif`);
    }

    if (commandName === 'beijar') {
        const alvo = options.getUser('membro');
        return interaction.reply(`💋 ${interaction.user} deu um beijo guloso em ${alvo}! https://tenor.com/bioe7.gif`);
    }

    if (commandName === 'tapa') {
        const alvo = options.getUser('membro');
        return interaction.reply(`💥 Aiiiiiii! ${interaction.user} deu um tapa guloso em ${alvo}! https://tenor.com/bHBn8.gif`);
    }

    if (commandName === 'cantada') {
        const cantadas = ["Você não é Wi-Fi, mas sinto uma forte conexão.", "Me chama de tabela periódica e diz que rola uma química entre nós.","voce nao é o pdiddy mas me deixou preto de amor!\nhttps://tenor.com/nwv9cJEGJ9i.gif"];
        return interaction.reply(`😏 ${cantadas[Math.floor(Math.random() * cantadas.length)]}`);
    }

    if (commandName === 'piada') {
        const piadas = ["Por que o jacaré tirou o jacarezinho da escola? Porque ele ré-ptil de ano.", "O que o tomate foi fazer no banco? Tirar o extrato."];
        return interaction.reply(`🤡 ${piadas[Math.floor(Math.random() * piadas.length)]}`);
    }

    if (commandName === 'atacar') {
        const alvo = options.getUser('membro');
        return interaction.reply(`⚔️ ${interaction.user} atacou gulosamente ${alvo} e causou **${Math.floor(Math.random() * 100)}** de danos gulosos!\nhttps://tenor.com/l7kIhyLW9F2.gif`);
    }

    if (commandName === 'elogiar') {
        const alvo = options.getUser('membro');
        return interaction.reply(`✨ ${alvo}, ${interaction.user} te disse: voce é muito gostosa! https://tenor.com/dhryROG66Uz.gif`);
    }

    if (commandName === 'reverso') {
        const texto = options.getString('texto');
        return interaction.reply(texto.split('').reverse().join(''));
    }

    if (commandName === 'ship') {
        const user2 = options.getUser('membro');
        return interaction.reply(`❤️ **SHIP:** ${interaction.user.username} + ${user2.username} = **${Math.floor(Math.random() * 101)}%**!\nhttps://tenor.com/bVGpT.gif`);
    }

    if (commandName === 'chances') {
        const pergunta = options.getString('pergunta');
        return interaction.reply(`📊 A chance de: "${pergunta}" acontecer é de **${Math.floor(Math.random() * 101)}%**.`);
    }

    if (commandName === 'gado') {
        const alvo = options.getUser('usuario') || interaction.user;
        return interaction.reply(`🐂 ${alvo.username} é **${Math.floor(Math.random() * 101)}%** gado.\nhttps://tenor.com/bNhJr.gif`);
    }

    if (commandName === 'qi') {
        const alvo = options.getUser('usuario') || interaction.user;
        return interaction.reply(`🧠 O QI de ${alvo.username} é de **${Math.floor(Math.random() * 200)}**. https://tenor.com/bPFuO.gif`);
    }

    if (commandName === 'dolar') {
        return interaction.reply('💵 O dólar hoje está alto. Vá trabalhar!');
    }

    if (commandName === 'escolha') {
        const op1 = options.getString('opcao1');
        const op2 = options.getString('opcao2');
        const lista = [op1, op2];
        return interaction.reply(`🤔 Eu escolho com certeza: **${lista[Math.floor(Math.random() * lista.length)]}**`);
    }

    if (commandName === 'diga') {
        return interaction.reply('Opa! Use os comandos de barra `/` para ver o que sei fazer.');
    }

    if (commandName === 'votar') {
        const enquete = options.getString('tema');
        const msg = await interaction.reply({ content: `📊 **VOTAÇÃO:** ${enquete}`, fetchReply: true });
        await msg.react('👍');
        await msg.react('👎');
    }

    // --- ECONOMIA ---
    if (commandName === 'saldo') {
        iniciarConta(interaction.user.id);
        return interaction.reply(`💰 Você tem **$${banco.get(interaction.user.id).carteira}** dinheiros na carteira.`);
    }

    if (commandName === 'daily') {
        iniciarConta(interaction.user.id);
        banco.get(interaction.user.id).carteira += 200;
        return interaction.reply('📆 Você resgatou seus **$200** dinheiros diários!');
    }

    if (commandName === 'trabalhar') {
        iniciarConta(interaction.user.id);
        const ganho = Math.floor(Math.random() * 80) + 20;
        banco.get(interaction.user.id).carteira += ganho;
        return interaction.reply(`💼 Você trabalhou e ganhou **$${ganho}**.`);
    }

    if (commandName === 'apostar') {
        iniciarConta(interaction.user.id);
        const conta = banco.get(interaction.user.id);
        const valor = options.getInteger('valor');
        if (valor <= 0 || valor > conta.carteira) return interaction.reply('Coloque um valor de aposta válido (dentro do seu saldo).');
        
        if (Math.random() > 0.5) {
            conta.carteira += valor;
            return interaction.reply(`🎉 Ganhou **$${valor}**!`);
        } else {
            conta.carteira -= valor;
            return interaction.reply(`😭 Perdeu **$${valor}**.`);
        }
    }

    if (commandName === 'doar') {
        iniciarConta(interaction.user.id);
        const alvo = options.getUser('membro');
        const valor = options.getInteger('valor');
        if (valor <= 0) return interaction.reply('O valor precisa ser maior que zero.');
        iniciarConta(alvo.id);
        
        if (banco.get(interaction.user.id).carteira < valor) return interaction.reply('Você não tem saldo suficiente para doar.');
        banco.get(interaction.user.id).carteira -= valor;
        banco.get(alvo.id).carteira += valor;
        return interaction.reply(`💸 Você doou **$${valor}** para ${alvo}.`);
    }

    // --- GAMES ---
    if (commandName === 'jokenpo') {
        const opcoes = ['pedra', 'papel', 'tesoura'];
        const escolhaBot = opcoes[Math.floor(Math.random() * 3)];
        const escolhaUser = options.getString('jogada');
        
        if (escolhaUser === escolhaBot) return interaction.reply(`Empate! Ambos escolheram **${escolhaBot}**.`);
        else if ((escolhaUser === 'pedra' && escolhaBot === 'tesoura') || (escolhaUser === 'papel' && escolhaBot === 'pedra') || (escolhaUser === 'tesoura' && escolhaBot === 'papel')) {
            return interaction.reply(`Você ganhou! Eu escolhi **${escolhaBot}**.`);
        } else {
            return interaction.reply(`Perdeu! Eu escolhi **${escolhaBot}**.`);
        }
    }

    if (commandName === 'adivinhe') {
        const segredo = Math.floor(Math.random() * 10) + 1;
        const palpite = options.getInteger('numero');
        if (palpite === segredo) return interaction.reply('🎯 Acertou em cheio!');
        return interaction.reply(`Errou! O número era **${segredo}**.`);
    }

    if (commandName === 'fps') {
        return interaction.reply(`🎮 Rodando a **${Math.floor(Math.random() * 60) + 180} FPS**.`);
    }

    if (commandName === 'hackear') {
        const alvo = options.getUser('membro');
        return interaction.reply(`💻 Injetando vírus em ${alvo.username}... Senha do e-mail decodificada: \`p diddy lindinho6767\``);
    }

    if (commandName === 'roleta') {
        if (Math.random() < 0.16) return interaction.reply('💥 MORREU!');
        return interaction.reply('🏳️ O tambor girou e a arma falhou. Sobreviveu!');
    }

    if (commandName === 'soco') {
        const alvo = options.getUser('membro');
        return interaction.reply(`🥊 ${interaction.user} meteu um soco em ${alvo}!\nhttps://tenor.com/jItzcdDTiss.gif`);
    }

    if (commandName === 'morder') {
        const alvo = options.getUser('membro');
        return interaction.reply(`😬 ${interaction.user} deu uma mordida em ${alvo}!\nhttps://tenor.com/bXuSq.gif`);
    }

    if (commandName === 'matar') {
        const alvo = options.getUser('membro');
        return interaction.reply(`💀 ${interaction.user} molestou ${alvo}!\nhttps://tenor.com/vuJlRyJ0Zpu.gif`);
    }

    if (commandName === 'correr') {
        return interaction.reply('🏃💨 Você saiu correndo!');
    }

    // --- AJUDA ---
    if (commandName === 'ajuda') {
        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('🔥 BLUUDUD BOT - Slash Commands adicionados!')
            .setDescription('o bot mais maneiro!')
            .addFields(
                { name: '⚙️ Configurações (Apenas Admins)', value: '`/config-boasvindas` \`/config-mensagem\` \`/config-cargo\`' },
                { name: '🛡️ Moderação Básica & Avançada', value: '`/limpar` `/expulsar` `/banir` `/lock` `/unlock` `/modolento` `/warn` `/setnick`' },
                { name: '📊 Utilidades', value: '`/ping` `/serverinfo` `/avatar` `/userinfo` `/uptime` `/falar` `/sorteio` `/convite` `/calculadora` `/regras` `/links`' },
                { name: '😂 Diversão & Interação', value: '`/meme` `/dado` `/moeda` `/biscoito` `/8ball` `/abracar` `/beijar` `/tapa` `/cantada` `/piada` `/atacar` `/elogiar` `/reverso` `/ship` `/chances` `/gado` `/qi` `/dolar` `/escolha` `/diga` `/votar`' },
                { name: '💰 Economia', value: '`/saldo` `/daily` `/trabalhar` `/apostar` `/doar`' },
                { name: '🎮 Mini Games & Ações', value: '`/jokenpo` `/adivinhe` `/fps` `/hackear` `/roleta` `/soco` `/morder` `/matar` `/correr`' }
            );
        return interaction.reply({ embeds: [embed] });
    }
});

client.login(process.env.TOKEN);

// ==================== SERVIDOR PARA RENDER ====================
const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send('Bluudud Bot está online com Slash Commands! 🔥');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🌐 Servidor de Keep-Alive rodando na porta ${PORT}`);
});