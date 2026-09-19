// Ponto de entrada do Worker: webhook do Telegram, painel, API e cron diário.

import { aplicar } from './acoes.js';
import { conversar } from './cerebro.js';
import {
  guardarChatDono, guardarConversa, lerAcao, lerChatDono, lerConversa,
  lerUltimoVarrimento, limparConversa, registarVarrimento,
} from './estado.js';
import { enviarResumo } from './manha.js';
import { paginaPainel } from './painel.js';
import * as telegram from './telegram.js';
import { recolher } from './varrimento.js';

/** Comparação que não revela o segredo pelo tempo que demora. */
function iguais(a = '', b = '') {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i += 1) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

function json(dados, estado = 200) {
  return new Response(JSON.stringify(dados), {
    status: estado,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function autorizado(pedido, env) {
  const chave = new URL(pedido.url).searchParams.get('k') ?? '';
  return Boolean(env.PAINEL_TOKEN) && iguais(chave, env.PAINEL_TOKEN);
}

// ─────────────────────────── Telegram ───────────────────────────

const AJUDA = `Escreve-me como falarias com alguém: <i>"quarta às 15h reunião na escola da Laura"</i>, <i>"marcar teetime na Aroeira até sexta"</i>, <i>"o casamento dos Silva passou para 12 de outubro"</i>.

Todas as manhãs mando o resumo do dia e pergunto o que ficou por fechar.

/hoje — o que tens hoje
/pendentes — o que está à espera de ti
/varrer — corre já o resumo da manhã
/painel — o painel visual
/esquece — limpa o contexto da conversa`;

async function tratarMensagem(env, mensagem) {
  const chatId = mensagem.chat.id;
  const texto = (mensagem.text ?? '').trim();
  if (!texto) {
    await telegram.enviar(env, chatId, 'Só percebo texto, por agora.');
    return;
  }

  await guardarChatDono(env, chatId);

  if (texto.startsWith('/')) {
    const comando = texto.split(/[\s@]/)[0].toLowerCase();
    switch (comando) {
      case '/start':
      case '/ajuda':
      case '/help':
        await telegram.enviar(env, chatId, AJUDA);
        return;
      case '/painel':
        await telegram.enviar(
          env, chatId,
          env.URL_PUBLICA
            ? `${env.URL_PUBLICA}/painel?k=${env.PAINEL_TOKEN}`
            : 'Falta definir a variável URL_PUBLICA.',
        );
        return;
      case '/esquece':
        await limparConversa(env, chatId);
        await telegram.enviar(env, chatId, 'Esqueci o que falámos. Continua.');
        return;
      case '/varrer':
        await telegram.aEscrever(env, chatId);
        await enviarResumo(env, chatId);
        return;
      default:
        break; // /hoje e /pendentes seguem para o modelo como linguagem normal
    }
  }

  await telegram.aEscrever(env, chatId);
  const historico = await lerConversa(env, chatId);
  const pergunta = texto === '/hoje'
    ? 'O que tenho hoje na agenda?'
    : texto === '/pendentes'
      ? 'O que está pendente ou por confirmar?'
      : texto;

  try {
    const { texto: resposta } = await conversar(env, historico, pergunta);
    await telegram.enviar(env, chatId, telegram.escaparHtml(resposta));
    await guardarConversa(env, chatId, [
      ...historico,
      { role: 'user', content: pergunta },
      { role: 'assistant', content: resposta },
    ]);
  } catch (erro) {
    console.error(`Falhou a tratar a mensagem: ${erro.stack ?? erro.message}`);
    await telegram.enviar(env, chatId, `Bateu com o nariz na porta: ${telegram.escaparHtml(erro.message.slice(0, 200))}`);
  }
}

async function tratarBotao(env, callback) {
  const token = (callback.data ?? '').replace(/^a:/, '');
  const acao = await lerAcao(env, token);
  if (!acao) {
    await telegram.responderBotao(env, callback.id, 'Esse botão já expirou.');
    return;
  }
  const { mensagem } = await aplicar(env, acao);
  await telegram.responderBotao(env, callback.id, mensagem);

  // Fecha a bolha: o texto fica, os botões desaparecem.
  const original = callback.message?.text ?? '';
  await telegram.editarMensagem(
    env,
    callback.message.chat.id,
    callback.message.message_id,
    `${telegram.escaparHtml(original)}\n\n<b>${telegram.escaparHtml(mensagem)}</b>`,
  );
}

// ──────────────────────────── Worker ────────────────────────────

export default {
  async fetch(pedido, env, contexto) {
    const url = new URL(pedido.url);

    // Webhook do Telegram. Responde já e trabalha em segundo plano — se
    // demorarmos, o Telegram reenvia a mesma mensagem.
    if (url.pathname === '/telegram' && pedido.method === 'POST') {
      const segredo = pedido.headers.get('x-telegram-bot-api-secret-token') ?? '';
      if (!iguais(segredo, env.TELEGRAM_SEGREDO ?? '')) {
        return new Response('não', { status: 401 });
      }
      const actualizacao = await pedido.json().catch(() => null);
      if (!actualizacao) return new Response('ok');

      const chatId = actualizacao.message?.chat?.id ?? actualizacao.callback_query?.message?.chat?.id;
      const dono = await lerChatDono(env);
      if (dono && String(chatId) !== String(dono)) {
        console.warn(`Mensagem de um chat desconhecido: ${chatId}`);
        return new Response('ok');
      }

      if (actualizacao.message) {
        contexto.waitUntil(tratarMensagem(env, actualizacao.message));
      } else if (actualizacao.callback_query) {
        contexto.waitUntil(tratarBotao(env, actualizacao.callback_query));
      }
      return new Response('ok');
    }

    if (url.pathname === '/painel') {
      if (!autorizado(pedido, env)) return new Response('Sem acesso.', { status: 401 });
      return new Response(paginaPainel(), {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      });
    }

    if (url.pathname === '/api/estado') {
      if (!autorizado(pedido, env)) return json({ erro: 'sem acesso' }, 401);
      const estado = await recolher(env);
      const ultimo = await lerUltimoVarrimento(env);
      return json({ ...estado, ultimoVarrimento: ultimo?.quando ?? null });
    }

    if (url.pathname === '/api/acao' && pedido.method === 'POST') {
      if (!autorizado(pedido, env)) return json({ erro: 'sem acesso' }, 401);
      const acao = await pedido.json().catch(() => null);
      if (!acao?.t) return json({ ok: false, mensagem: 'Pedido inválido.' }, 400);
      return json(await aplicar(env, acao));
    }

    // Conveniência: aponta o Telegram para este Worker sem sair do browser.
    if (url.pathname === '/configurar-webhook') {
      if (!autorizado(pedido, env)) return new Response('Sem acesso.', { status: 401 });
      const destino = `${env.URL_PUBLICA || url.origin}/telegram`;
      const resultado = await telegram.definirWebhook(env, destino, env.TELEGRAM_SEGREDO);
      return json({ destino, resultado });
    }

    // Conveniência: correr o varrimento à mão, para testar.
    if (url.pathname === '/varrer') {
      if (!autorizado(pedido, env)) return new Response('Sem acesso.', { status: 401 });
      const chatId = await lerChatDono(env);
      if (!chatId) return json({ erro: 'Ainda não sei para que chat enviar. Manda-me uma mensagem no Telegram primeiro.' }, 400);
      const resumo = await enviarResumo(env, chatId);
      await registarVarrimento(env, resumo);
      return json(resumo);
    }

    if (url.pathname === '/') {
      return new Response('Assistente pessoal. O painel está em /painel?k=…', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    return new Response('Não existe.', { status: 404 });
  },

  async scheduled(evento, env, contexto) {
    contexto.waitUntil((async () => {
      const chatId = await lerChatDono(env);
      if (!chatId) {
        console.warn('Varrimento sem destino: ninguém falou ainda com o bot.');
        return;
      }
      try {
        const resumo = await enviarResumo(env, chatId);
        await registarVarrimento(env, resumo);
      } catch (erro) {
        console.error(`Varrimento falhou: ${erro.stack ?? erro.message}`);
        await telegram.enviar(env, chatId, `O varrimento da manhã falhou: ${telegram.escaparHtml(erro.message.slice(0, 300))}`);
      }
    })());
  },
};
