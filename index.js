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

// Bancos de dados
const banco = new Map();
const configBoasVindas = new Map();

const iniciarConta = (id) => {
    if (!banco.has(id)) banco.set(id, { carteira: 100 });
};

//==== commands data ====\\

const commandsData = [
    {
        name: 'config-boasvindas',
        description: 'Configura o canal de boas-vindas do servidor.',
        options: [{ name: 'canal', description: 'Selecione o canal de texto', type: ApplicationCommandOptionType.Channel, channelTypes: [ChannelType.GuildText], required: true }]
    },
    {
        name: 'config-mensagem',
        description: 'Define a mensagem customizada de boas-vindas.',
        options: [{ name: 'mensagem', description: 'Use {membro}, {servidor} e {total}', type: ApplicationCommandOptionType.String, required: true }]
    },
    {
        name: 'config-cargo',
        description: 'Define o cargo automático dado aos novos membros.',
        options: [{ name: 'cargo', description: 'Selecione o cargo', type: ApplicationCommandOptionType.Role, required: true }]
    },
    { name: 'ping', description: 'Mostra a latência do bot.' },
    {
        name: 'limpar',
        description: 'Apaga uma quantidade específica de mensagens.',
        options: [{ name: 'quantidade', description: '1 a 99', type: ApplicationCommandOptionType.Integer, required: true }]
    },
    {
        name: 'expulsar',
        description: 'Expulsa um membro.',
        options: [{ name: 'membro', type: ApplicationCommandOptionType.User, required: true }, { name: 'motivo', type: ApplicationCommandOptionType.String }]
    },
    {
        name: 'banir',
        description: 'Bane um membro.',
        options: [{ name: 'membro', type: ApplicationCommandOptionType.User, required: true }, { name: 'motivo', type: ApplicationCommandOptionType.String }]
    },
    { name: 'meme', description: 'Envia um meme aleatório.' },
    { name: 'lock', description: 'Tranca o canal.' },
    { name: 'unlock', description: 'Destranca o canal.' },
    {
        name: 'modolento',
        description: 'Define modo lento.',
        options: [{ name: 'segundos', type: ApplicationCommandOptionType.Integer, required: true }]
    },
    {
        name: 'warn',
        description: 'Avisa um membro.',
        options: [{ name: 'membro', type: ApplicationCommandOptionType.User, required: true }, { name: 'motivo', type: ApplicationCommandOptionType.String }]
    },
    {
        name: 'setnick',
        description: 'Altera apelido.',
        options: [{ name: 'membro', type: ApplicationCommandOptionType.User, required: true }, { name: 'apelido', type: ApplicationCommandOptionType.String, required: true }]
    },
    { name: 'serverinfo', description: 'Informações do servidor.' },
    { name: 'avatar', description: 'Mostra avatar.' },
    { name: 'userinfo', description: 'Informações do usuário.' },
    { name: 'uptime', description: 'Tempo online.' },
    {
        name: 'falar',
        description: 'Faz o bot falar.',
        options: [{ name: 'mensagem', type: ApplicationCommandOptionType.String, required: true }]
    },
    {
        name: 'sorteio',
        description: 'Realiza sorteio.',
        options: [{ name: 'premio', type: ApplicationCommandOptionType.String, required: true }]
    },
    { name: 'convite', description: 'Link de convite do bot.' },
    { name: 'calculadora', description: 'Calculadora.' },
    { name: 'regras', description: 'Regras do servidor.' },
    { name: 'links', description: 'Links úteis.' },
    { name: 'dado', description: 'Rola um dado.' },
    { name: 'moeda', description: 'Cara ou Coroa.' },
    { name: 'biscoito', description: 'Biscoito da sorte.' },
    { name: '8ball', description: 'Bola 8.' },
    { name: 'abracar', description: 'Abraça alguém.' },
    { name: 'beijar', description: 'Beija alguém.' },
    { name: 'tapa', description: 'Dá tapa.' },
    { name: 'cantada', description: 'Manda cantada.' },
    { name: 'piada', description: 'Conta piada.' },
    { name: 'atacar', description: 'Ataca alguém.' },
    { name: 'elogiar', description: 'Elogia alguém.' },
    { name: 'reverso', description: 'Inverte texto.' },
    { name: 'ship', description: 'Calcula ship.' },
    { name: 'chances', description: 'Calcula chances.' },
    { name: 'gado', description: 'Nível de gado.' },
    { name: 'qi', description: 'QI de alguém.' },
    { name: 'dolar', description: 'Informação sobre dólar.' },
    { name: 'escolha', description: 'Escolhe entre opções.' },
    { name: 'diga', description: 'Mensagem do bot.' },
    { name: 'votar', description: 'Cria votação.' },
    { name: 'saldo', description: 'Mostra saldo.' },
    { name: 'daily', description: 'Resgata daily.' },
    { name: 'trabalhar', description: 'Trabalhar.' },
    { name: 'apostar', description: 'Apostar.' },
    { name: 'doar', description: 'Doar dinheiro.' },
    { name: 'jokenpo', description: 'Pedra, Papel ou Tesoura.' },
    { name: 'adivinhe', description: 'Adivinhe o número.' },
    { name: 'fps', description: 'FPS do humor.' },
    { name: 'hackear', description: 'Hackear alguém.' },
    { name: 'roleta', description: 'Roleta russa.' },
    { name: 'soco', description: 'Dá soco.' },
    { name: 'morder', description: 'Morde alguém.' },
    { name: 'matar', description: 'Mata alguém (brincadeira).' },
    { name: 'correr', description: 'Corre.' },
    { name: 'ajuda', description: 'Lista de comandos.' }
];

//==== eventos e ready ====\\

// ==================== EVENTO: NOVO MEMBRO ====================
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
            let texto = serverConfig.mensagem || "Seja bem-vindo(a) ao servidor!";
            texto = texto
                .replace(/{membro}/g, `${member}`)
                .replace(/{servidor}/g, member.guild.name)
                .replace(/{total}/g, member.guild.memberCount);

            const embed = new EmbedBuilder()
                .setColor(0x2F3136)
                .setTitle("✨ Novo Membro")
                .setDescription(texto)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setTimestamp();

            await canal.send({ embeds: [embed] });
        }
    }
});

// ==================== READY ====================
client.once('ready', async () => {
    console.log(`✅ ARKILL BOT ESTÁ ONLINE`);
    client.user.setActivity('Protegendo o servidor', { type: 3 });

    try {
        await client.application.commands.set(commandsData);
        console.log('✅ Comandos registrados com sucesso!');
    } catch (error) {
        console.error('Erro ao registrar comandos:', error);
    }
});

//==== interaçoes ====\\


// ==================== INTERACTIONS ====================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, guild, member, channel } = interaction;

    if (!configBoasVindas.has(guild.id)) {
        configBoasVindas.set(guild.id, { canalId: null, cargoId: null, mensagem: null });
    }
    const dadosServidor = configBoasVindas.get(guild.id);

    const embed = new EmbedBuilder()
        .setColor(0x2F3136)
        .setTimestamp();

    try {
        // Configurações
        if (commandName === 'config-boasvindas') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                embed.setDescription('❌ Apenas administradores podem usar este comando.');
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
            dadosServidor.canalId = options.getChannel('canal').id;
            embed.setDescription('✅ Canal de boas-vindas configurado com sucesso.');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (commandName === 'config-mensagem') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                embed.setDescription('❌ Apenas administradores podem usar este comando.');
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
            dadosServidor.mensagem = options.getString('mensagem');
            embed.setDescription('✅ Mensagem de boas-vindas atualizada.');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (commandName === 'config-cargo') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                embed.setDescription('❌ Apenas administradores podem usar este comando.');
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
            dadosServidor.cargoId = options.getRole('cargo').id;
            embed.setDescription('✅ Cargo automático configurado.');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Comandos básicos
        if (commandName === 'ping') {
            embed.setDescription(`**Latência:** ${Date.now() - interaction.createdTimestamp}ms`);
            return interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'limpar') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                embed.setDescription('❌ Você não tem permissão para usar este comando.');
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
            const qtd = options.getInteger('quantidade');
            await channel.bulkDelete(qtd, true);
            embed.setDescription(`✅ **${qtd}** mensagens foram removidas.`);
            return interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'ajuda') {
            embed.setTitle('ARKILL - Central de Comandos')
                 .setDescription('Aqui estão todos os comandos disponíveis.');
            return interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'hi') {
            embed.setTitle('olá')
                 .setDescription('test !')
            return interaction.reply({embeds: [embed] });
        }
    } catch (error) {
        console.error(error);
        embed.setDescription('❌ Ocorreu um erro ao executar este comando.');
        if (!interaction.replied) interaction.reply({ embeds: [embed], ephemeral: true });
    }
});

client.login(process.env.TOKEN);

// ==================== KEEP ALIVE ====================
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('ARKILL Bot está online.'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Servidor rodando na porta ${PORT}`));