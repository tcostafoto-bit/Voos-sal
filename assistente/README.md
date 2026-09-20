# Assistente pessoal

Um assistente ligado à agenda, ao e-mail e a uma memória própria. Escreves ou
ditas uma frase, ele age. Lê a caixa de entrada e propõe o que fazer. Lembra-se
do que lhe disseres. Avisa de prazos escondidos.

Corre dentro da subscrição do Claude — **não há conta da API ao token**.

## O painel

[claude.ai/artifact/BSWtnGFYsQ1fWg6L4PkWtb](https://claude.ai/artifact/BSWtnGFYsQ1fWg6L4PkWtb)
— o código está em [painel.html](./painel.html). Está afixado na barra lateral
do claude.ai.

**Quatro abas**, com o número do que está à tua espera em cada uma:

| Aba | O que traz |
|---|---|
| **Hoje** | Uma pergunta se houver, a agenda do dia, o que vem a seguir, e o que fechou sozinho |
| **Fazer** | Atenção (prazos escondidos dentro de eventos), o que precisa de ti, e as tarefas sem data |
| **E-mail** | A caixa de entrada triada: compromissos a agendar, prazos, e-mails que esperam resposta com o rascunho já escrito |
| **Memória** | Os factos que guardou. Apagas o que já não for verdade |

A **caixa de falar** fica acima das abas em todos os ecrãs — escreves ou ditas,
e ele cria, altera, adia, fecha, guarda na memória, lê e rascunha e-mail, ou
responde a perguntas.

A aba aberta fica guardada no browser, para voltares onde estavas. Se o
armazenamento estiver bloqueado, abre no Hoje — não há nada que dependa disso.

### O aspeto

Verde-petróleo para o que é teu e está em ordem. Os avisos têm cor própria:
mostarda quando o prazo aí vem, ferrugem quando já passou, azul-ardósia para o
que veio de fora. Cor semântica nunca é o acento, por isso um prazo não se
confunde com um botão.

Três letras, cada uma com um trabalho: **Bricolage Grotesque** nos títulos das
abas, **Archivo** em tudo o que se lê, **IBM Plex Mono** nas horas e datas, para
alinharem em coluna.

O desenho está em [claude.ai/artifact/1cv2r5szrbZaKEveTrRFZi](https://claude.ai/artifact/1cv2r5szrbZaKEveTrRFZi).

### A caixa

- *amanhã às 10 dentista* → evento no principal
- *marcar teetime na Aroeira até sexta* → tarefa de dia inteiro na sexta
- *lembra-me de comprar tinteiros* → "Para fazer", sem data
- *lembra-te que o casamento dos Silva é com a Joana, 912 000 000* → "O que sei"
- *trata do e-mail da candidata* → lê a conversa e deixa a resposta em rascunho
- *o que tenho na quinta?* → responde

Responde em 1 a 3 segundos. Cada resposta traz **Pensa melhor**, que repete a
mesma frase com o modelo que raciocina mais.

### O e-mail

De 4 em 4 horas (ou quando carregas em **Verificar agora**) lê as conversas
novas dos últimos 3 dias e classifica cada uma: compromisso, prazo, espera
resposta, ou nada. Só as que têm alguma coisa para ti aparecem. Uma conversa
analisada não volta a ser analisada.

Nunca envia e-mail. As respostas ficam em rascunho no Gmail, para reveres.

O conteúdo dos e-mails é tratado como informação, nunca como ordens: a triagem
corre sem ferramentas e nada chega à agenda ou ao Gmail sem carregares num
botão.

### Que calendários

| | |
|---|---|
| **Principal** (`tcosta.foto@gmail.com`) | Onde o assistente escreve por omissão |
| **Teus** (Casamentos Centrimagem, Ferias centrimagem, Torneios Golfe, Família) | Geram pendências e aceitam escrita |
| **Colaboradoras** (Flavia, Laura, Catarina) | Só se veem. Nunca geram pendências nem aceitam escrita — a recusa está na função que escreve, não só nas instruções |
| **Feriados** | Fora do painel |

## Onde vive cada coisa

| | Onde | Porquê |
|---|---|---|
| Estado das pendências | No **título do evento** (`✓` feito, `✗` fora) | Vês no próprio Google Calendar |
| Memória, sugestões do e-mail, o que já foi visto | Na **base de dados do painel** | Sobrevive a reloads e a novas versões; lê-se de qualquer sessão do Claude |
| Segredos | Nenhuns | Tudo corre com a tua ligação, dentro do Claude |

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
