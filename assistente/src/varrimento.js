// O varrimento: olhar para a agenda e para o email e decidir o que perguntar.

import {
  LIMITES, PROP, ehDiaInteiro, estadoDoEvento, fimDoEvento, inicioDoEvento, precisaConfirmacao,
} from './config.js';
import { triarEmail } from './cerebro.js';
import * as google from './google.js';
import {
  dataCurta, dataISO, diaPorExtenso, diferencaDias, horaCurta,
  paraRelogioLisboa, somarDias, somarDiasRelogio,
} from './tempo.js';
import {
  emailJaVisto, guardarSugestoes, lerSugestoes, marcarEmailVisto,
} from './estado.js';

/** Forma reduzida de um evento, partilhada pelo Telegram e pelo painel. */
function cartao(evento, extra = {}) {
  const inicio = inicioDoEvento(evento);
  const diaInteiro = ehDiaInteiro(evento);
  const dia = (evento.start?.dateTime ?? evento.start?.date ?? '').slice(0, 10);
  return {
    id: evento.id,
    calendario: evento._calendario?.nome ?? '',
    calendarioId: evento._calendario?.id ?? '',
    cor: evento._calendario?.cor ?? '#888888',
    titulo: evento.summary ?? '(sem título)',
    dia,
    diaCurto: dia ? dataCurta(dia) : '',
    hora: diaInteiro ? '' : horaCurta(inicio?.toISOString()),
    diaInteiro,
    local: evento.location ?? '',
    estado: estadoDoEvento(evento),
    insistencias: Number(evento.extendedProperties?.private?.[PROP.INSISTENCIAS] ?? 0),
    perguntado: evento.extendedProperties?.private?.[PROP.PERGUNTADO] ?? '',
    ...extra,
  };
}

/**
 * Lê a agenda e arruma tudo em gavetas. Não escreve nada — serve tanto o
 * varrimento da manhã como o painel, que pode ser aberto a qualquer hora.
 */
export async function recolher(env) {
  const hoje = dataISO();
  const agora = new Date();

  const eventos = await google.listarEventosTodos(
    env,
    {
      de: `${somarDias(hoje, -LIMITES.DIAS_PARA_TRAS)}T00:00:00`,
      ate: `${somarDias(hoje, LIMITES.DIAS_PARA_A_FRENTE)}T23:59:59`,
      max: 250,
    },
    { apenasEditaveis: false },
  );

  const doDia = [];
  const porFechar = [];
  const prazos = [];
  const proximos = [];

  for (const evento of eventos) {
    const dia = (evento.start?.dateTime ?? evento.start?.date ?? '').slice(0, 10);
    if (!dia) continue;
    const fim = fimDoEvento(evento);
    const estado = estadoDoEvento(evento);
    const editavel = evento._calendario?.editavel !== false;

    if (dia === hoje) doDia.push(cartao(evento));

    const jaPassou = fim ? fim.getTime() < agora.getTime() : diferencaDias(hoje, dia) < 0;

    if (jaPassou && estado === 'aberto' && editavel && precisaConfirmacao(evento)) {
      porFechar.push(cartao(evento, { diasAtras: diferencaDias(dia, hoje) }));
    } else if (!jaPassou && editavel && precisaConfirmacao(evento) && estado === 'aberto') {
      const faltam = diferencaDias(hoje, dia);
      if (faltam >= 0 && faltam <= LIMITES.ANTECEDENCIA_LEMBRETE) {
        prazos.push(cartao(evento, { faltam }));
      }
    }

    if (!jaPassou && diferencaDias(hoje, dia) > 0 && diferencaDias(hoje, dia) <= 7) {
      proximos.push(cartao(evento));
    }
  }

  porFechar.sort((a, b) => b.diasAtras - a.diasAtras);

  return {
    hoje,
    diaPorExtenso: diaPorExtenso(hoje),
    doDia,
    porFechar,
    prazos,
    proximos,
    sugestoes: await lerSugestoes(env),
  };
}

/**
 * Passa pela caixa de entrada e guarda as sugestões novas.
 * Cada thread só é analisada uma vez.
 */
export async function analisarEmail(env) {
  let threads;
  try {
    threads = await google.procurarThreads(
      env,
      'in:inbox newer_than:2d -from:me -category:promotions -category:social',
      LIMITES.MAX_THREADS_EMAIL,
    );
  } catch (erro) {
    console.error(`Não consegui ler o Gmail: ${erro.message}`);
    return [];
  }

  const novas = [];
  for (const t of threads) {
    if (!(await emailJaVisto(env, t.id))) novas.push(t);
  }
  if (novas.length === 0) return [];

  const conversas = await Promise.all(novas.map((t) => google.resumirThread(env, t.id)));
  const sugestoes = await triarEmail(env, conversas);

  await Promise.all(novas.map((t) => marcarEmailVisto(env, t.id)));

  const comId = sugestoes.map((s) => ({
    ...s,
    id: crypto.randomUUID().slice(0, 8),
    criadaEm: dataISO(),
    de: conversas.find((c) => c.threadId === s.thread_id)?.de ?? '',
    assunto: conversas.find((c) => c.threadId === s.thread_id)?.assunto ?? '',
  }));

  if (comId.length > 0) {
    const anteriores = await lerSugestoes(env);
    await guardarSugestoes(env, [...anteriores, ...comId].slice(-30));
  }
  return comId;
}

/** Regista que uma pergunta foi feita, para não insistir para sempre. */
export async function registarPergunta(env, cartaoEvento) {
  try {
    await google.marcarPropriedades(env, cartaoEvento.calendarioId, cartaoEvento.id, {
      [PROP.PERGUNTADO]: dataISO(),
      [PROP.INSISTENCIAS]: String(cartaoEvento.insistencias + 1),
    });
  } catch (erro) {
    console.error(`Não consegui marcar a pergunta no evento ${cartaoEvento.id}: ${erro.message}`);
  }
}

/** Já perguntámos hoje? Já insistimos vezes demais? */
export function devePerguntar(cartaoEvento, hoje) {
  if (cartaoEvento.perguntado === hoje) return false;
  return cartaoEvento.insistencias < LIMITES.MAX_INSISTENCIAS;
}

/** Adia um evento N dias, mantendo a hora. */
export async function adiar(env, calendarioId, eventoId, dias) {
  const evento = await google.obterEvento(env, calendarioId, eventoId);
  const alteracoes = {};
  if (evento.start?.date) {
    alteracoes.start = { date: somarDias(evento.start.date, dias) };
    alteracoes.end = { date: somarDias(evento.end?.date ?? somarDias(evento.start.date, 1), dias) };
  } else {
    // Pelo relógio, não pelo instante: adiar uma semana sobre a mudança de
    // hora tem de continuar a dar a mesma hora do dia.
    const desloca = (iso) => somarDiasRelogio(paraRelogioLisboa(iso), dias);
    alteracoes.start = { dateTime: desloca(evento.start.dateTime), timeZone: 'Europe/Lisbon' };
    alteracoes.end = { dateTime: desloca(evento.end.dateTime), timeZone: 'Europe/Lisbon' };
  }
  alteracoes.extendedProperties = {
    private: { [PROP.ESTADO]: 'aberto', [PROP.PERGUNTADO]: '', [PROP.INSISTENCIAS]: '0' },
  };
  await google.atualizarEvento(env, calendarioId, eventoId, alteracoes);
  return alteracoes.start.date ?? alteracoes.start.dateTime;
}
