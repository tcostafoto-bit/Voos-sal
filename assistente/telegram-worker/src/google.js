// Acesso ao Google Calendar e ao Gmail com um refresh token de longa duração.

import { calendarioEditavel } from './config.js';

const URL_TOKEN = 'https://oauth2.googleapis.com/token';
const API_CAL = 'https://www.googleapis.com/calendar/v3';
const API_GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';

// Cache do access token dentro do isolate (vive poucos minutos, como ele).
let tokenEmCache = null;

export async function obterAccessToken(env) {
  const agora = Date.now();
  if (tokenEmCache && tokenEmCache.expira > agora + 60_000) return tokenEmCache.token;

  const resposta = await fetch(URL_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!resposta.ok) {
    throw new Error(`Google recusou renovar o token (${resposta.status}): ${await resposta.text()}`);
  }
  const dados = await resposta.json();
  tokenEmCache = {
    token: dados.access_token,
    expira: agora + (dados.expires_in - 60) * 1000,
  };
  return tokenEmCache.token;
}

async function chamar(env, url, opcoes = {}) {
  const token = await obterAccessToken(env);
  const resposta = await fetch(url, {
    ...opcoes,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(opcoes.headers ?? {}),
    },
  });
  if (resposta.status === 204) return null;
  const texto = await resposta.text();
  if (!resposta.ok) {
    throw new Error(`Google API ${resposta.status} em ${new URL(url).pathname}: ${texto.slice(0, 400)}`);
  }
  return texto ? JSON.parse(texto) : null;
}

// ─────────────────────────── Calendário ───────────────────────────

/** Lista de calendários, com cache de 6 horas no KV. */
export async function listarCalendarios(env, { forcar = false } = {}) {
  if (!forcar) {
    const cache = await env.ESTADO.get('calendarios', 'json');
    if (cache) return cache;
  }
  const dados = await chamar(env, `${API_CAL}/users/me/calendarList?maxResults=250&minAccessRole=reader`);
  const calendarios = (dados.items ?? []).map((c) => ({
    id: c.id,
    nome: c.summary,
    cor: c.backgroundColor,
    principal: Boolean(c.primary),
    editavel: calendarioEditavel(c),
  }));
  await env.ESTADO.put('calendarios', JSON.stringify(calendarios), { expirationTtl: 21_600 });
  return calendarios;
}

/** Resolve um nome escrito por humanos ("Laura", "casamentos") num id. */
export function resolverCalendario(calendarios, nome) {
  if (!nome) return calendarios.find((c) => c.principal) ?? calendarios[0];
  const alvo = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return (
    calendarios.find((c) => c.id === nome) ??
    calendarios.find((c) => c.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim() === alvo) ??
    calendarios.find((c) => c.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(alvo)) ??
    calendarios.find((c) => c.principal) ??
    calendarios[0]
  );
}

export async function listarEventos(env, calendarioId, { de, ate, texto, max = 100 } = {}) {
  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(max),
    timeZone: 'Europe/Lisbon',
  });
  if (de) params.set('timeMin', new Date(de).toISOString());
  if (ate) params.set('timeMax', new Date(ate).toISOString());
  if (texto) params.set('q', texto);

  const dados = await chamar(env, `${API_CAL}/calendars/${encodeURIComponent(calendarioId)}/events?${params}`);
  return (dados.items ?? []).filter((e) => e.status !== 'cancelled');
}

/** Todos os calendários de uma vez, em paralelo. Cada evento leva consigo o
 *  calendário de onde veio. */
export async function listarEventosTodos(env, opcoes = {}, { apenasEditaveis = false } = {}) {
  const calendarios = (await listarCalendarios(env)).filter((c) => !apenasEditaveis || c.editavel);
  const porCalendario = await Promise.all(
    calendarios.map(async (cal) => {
      try {
        const eventos = await listarEventos(env, cal.id, opcoes);
        return eventos.map((e) => ({ ...e, _calendario: cal }));
      } catch (erro) {
        console.error(`Falha ao ler o calendário ${cal.nome}: ${erro.message}`);
        return [];
      }
    }),
  );
  return porCalendario.flat().sort((a, b) => {
    const ia = a.start?.dateTime ?? a.start?.date ?? '';
    const ib = b.start?.dateTime ?? b.start?.date ?? '';
    return ia.localeCompare(ib);
  });
}

export async function criarEvento(env, calendarioId, corpo, { notificar = false } = {}) {
  const params = new URLSearchParams({ sendUpdates: notificar ? 'all' : 'none' });
  return chamar(env, `${API_CAL}/calendars/${encodeURIComponent(calendarioId)}/events?${params}`, {
    method: 'POST',
    body: JSON.stringify(corpo),
  });
}

export async function atualizarEvento(env, calendarioId, eventoId, alteracoes, { notificar = false } = {}) {
  const params = new URLSearchParams({ sendUpdates: notificar ? 'all' : 'none' });
  return chamar(
    env,
    `${API_CAL}/calendars/${encodeURIComponent(calendarioId)}/events/${encodeURIComponent(eventoId)}?${params}`,
    { method: 'PATCH', body: JSON.stringify(alteracoes) },
  );
}

export async function apagarEvento(env, calendarioId, eventoId) {
  return chamar(
    env,
    `${API_CAL}/calendars/${encodeURIComponent(calendarioId)}/events/${encodeURIComponent(eventoId)}?sendUpdates=none`,
    { method: 'DELETE' },
  );
}

export async function obterEvento(env, calendarioId, eventoId) {
  return chamar(
    env,
    `${API_CAL}/calendars/${encodeURIComponent(calendarioId)}/events/${encodeURIComponent(eventoId)}`,
  );
}

/** Escreve as marcas do assistente sem tocar no resto do evento. */
export async function marcarPropriedades(env, calendarioId, eventoId, propriedades) {
  return atualizarEvento(env, calendarioId, eventoId, {
    extendedProperties: { private: propriedades },
  });
}

// ───────────────────────────── Gmail ─────────────────────────────

export async function procurarThreads(env, consulta, max = 12) {
  const params = new URLSearchParams({ q: consulta, maxResults: String(max) });
  const dados = await chamar(env, `${API_GMAIL}/threads?${params}`);
  return dados.threads ?? [];
}

/** Cabeçalhos + excerto de uma thread, sem descarregar os corpos todos. */
export async function resumirThread(env, threadId) {
  const dados = await chamar(
    env,
    `${API_GMAIL}/threads/${threadId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID`,
  );
  const mensagens = dados.messages ?? [];
  const ultima = mensagens[mensagens.length - 1];
  const cabecalho = (nome) =>
    ultima?.payload?.headers?.find((h) => h.name.toLowerCase() === nome.toLowerCase())?.value ?? '';
  return {
    threadId,
    de: cabecalho('From'),
    para: cabecalho('To'),
    assunto: cabecalho('Subject'),
    data: cabecalho('Date'),
    messageId: cabecalho('Message-ID'),
    excerto: mensagens.map((m) => m.snippet).filter(Boolean).join(' … ').slice(0, 700),
    numMensagens: mensagens.length,
  };
}

function base64url(texto) {
  const bytes = new TextEncoder().encode(texto);
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Codifica um cabeçalho que possa ter acentos (RFC 2047). */
function cabecalhoMime(valor) {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(valor)) return valor;
  return `=?UTF-8?B?${base64url(valor).replace(/-/g, '+').replace(/_/g, '/')}?=`;
}

/**
 * Cria um rascunho no Gmail. Nunca envia — o envio fica sempre para ti.
 */
export async function criarRascunho(env, { para, assunto, corpo, threadId, responderA }) {
  const linhas = [
    `To: ${para}`,
    `Subject: ${cabecalhoMime(assunto)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
  ];
  if (responderA) {
    linhas.push(`In-Reply-To: ${responderA}`, `References: ${responderA}`);
  }
  linhas.push('', corpo);

  return chamar(env, `${API_GMAIL}/drafts`, {
    method: 'POST',
    body: JSON.stringify({
      message: { raw: base64url(linhas.join('\r\n')), ...(threadId ? { threadId } : {}) },
    }),
  });
}
