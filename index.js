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

// Banco de dados temporário na memória para economia/jogos
const banco = new Map();

// ==================== READY ====================
client.once('ready', () => {
    console.log(`✅ BLUUDUD BOT ONLINE! 🔥`);
    client.user.setActivity('fazendo moderação com estilo', { type: 'WATCHING' });
});

// ==================== COMANDOS ====================
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // ==================== MODERAÇÃO ORIGINAL ====================

    if (command === 'ping') {
        message.reply(`🏓 Pong! ${Date.now() - message.createdTimestamp}ms`);
    }

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

    if (command === 'kick' || command === 'expulsar') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return message.reply('❌ Sem permissão.');
        const membro = message.mentions.members.first();
        if (!membro) return message.reply('Mencione alguém para expulsar.');
        
        const motivo = args.slice(1).join(' ') || 'Sem motivo especificado';
        await membro.kick(motivo);
        message.reply(`🚪 ${membro.user.tag} foi expulso. Motivo: ${motivo}`);
    }

    if (command === 'ban' || command === 'banir') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return message.reply('❌ Sem permissão.');
        const membro = message.mentions.members.first();
        if (!membro) return message.reply('Mencione alguém para banir.');
        
        const motivo = args.slice(1).join(' ') || 'Quebrou as regras';
        await membro.ban({ reason: motivo });
        message.reply(`🔨 ${membro.user.tag} foi banido. Motivo: ${motivo}`);
    }

    if (command === 'meme') {
        const memes = [
            "https://klipy.com/gifs/shrek-rizz-shrek-meme",
            "Por que o programador faliu? Porque ele usava muito 'break'!",
            "Tudo na vida passa, menos a minha vontade de comer pizza.",
            "O código funciona, mas eu não sei o porquê. Não mexa.",
            "Eu tentando fingir que entendi o que a pessoa falou após ela repetir 3 vezes."
        ];
        const random = memes[Math.floor(Math.random() * memes.length)];
        message.channel.send(random);
    }

    // ==================== +50 NOVOS COMANDOS ====================

    // --- MODERAÇÃO ADICIONAL (5 comandos) ---
    if (command === 'lock') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return message.reply('❌ Sem permissão.');
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        message.reply('🔒 Canal trancado! Silêncio no tribunal.');
    }

    if (command === 'unlock') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return message.reply('❌ Sem permissão.');
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
        message.reply('🔓 Canal destrancado. Podem falar agora.');
    }

    if (command === 'slowmode' || command === 'modolento') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return message.reply('❌ Sem permissão.');
        const tempo = parseInt(args[0]) || 0;
        await message.channel.setRateLimitPerUser(tempo);
        message.reply(`⏳ Modo lento definido para ${tempo} segundos.`);
    }

    if (command === 'warn') {
        const membro = message.mentions.members.first();
        if (!membro) return message.reply('Mencione quem vai levar o puxão de orelha.');
        const motivo = args.slice(1).join(' ') || 'Comportamento estranho';
        message.channel.send(`⚠️ **AVISO:** ${membro} foi avisado por: *${motivo}*. Fica esperto!`);
    }

    if (command === 'setnick') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageNicknames)) return message.reply('❌ Sem permissão.');
        const membro = message.mentions.members.first();
        const novoNick = args.slice(1).join(' ');
        if (!membro || !novoNick) return message.reply('Uso: !setnick @membro Novo Nome');
        await membro.setNickname(novoNick);
        message.reply(`📝 Nome de ${membro.user.username} alterado para ${novoNick}.`);
    }

    // --- UTILITÁRIOS (10 comandos) ---
    if (command === 'serverinfo') {
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`📊 Informações de ${message.guild.name}`)
            .addFields(
                { name: 'Membros', value: `${message.guild.memberCount}`, inline: true },
                { name: 'Criado em', value: `${message.guild.createdAt.toLocaleDateString('pt-BR')}`, inline: true }
            );
        message.reply({ embeds: [embed] });
    }

    if (command === 'avatar') {
        const usuario = message.mentions.users.first() || message.author;
        message.reply(`🖼️ Avatar de ${usuario.username}: ${usuario.displayAvatarURL({ dynamic: true, size: 1024 })}`);
    }

    if (command === 'userinfo') {
        const usuario = message.mentions.users.first() || message.author;
        message.reply(`👤 **Nome:** ${usuario.tag}\n🆔 **ID:** ${usuario.id}\n📅 **Conta criada em:** ${usuario.createdAt.toLocaleDateString('pt-BR')}`);
    }

    if (command === 'uptime') {
        let totalSeconds = (client.uptime / 1000);
        let days = Math.floor(totalSeconds / 86400);
        totalSeconds %= 86400;
        let hours = Math.floor(totalSeconds / 3600);
        totalSeconds %= 3600;
        let minutes = Math.floor(totalSeconds / 60);
        let seconds = Math.floor(totalSeconds % 60);
        message.reply(`⏰ Estou online faz: \`${days}d ${hours}h ${minutes}m ${seconds}s\``);
    }

    if (command === 'say' || command === 'falar') {
        const fala = args.join(' ');
        if (!fala) return message.reply('O que você quer que eu fale?');
        message.delete().catch(() => {});
        message.channel.send(fala);
    }

    if (command === 'sorteio') {
        const premio = args.join(' ');
        if (!premio) return message.reply('O que vai ser sorteado?');
        const m = await message.guild.members.fetch();
        const ganhador = m.filter(member => !member.user.bot).random();
        message.channel.send(`🎉 **SORTEIO!** Prêmio: **${premio}**\n🏆 Ganhador(a): ${ganhador}! Parabéns!`);
    }

    if (command === 'convite') {
        message.reply('🔗 Quer me adicionar no seu servidor? (Link gerado no portal de desenvolvedores)');
    }

    if (command === 'calculadora' || command === 'calc') {
        const n1 = parseFloat(args[0]);
        const op = args[1];
        const n2 = parseFloat(args[2]);
        if (isNaN(n1) || !op || isNaN(n2)) return message.reply('Formato: `!calc 5 + 5` (operações: +, -, *, /)');
        let res = 0;
        if (op === '+') res = n1 + n2;
        else if (op === '-') res = n1 - n2;
        else if (op === '*') res = n1 * n2;
        else if (op === '/') res = n1 / n2;
        message.reply(`🔢 Resultado: **${res}**`);
    }

    if (command === 'regras') {
        message.reply('📜 **Regras do Servidor:**\n1. Não seja chato.\n2. Não floode.\n3. Respeite todo mundo.');
    }

    if (command === 'links') {
        message.reply('🌐 **Nossos links:**\nSite: Em breve\nTwitter: Em breve');
    }

    // --- DIVERSÃO & INTERAÇÃO (20 comandos) ---
    if (command === 'dado') {
        const faces = parseInt(args[0]) || 6;
        const result = Math.floor(Math.random() * faces) + 1;
        message.reply(`🎲 Você rolou um dado de ${faces} lados e tirou: **${result}**`);
    }

    if (command === 'moeda') {
        const lados = ['Cara', 'Coroa'];
        const escolhido = lados[Math.floor(Math.random() * lados.length)];
        message.reply(`🪙 Caiu... **${escolhido}**!`);
    }

    if (command === 'biscoito') {
        const frases = [
            "Você terá um dia incrível hoje!",
            "A recompensa pelo bom trabalho é mais trabalho.",
            "Amanhã você vai acordar mais rico (ou não).",
            "Evite pessoas que não gostam de pão de queijo."
        ];
        const f = frases[Math.floor(Math.random() * frases.length)];
        message.reply(`🥠 **Biscoito da Sorte:** ${f}`);
    }

    if (command === '8ball') {
        const respostas = ['Sim!', 'Com certeza', 'Talvez', 'Não conte com isso', 'Não', 'Definitivamente não.'];
        if (!args.length) return message.reply('Faça uma pergunta.');
        message.reply(`🔮 ${respostas[Math.floor(Math.random() * respostas.length)]}`);
    }

    if (command === 'abracar' || command === 'hug') {
        const alvo = message.mentions.users.first();
        if (!alvo) return message.reply('Mencione alguém para abraçar.');
        message.channel.send(`🤗 ${message.author} deu um abraço apertado em ${alvo}!`);
    }

    if (command === 'beijar' || command === 'kiss') {
        const alvo = message.mentions.users.first();
        if (!alvo) return message.reply('Mencione alguém para beijar.');
        message.channel.send(`💋 ${message.author} deu um beijo em ${alvo}!`);
    }

    if (command === 'tapa' || command === 'slap') {
        const alvo = message.mentions.users.first();
        if (!alvo) return message.reply('Mencione quem merece um tapa.');
        message.channel.send(`💥 Ouuuch! ${message.author} deu um tapa estalado em ${alvo}!`);
    }

    if (command === 'cantada') {
        const cantadas = [
            "Você não é Wi-Fi, mas sinto uma forte conexão.",
            "Me chama de tabela periódica e diz que rola uma química entre nós.",
            "Seu nome é Google? Porque você tem tudo o que eu procuro."
        ];
        message.reply(`😏 ${cantadas[Math.floor(Math.random() * cantadas.length)]}`);
    }

    if (command === 'piada') {
        const piadas = [
            "Por que o jacaré tirou o jacarezinho da escola? Porque ele ré-ptil de ano.",
            "O que o tomate foi fazer no banco? Tirar o extrato."
        ];
        message.reply(`🤡 ${piadas[Math.floor(Math.random() * piadas.length)]}`);
    }

    if (command === 'atacar') {
        const alvo = message.mentions.users.first();
        if (!alvo) return message.reply('Quem você vai atacar?');
        const dano = Math.floor(Math.random() * 100);
        message.channel.send(`⚔️ ${message.author} atacou ${alvo} e causou **${dano}** de dano!`);
    }

    if (command === 'elogiar') {
        const alvo = message.mentions.users.first();
        if (!alvo) return message.reply('Mencione alguém para elogiar.');
        const elor = ["Você joga muito bem!", "Seu estilo é sensacional.", "Seu cérebro é gigante."];
        message.channel.send(`✨ ${alvo}, ${message.author} te disse: ${elor[Math.floor(Math.random() * elor.length)]}`);
    }

    if (command === 'reverso') {
        const texto = args.join(' ');
        if (!texto) return message.reply('Escreva algo.');
        message.reply(texto.split('').reverse().join(''));
    }

    if (command === 'ship') {
        const user1 = message.author;
        const user2 = message.mentions.users.first();
        if (!user2) return message.reply('Mencione o segundo alvo do cupido.');
        const porcetagem = Math.floor(Math.random() * 101);
        message.reply(`❤️ **SHIP:** ${user1.username} + ${user2.username} = **${porcetagem}%** de chance!`);
    }

    if (command === 'chances') {
        const pergunta = args.join(' ');
        if (!pergunta) return message.reply('Chances de que?');
        message.reply(`📊 A chance disso acontecer é de **${Math.floor(Math.random() * 101)}%**.`);
    }

    if (command === 'gado') {
        const alvo = message.mentions.users.first() || message.author;
        message.reply(`🐂 ${alvo.username} é **${Math.floor(Math.random() * 101)}%** gado.`);
    }

    if (command === 'inteligencia' || command === 'qi') {
        const alvo = message.mentions.users.first() || message.author;
        message.reply(`🧠 O QI de ${alvo.username} é de **${Math.floor(Math.random() * 200)}**.`);
    }

    if (command === 'dolar') {
        message.reply('💵 O dólar hoje está alto, como sempre. Vá trabalhar!');
    }

    if (command === 'escolha') {
        if (args.length < 2) return message.reply('Coloque duas opções separadas por espaço.');
        const item = args[Math.floor(Math.random() * args.length)];
        message.reply(`🤔 Eu escolho com certeza: **${item}**`);
    }

    if (command === 'diga') {
        message.reply('Opa! Estou aqui ouvindo. Digite `!ajuda` para ver o que sei fazer.');
    }

    if (command === 'votar') {
        const enquete = args.join(' ');
        if (!enquete) return message.reply('Digite o tema da votação.');
        const msg = await message.channel.send(`📊 **VOTAÇÃO:** ${enquete}`);
        await msg.react('👍');
        await msg.react('👎');
    }

    // --- MINI ECONOMIA EM MEMÓRIA (5 comandos) ---
    const iniciarConta = (id) => {
        if (!banco.has(id)) banco.set(id, { carteira: 100 });
    };

    if (command === 'saldo' || command === 'bal') {
        iniciarConta(message.author.id);
        const conta = banco.get(message.author.id);
        message.reply(`💰 Você tem **$${conta.carteira}** dinheiros na carteira.`);
    }

    if (command === 'daily') {
        iniciarConta(message.author.id);
        const conta = banco.get(message.author.id);
        conta.carteira += 200;
        message.reply('📆 Você resgatou seus **$200** dinheiros diários! Volte amanhã.');
    }

    if (command === 'trabalhar' || command === 'work') {
        iniciarConta(message.author.id);
        const conta = banco.get(message.author.id);
        const ganho = Math.floor(Math.random() * 80) + 20;
        conta.carteira += ganho;
        message.reply(`💼 Você trabalhou como moderador de Discord e ganhou **$${ganho}**.`);
    }

    if (command === 'apostar' || command === 'gamble') {
        iniciarConta(message.author.id);
        const conta = banco.get(message.author.id);
        const valor = parseInt(args[0]);
        if (isNaN(valor) || valor <= 0 || valor > conta.carteira) return message.reply('Coloque um valor válido dentro do seu saldo.');
        
        if (Math.random() > 0.5) {
            conta.carteira += valor;
            message.reply(`🎉 Boa! Você ganhou a aposta e levou **$${valor}**!`);
        } else {
            conta.carteira -= valor;
            message.reply(`😭 F total. Você perdeu **$${valor}**.`);
        }
    }

    if (command === 'doar') {
        iniciarConta(message.author.id);
        const alvo = message.mentions.users.first();
        const valor = parseInt(args[1]);
        if (!alvo || isNaN(valor) || valor <= 0) return message.reply('Uso: `!doar @membro 50`');
        iniciarConta(alvo.id);
        
        const minhaConta = banco.get(message.author.id);
        if (minhaConta.carteira < valor) return message.reply('Saldo insuficiente.');
        
        minhaConta.carteira -= valor;
        banco.get(alvo.id).carteira += valor;
        message.reply(`💸 Você doou **$${valor}** para ${alvo}. Que humilde!`);
    }

    // --- MINI GAMES (10 comandos) ---
    if (command === 'jokenpo') {
        const opcoes = ['pedra', 'papel', 'tesoura'];
        const escolhaBot = opcoes[Math.floor(Math.random() * 3)];
        const escolhaUser = args[0]?.toLowerCase();
        if (!opcoes.includes(escolhaUser)) return message.reply('Escolha entre `pedra`, `papel` ou `tesoura`.');
        
        if (escolhaUser === escolhaBot) message.reply(`Empate! Eu também escolhi ${escolhaBot}.`);
        else if (
            (escolhaUser === 'pedra' && escolhaBot === 'tesoura') ||
            (escolhaUser === 'papel' && escolhaBot === 'pedra') ||
            (escolhaUser === 'tesoura' && escolhaBot === 'papel')
        ) {
            message.reply(`Você ganhou! Escolhi ${escolhaBot}.`);
        } else {
            message.reply(`Perdeu kkkk! Eu escolhi ${escolhaBot}.`);
        }
    }

    if (command === 'adivinhe') {
        const segredo = Math.floor(Math.random() * 10) + 1;
        const palpite = parseInt(args[0]);
        if (isNaN(palpite)) return message.reply('Tente adivinhar um número de 1 a 10 usando: `!adivinhe 5`');
        if (palpite === segredo) message.reply('🎯 Acertou em cheio! Parabéns.');
        else message.reply(`Errou! O número era **${segredo}**.`);
    }

    if (command === 'ppt') {
        message.reply('Abreviação rápida de jokenpo! Use `!jokenpo pedra/papel/tesoura`.');
    }

    if (command === 'fps') {
        message.reply(`🎮 Meu ping de processamento gráfico virtual está em estáveis **${Math.floor(Math.random() * 60) + 180} FPS**.`);
    }

    if (command === 'hackear') {
        const alvo = message.mentions.users.first();
        if (!alvo) return message.reply('Quem vamos hackear hoje?');
        message.channel.send(`💻 Injetando vírus em ${alvo.username}...\n[████████████] 100%\nSenha do e-mail descoberta: \`batatinha123\``);
    }

    if (command === 'roleta') {
        if (Math.random() < 0.16) {
            message.reply('💥 MORREU! (Brincadeira, mas você perdeu o jogo).');
        } else {
            message.reply('🏳️ Clique... a arma falhou. Você sobreviveu!');
        }
    }

    if (command === 'soco') {
        const alvo = message.mentions.users.first();
        if (!alvo) return message.reply('Dê soco em quem?');
        message.channel.send(`🥊 ${message.author} meteu um soco no olho do ${alvo}!`);
    }

    if (command === 'morder') {
        const alvo = message.mentions.users.first();
        if (!alvo) return message.reply('Vai morder quem?');
        message.channel.send(`😬 ${message.author} deu uma mordida em ${alvo}!`);
    }

    if (command === 'matar') {
        const alvo = message.mentions.users.first();
        if (!alvo) return message.reply('Mate alguém ficticiamente.');
        message.channel.send(`💀 ${message.author} derrubou ${alvo} no chão. F total!`);
    }

    if (command === 'correr') {
        message.reply('🏃💨 Você saiu correndo do canal de texto antes que dessem ruim pra você!');
    }


    // ==================== AJUDA ATUALIZADO ====================
    if (command === 'ajuda' || command === 'comandos') {
        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('🔥 BLUUDUD BOT - COMANDOS (+50 NOVOS)')
            .setDescription('O bot mais completo e zoeiro do pedaço!')
            .addFields(
                { name: '🛡️ Moderação Básica & Avançada', value: '`!clear` `!kick` `!ban` `!lock` `!unlock` `!slowmode` `!warn` `!setnick`' },
                { name: '📊 Utilidades', value: '`!ping` `!serverinfo` `!avatar` `!userinfo` `!uptime` `!say` `!sorteio` `!convite` `!calc` `!regras` `!links`' },
                { name: '😂 Diversão & Interação', value: '`!meme` `!dado` `!moeda` `!biscoito` `!8ball` `!abracar` `!beijar` `!tapa` `!cantada` `!piada` `!atacar` `!elogiar` `!reverso` `!ship` `!chances` `!gado` `!qi` `!dolar` `!escolha` `!diga` `!votar`' },
                { name: '💰 Economia', value: '`!saldo` `!daily` `!trabalhar` `!apostar` `!doar`' },
                { name: '🎮 Mini Games & Ações', value: '`!jokenpo` `!adivinhe` `!ppt` `!fps` `!hackear` `!roleta` `!soco` `!morder` `!matar` `!correr`' }
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