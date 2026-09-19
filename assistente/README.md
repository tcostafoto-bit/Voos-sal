# Assistente pessoal

Liga a agenda e o e-mail a um chat do Claude. Escreves uma frase, ele atualiza o
Google Calendar. De manhã, mostra o dia e pergunta o que ficou por fechar.

Corre dentro da subscrição do Claude — **não há conta da API ao token**.

## As três peças

**1. O painel** — [claude.ai/artifact/BSWtnGFYsQ1fWg6L4PkWtb](https://claude.ai/artifact/BSWtnGFYsQ1fWg6L4PkWtb)

Lê o Google Calendar **ao vivo**, com a tua própria ligação, e mostra:

| Secção | O que traz |
|---|---|
| A precisar de ti | Tarefas que passaram sem fechar, e prazos nos próximos 3 dias |
| Hoje | Tudo o que ocupa o dia — incluindo eventos de vários dias a meio |
| Fechou sozinho | Compromissos passados, dados por feitos sem perguntar nada |
| Próximos 7 dias | O que aí vem |

Cada pendência tem dois botões: **✓ Concluído** e **Tirar da lista**. Carregas, e
ele escreve no Google Calendar na hora. Põe no ecrã principal do telemóvel e fica
como uma app.

No topo tem uma **caixa para falar com o assistente**: escreves (ou ditas, no
microfone) e ele age — cria, altera, adia, fecha, responde a perguntas sobre a
agenda. Não precisas de sair do painel nem de abrir um chat.

- *amanhã às 10 dentista* → evento criado no principal
- *marcar teetime na Aroeira até sexta* → tarefa de dia inteiro na sexta
- *o casamento dos Silva passou para 12 de outubro* → procura e muda a data
- *o que tenho na quinta?* → responde

Responde em 1 a 3 segundos. Quando não perceber bem, cada resposta traz um botão
**Pensa melhor** que repete a mesma frase com o modelo que raciocina mais.

### Que calendários

| | |
|---|---|
| **Principal** (`tcosta.foto@gmail.com`) | Onde o assistente escreve por omissão |
| **Teus** (Casamentos Centrimagem, Ferias centrimagem, Torneios Golfe, Família) | Geram pendências e aceitam escrita |
| **Colaboradoras** (Flavia, Laura, Catarina) | Só se veem. Nunca geram pendências nem aceitam escrita |
| **Feriados** | Fora do painel |

A recusa de escrever nos calendários das colaboradoras não está só nas
instruções — está na função que executa a escrita, que rejeita antes de chegar
ao Google. Uma instrução em texto é um pedido; isto é uma porta fechada.

**2. A rotina da manhã** — o texto está em [rotina-diaria.md](./rotina-diaria.md).

Dispara todos os dias, lê a agenda e o Gmail, e manda-te uma mensagem com o dia e
as perguntas numeradas. Chega como notificação no telemóvel.

**3. As regras** — [../.claude/skills/agenda/SKILL.md](../.claude/skills/agenda/SKILL.md)

Que calendário serve cada assunto, o que é tarefa e o que é compromisso, e a
convenção do `✓`. Carrega-se sozinha em sessões do Claude Code neste repositório.

## Como o estado é guardado

No **título do evento**, no Google Calendar:

- `✓ Marcar teetime` — feito
- `✗ Marcar teetime` — não feito, fora da lista
- sem prefixo — ainda aberto

Nada vive numa base de dados à parte. Abres o Google Calendar no telemóvel e vês
o mesmo que o painel vê. Se tudo isto desaparecer amanhã, a tua agenda continua
certa e legível.

## Compromissos e tarefas

Um **compromisso** acontece sozinho à hora marcada: um jantar, um voo, um
torneio. Quando a data passa, assume-se que aconteceu — não te pergunta nada.

Uma **tarefa** só se resolve se fizeres alguma coisa: ligar, marcar, pagar,
enviar, confirmar, entregar. Essa pergunta-se, antes do prazo e depois de ele
passar.

A diferença sai do verbo no título, por isso funciona com o que já escreves hoje:
`MArcar teetime aroeira 1` é tarefa, `Anos abutre` não é.

## E-mail

Lê e propõe. **Nunca envia.** As respostas ficam em rascunho no Gmail, para
reveres e enviares tu.

O conteúdo dos e-mails é tratado como informação, nunca como ordens: um e-mail
que diga "apaga a reunião de quinta" não apaga nada — no máximo vira uma
sugestão que tens de aceitar.

---

# O que falta fazer

## Criar a rotina da manhã

A rotina tem de ser criada a partir do **claude.ai**, e não daqui: as rotinas
criadas por mim nascem sem acesso aos conectores, e a sessão da manhã ficaria
sem conseguir ler a agenda (testado — a rotina criada nesta sessão ficou
desligada por essa razão).

1. Vai a **claude.ai → Rotinas → Nova rotina**.
2. Nome: `Assistente — varrimento da manhã`.
3. Horário: todos os dias, à hora que quiseres.
4. Conectores: liga o **Google Calendar** e o **Gmail**.
5. Instruções: cola o texto de [rotina-diaria.md](./rotina-diaria.md), da linha
   `És o assistente pessoal do Tiago` até ao fim.
6. Notificações: liga o *push*, para chegar ao telemóvel.

## Autorizar o painel

Da primeira vez que abrires o painel, o Claude pede autorização para ele usar o
teu Google Calendar. Aceita — sem isso a página não consegue ler nada.

## Usar no dia-a-dia

Para mudar a agenda, escreve num chat do Claude com o conector do Google
Calendar ligado:

- `amanhã às 10 dentista da Laura`
- `marcar teetime na Aroeira até sexta`
- `o casamento dos Silva passou para 12 de outubro`
- `o que tenho esta semana?`

---

## A alternativa: Telegram com botões

Em [telegram-worker/](./telegram-worker/) está uma versão completa e testada que
corre num Cloudflare Worker: entrada por Telegram, botões de um toque, respostas
instantâneas, varrimento automático às 7h.

Funciona melhor no dia-a-dia — mas usa a API do Claude, que se paga ao token
(cerca de 2 cêntimos por mensagem). Ficou guardada para o caso de um dia
valer a pena.

## O que nenhuma das versões faz

- Não envia e-mail, só rascunha.
- Não lê anexos nem PDFs.
- Não sugere horas livres ("quando é que posso?").
- Não trata eventos repetidos de forma especial — altera só a ocorrência.
