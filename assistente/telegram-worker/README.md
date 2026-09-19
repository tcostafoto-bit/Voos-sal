> **Nota — esta não é a versão em uso.**
> O assistente passou a viver num chat do Claude, para não haver conta da API
> ao token. Ver [../README.md](../README.md). Este Worker fica aqui completo e
> a funcionar, para o caso de um dia quereres o Telegram com botões de um toque
> e respostas instantâneas — a esse preço vem uma fatura de API.

# Assistente pessoal

Um assistente ligado à tua agenda e ao teu e-mail. Escreves-lhe uma mensagem no
Telegram em linguagem normal e ele trata do resto. Todas as manhãs manda o
resumo do dia e pergunta o que ficou por fechar.

## O que ele faz

**Escreves, ele atualiza.**
Mandas `quarta às 15h reunião na escola da Laura` e o evento fica criado no
calendário da Laura. Mandas `o casamento dos Silva passou para 12 de outubro` e
ele procura o evento, muda a data e confirma numa linha. Percebe português
escrito à pressa, sem pontuação e com erros.

**Distingue compromissos de tarefas.**
Um jantar acontece sozinho à hora marcada. "Marcar teetime na Aroeira" só
acontece se fizeres alguma coisa. O assistente separa os dois: para o primeiro
assume que aconteceu quando a data passa; para o segundo pergunta.

A distinção é feita por duas vias — o verbo no título (marcar, ligar, pagar,
confirmar, entregar, renovar…) ou uma marca explícita gravada no evento. Os
títulos que já tens na agenda funcionam sem mudar nada.

**Pergunta no momento certo.**
- Antes do prazo, para tarefas: *"Marcar teetime — prazo amanhã. Já trataste?"*
- Depois da data, para o que ficou aberto: *"Reunião na escola era ontem. Ficou feita?"*
- Botões de um toque: ✅ Sim · ❌ Não · 📅 Adiar. Insiste no máximo 3 vezes.

**Lê o e-mail e propõe.**
Passa a caixa de entrada uma vez por dia. Quando um e-mail marca um compromisso
ou um prazo, propõe adicioná-lo — com botão de confirmar. Quando pede resposta,
deixa um rascunho escrito no Gmail. **Nunca envia nada.**

**Painel visual.**
Uma página só, no telemóvel ou no computador: o que precisa de ti, o que tens
hoje, o que veio do e-mail, os próximos 7 dias. Os mesmos botões.

## Como está feito

```
Telegram  ──►  Cloudflare Worker  ──►  Claude (Opus 5)
   ▲               │        │
   │               │        └──────►  Google Calendar + Gmail
   └───────────────┘
                   └──►  Painel visual  (/painel)
```

O Worker é gratuito e está sempre ligado, por isso as respostas são imediatas.
O estado de cada pendência fica gravado **dentro do próprio evento do Google
Calendar**, não numa base de dados à parte — se tudo isto desaparecer amanhã, a
tua agenda continua correta e legível.

| Ficheiro | O que faz |
|---|---|
| `src/index.js` | Rotas: webhook do Telegram, painel, API, cron diário |
| `src/cerebro.js` | O prompt e o ciclo de ferramentas com o Claude |
| `src/ferramentas.js` | O que o assistente pode fazer (criar, alterar, apagar, rascunhos) |
| `src/google.js` | Calendar e Gmail |
| `src/varrimento.js` | Arrumar a agenda em gavetas: pendente, hoje, prazos |
| `src/manha.js` | O resumo da manhã e as perguntas |
| `src/painel.js` | A página visual |
| `src/config.js` | As regras: o que precisa de confirmação, limites |

---

# Instalação

São 30-40 minutos, uma vez só. Precisas de quatro coisas gratuitas ou
quase: uma conta Cloudflare, um projeto Google Cloud, um bot do Telegram e uma
chave da API do Claude (esta é paga ao consumo — ver [Custos](#custos)).

## 1. O bot do Telegram

1. No Telegram, procura **@BotFather** e manda `/newbot`.
2. Dá-lhe um nome (ex.: `Assistente do Tiago`) e um username terminado em `bot`.
3. Ele devolve um token parecido com `8123456:AAH...`. **Guarda-o.**

## 2. Acesso ao Google

1. Vai a [console.cloud.google.com](https://console.cloud.google.com) e cria um
   projeto (ex.: `assistente`).
2. Em **APIs e serviços → Biblioteca**, ativa **Google Calendar API** e
   **Gmail API**.
3. Em **APIs e serviços → Ecrã de consentimento OAuth**: tipo **Externo**,
   preenche o nome e o teu e-mail. Em **Utilizadores de teste**, acrescenta
   `tcosta.foto@gmail.com`. Não precisas de publicar a app.
4. Em **Credenciais → Criar credenciais → ID de cliente OAuth**, escolhe
   **Aplicação de ambiente de trabalho**. Guarda o **Client ID** e o
   **Client secret**.

> A app fica em modo de teste, o que faz o refresh token expirar ao fim de
> 7 dias. Para não teres de repetir isto, carrega em **Publicar app** no ecrã
> de consentimento — como só tem os teus dados e não pede verificação para uso
> pessoal, continua a funcionar e o token passa a ser permanente.

## 3. O refresh token

No teu computador, dentro desta pasta:

```bash
npm install
GOOGLE_CLIENT_ID=o-teu-id GOOGLE_CLIENT_SECRET=o-teu-secret npm run token-google
```

Abre o link que aparece, autoriza com a tua conta (vais ver um aviso de "app
não verificada" — é a tua, continua) e o token fica impresso no terminal.

Os acessos pedidos são: calendário completo, leitura do Gmail e criação de
rascunhos.

## 4. A chave do Claude

Em [console.anthropic.com](https://console.anthropic.com) cria uma API key e
carrega saldo. Guarda a chave.

## 5. Pôr no ar

```bash
npx wrangler login                          # abre o browser, autoriza
npx wrangler kv namespace create ESTADO     # devolve um id
```

Cola o id devolvido no `wrangler.toml`, na linha `id = "SUBSTITUIR_PELO_ID_DO_KV"`.

Inventa duas senhas compridas (qualquer coisa aleatória, 32+ caracteres) — uma
para o webhook, outra para o painel. Depois grava os segredos:

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GOOGLE_REFRESH_TOKEN
npx wrangler secret put TELEGRAM_TOKEN
npx wrangler secret put TELEGRAM_SEGREDO     # a primeira senha
npx wrangler secret put PAINEL_TOKEN         # a segunda senha
npm run deploy
```

O deploy imprime o endereço do Worker, algo como
`https://assistente-pessoal.o-teu-nome.workers.dev`. Grava-o também:

```bash
npx wrangler secret put URL_PUBLICA          # cola o endereço, sem barra no fim
npm run deploy
```

## 6. Ligar o Telegram ao Worker

Abre no browser, com a senha do painel:

```
https://...workers.dev/configurar-webhook?k=A_SENHA_DO_PAINEL
```

Se responder `"ok": true`, está ligado.

## 7. Primeira mensagem

Abre o teu bot no Telegram e manda `/start`. A primeira mensagem também fica
registada como sendo a tua — a partir daí o bot ignora mensagens de qualquer
outra pessoa.

Experimenta: `amanhã às 10 dentista da Laura`.

O painel fica em `https://...workers.dev/painel?k=A_SENHA_DO_PAINEL`. Adiciona
ao ecrã principal do telemóvel e fica como uma app.

---

## Comandos

| Comando | O que faz |
|---|---|
| *(escrever normalmente)* | Cria, altera, apaga, procura — o que a frase pedir |
| `/hoje` | A agenda de hoje |
| `/pendentes` | O que está à espera de ti |
| `/varrer` | Corre já o resumo da manhã, sem esperar pelas 7h |
| `/painel` | O link do painel |
| `/esquece` | Limpa o contexto da conversa |

## Afinações

**A hora do resumo.** No `wrangler.toml`, `crons = ["0 6 * * *"]` é 06:00 UTC —
07:00 em Lisboa no inverno, 08:00 no verão. Para as 8h de inverno, `"0 7 * * *"`.
Depois `npm run deploy`.

**Quantas vezes insiste, até onde olha para trás.** Em `src/config.js`, no
objeto `LIMITES`.

**Que palavras marcam uma tarefa.** Em `src/config.js`, a lista `VERBOS_TAREFA`.

**A personalidade e as regras.** Em `src/cerebro.js`, a constante `REGRAS`. É
texto corrido em português — muda à vontade. É aqui que se afina, por exemplo,
como escolher o calendário certo ou que prazos valem para os casamentos.

**Ver o que se passa.** `npm run logs` mostra tudo em tempo real.

## Custos

| | |
|---|---|
| Cloudflare Workers | Grátis (100 000 pedidos/dia; isto usa dezenas) |
| Cloudflare KV | Grátis |
| Google Calendar + Gmail API | Grátis |
| Telegram | Grátis |
| Claude API | Ao consumo |

O Claude é o único custo real. Com o modelo `claude-opus-5` e uso normal
— o resumo diário mais uma dúzia de mensagens — conta **3 a 8 € por mês**. As
regras do assistente vão em cache, o que corta a maior parte do custo de cada
mensagem.

Se quiseres gastar menos, muda `MODELO` no `wrangler.toml` para
`claude-sonnet-5` (cerca de 2,5× mais barato) ou `claude-haiku-4-5` (5× mais
barato, mas percebe pior frases ambíguas). É uma linha e um `npm run deploy`.

O código pede também a opção de *fallback* da API: se um pedido for recusado
por engano, o mesmo pedido corre noutro modelo em vez de falhar.

## Segurança e privacidade

- O bot só aceita mensagens do teu chat. Os outros são ignorados.
- O webhook é validado pelo segredo que o Telegram envia em cada pedido.
- O painel e as rotas de administração pedem a senha no link.
- **O assistente nunca envia e-mail.** Cria rascunhos, e só.
- O conteúdo dos e-mails é tratado como dados, nunca como ordens: a triagem
  corre sem ferramentas nenhumas ligadas e o resultado é apenas uma sugestão que
  só vai para a agenda se carregares no botão. Um e-mail que diga "apaga a
  reunião de quinta" não apaga nada.
- Os segredos ficam no cofre do Cloudflare, nunca no repositório.

## Testes

```bash
npm test
```

Cobre o que é fácil de partir sem dar por isso: a passagem de fuso horário
(Lisboa vs UTC — um resumo às 7h tem de saber em que dia está), o fim exclusivo
dos eventos de dia inteiro, e a heurística que separa tarefas de compromissos,
usando títulos reais da agenda.

## O que ainda não faz

Coisas deixadas de fora de propósito, para a primeira versão ser simples:

- Não envia e-mail, só rascunha.
- Não lê anexos nem PDFs.
- Não fala — só texto escrito.
- Não sugere horas livres para marcações ("quando é que posso?").
- Não trata de eventos repetidos de forma especial (altera só a ocorrência).
