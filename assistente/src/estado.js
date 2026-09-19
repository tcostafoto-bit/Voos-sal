// Tudo o que é guardado no KV. Nada aqui é a fonte de verdade da agenda —
// o calendário é. Isto guarda conversa, sugestões e tokens de botões.

import { LIMITES } from './config.js';

const DIA = 86400;

/** Histórico de conversa (só texto — as chamadas a ferramentas são efémeras). */
export async function lerConversa(env, chatId) {
  const bruto = await env.ESTADO.get(`conversa:${chatId}`, 'json');
  return Array.isArray(bruto) ? bruto : [];
}

export async function guardarConversa(env, chatId, mensagens) {
  const recente = mensagens.slice(-LIMITES.MAX_HISTORICO);
  await env.ESTADO.put(`conversa:${chatId}`, JSON.stringify(recente), {
    expirationTtl: DIA,
  });
}

export async function limparConversa(env, chatId) {
  await env.ESTADO.delete(`conversa:${chatId}`);
}

/** Guarda os dados de um botão e devolve um token curto para o callback_data
 *  do Telegram, que tem um limite de 64 bytes. */
export async function guardarAcao(env, dados) {
  const token = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  await env.ESTADO.put(`acao:${token}`, JSON.stringify(dados), {
    expirationTtl: 30 * DIA,
  });
  return token;
}

export async function lerAcao(env, token) {
  return env.ESTADO.get(`acao:${token}`, 'json');
}

/** Sugestões vindas do email, à espera de um sim/não. */
export async function guardarSugestoes(env, sugestoes) {
  await env.ESTADO.put('sugestoes', JSON.stringify(sugestoes), {
    expirationTtl: 14 * DIA,
  });
}

export async function lerSugestoes(env) {
  const bruto = await env.ESTADO.get('sugestoes', 'json');
  return Array.isArray(bruto) ? bruto : [];
}

export async function removerSugestao(env, id) {
  const restantes = (await lerSugestoes(env)).filter((s) => s.id !== id);
  await guardarSugestoes(env, restantes);
  return restantes;
}

/** Threads de email já analisadas — evita repetir sugestões todos os dias. */
export async function emailJaVisto(env, threadId) {
  return (await env.ESTADO.get(`email:${threadId}`)) !== null;
}

export async function marcarEmailVisto(env, threadId) {
  await env.ESTADO.put(`email:${threadId}`, '1', { expirationTtl: 30 * DIA });
}

/** Quem é o dono — o chat do Telegram que recebe o varrimento diário.
 *  É gravado na primeira mensagem, para não ser preciso configurar à mão. */
export async function lerChatDono(env) {
  return env.CHAT_ID || (await env.ESTADO.get('chat_dono'));
}

export async function guardarChatDono(env, chatId) {
  if (!env.CHAT_ID) await env.ESTADO.put('chat_dono', String(chatId));
}

/** Registo do último varrimento, para o painel mostrar quando correu. */
export async function registarVarrimento(env, resumo) {
  await env.ESTADO.put('ultimo_varrimento', JSON.stringify({
    quando: new Date().toISOString(),
    ...resumo,
  }), { expirationTtl: 30 * DIA });
}

export async function lerUltimoVarrimento(env) {
  return env.ESTADO.get('ultimo_varrimento', 'json');
}
