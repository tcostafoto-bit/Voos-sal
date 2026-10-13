# Alerta de Preços — Lisboa → Mondsee (golfe), 8–11 jul 2027

Sistema automático (GitHub Actions + SerpAPI + Telegram) que verifica todos os
dias o preço do voo de Lisboa para **Munique (MUC)** e **Salzburgo (SZG)**,
compara os dois **já com o saco de golfe somado**, guarda o histórico e avisa no
Telegram quando há oportunidade.

## O que está a seguir

| | |
|---|---|
| Origem | LIS |
| Destinos | MUC e SZG, **só voos diretos** |
| Ida | 08/07/2027, só partidas **até às 10:00** |
| Volta | 11/07/2027, qualquer hora |
| Passageiros | 1 adulto |
| Hotel | não é seguido |
| Saco de golfe | 45 €/trajeto na TAP · 60 €/trajeto nas outras (×2 trajetos) |
| Alvo de compra | **380 €** (voo + saco) |
| Título das mensagens | ⛳ Mondsee 8–11 jul |

Tudo isto vive em [config.json](./config.json); a lógica está em
[scripts/check-prices.mjs](./scripts/check-prices.mjs).

## O saco de golfe muda quem ganha

O preço que conta é sempre **voo + saco**, nunca o voo sozinho. Um voo 10 € mais
barato numa companhia que cobra 60 €/trajeto pelo saco sai 20 € mais caro que o
da TAP. O código escolhe o itinerário mais barato depois de somar o saco, e o
alvo de 380 € é comparado com esse total.

Os 60 € das outras companhias são uma **estimativa, ainda não confirmada** — as
mensagens marcam esses valores com "(saco a confirmar)". Os 45 € da TAP estão
confirmados. Quando confirmares o valor real, muda
`viagem.sacoGolfe.porTrajetoOutras` no `config.json` e põe
`confirmadoOutras: true`.

Num itinerário com pernas de companhias diferentes o código assume a taxa **mais
alta** das duas. É melhor ser surpreendido para baixo do que para cima. Com os
dois destinos a só diretos isto hoje não acontece, mas a regra fica no código
para o dia em que voltarem a aceitar-se escalas.

## Quando é que recebes mensagem

- **Alvo atingido** — o mais barato dos dois fica em 380 € ou menos → "→ COMPRAR".
- **Descida relevante** — queda de 8% ou mais face à média dos últimos 7 dias.
- **Domingo** — resumo semanal, haja ou não gatilho.
- **Execução à mão** — manda sempre mensagem, mesmo sem nada a assinalar
  (é o que a variável `FORCAR_MENSAGEM=1` faz).
- **Duas falhas seguidas** sem resultados → aviso de que o alerta está cego.

Nos outros dias corre em silêncio e só acrescenta uma linha ao histórico.

## Correr à mão

No GitHub, Actions → "Verificação diária de preços" → **Run workflow**. Ou:

```bash
gh api -X POST /repos/<owner>/<repo>/actions/workflows/daily-check.yml/dispatches \
  -f ref=<branch>
```

Localmente, com as chaves no ambiente:

```bash
SERPAPI_KEY=… TELEGRAM_BOT_TOKEN=… TELEGRAM_CHAT_ID=… FORCAR_MENSAGEM=1 npm run check
```

Sem `TELEGRAM_BOT_TOKEN` a mensagem é impressa no terminal em vez de enviada —
dá para ver o formato sem gastar nada. As chaves são segredos do repositório
(`SERPAPI_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`), nunca vão para o
código.

## Testes

```bash
npm test
```

15 testes sobre as funções puras: aritmética do saco, o corte das 10:00, o
limite de escalas por destino, qual dos destinos ganha, os gatilhos de alerta e
o formato das mensagens. Correm também no GitHub Actions antes de cada
verificação — se o cálculo do preço se partir, o alerta não envia números
errados.

## Uma limitação honesta

O filtro de escalas e de hora de partida da SerpAPI aplica-se à pesquisa toda,
mas a resposta de ida-e-volta só detalha as pernas **da ida**. O código verifica
no detalhe a ida (direto e partida até às 10:00); na volta confia no filtro do
Google. Antes de comprar, confirmar que a volta também é direta na página da
companhia.

Salzburgo quase não tem ligações diretas a partir de Lisboa. Se nas mensagens
aparecer sempre "Salzburgo: sem voos que sirvam hoje", não é avaria do alerta —
é que não há. Nesse caso vale a pena tirar SZG do `config.json` e seguir só
Munique.

## Dashboard

A pasta [dashboard/](./dashboard/) tem o painel visual (Vite + React, deploy no
Vercel), que lê `data/history.json` do GitHub. Lê a branch indicada em
`VITE_GITHUB_BRANCH` — enquanto esta adaptação não estiver em `main`, o painel
publicado continua a mostrar os dados antigos.

## Arquivo

- [arquivo/sal/](./arquivo/sal/) — o alerta anterior, Lisboa → Sal com hotel
  (fev 2027), desligado a 13/10/2026. Guarda 74 verificações e a nota sobre o
  preço do hotel do Google vir ~40% acima do real, que vale a pena ler antes de
  voltar a seguir hotéis.

## Outros sistemas neste repositório

- [assistente/](./assistente/) — assistente pessoal ligado ao Google Calendar e
  ao Gmail: painel ao vivo com botões, rotina da manhã e regras de agenda.
