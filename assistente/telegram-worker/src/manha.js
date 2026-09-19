// O resumo da manhã: o que se pergunta, por que ordem, e com que botões.

import { escaparHtml, enviar } from './telegram.js';
import { guardarAcao } from './estado.js';
import { analisarEmail, devePerguntar, recolher, registarPergunta } from './varrimento.js';

const ICONE = { compromisso: '📌', prazo: '⏳', responder: '✉️' };

function linhaEvento(c) {
  const quando = c.hora ? `${c.hora}` : 'dia inteiro';
  const onde = c.local ? ` · ${escaparHtml(c.local.split(',')[0])}` : '';
  const cal = c.calendario ? ` <i>${escaparHtml(c.calendario)}</i>` : '';
  return `• <b>${quando}</b> ${escaparHtml(c.titulo)}${onde}${cal}`;
}

/**
 * Corre o varrimento e manda as mensagens. Cada pergunta vai numa mensagem
 * própria com os seus botões — é assim que se responde com um toque e que a
 * bolha se fecha sozinha quando fica resolvida.
 */
export async function enviarResumo(env, chatId, { silencioso = false } = {}) {
  await analisarEmail(env);
  const estado = await recolher(env);
  const { hoje } = estado;

  // 1. A agenda de hoje.
  const cabecalho = `☀️ <b>${estado.diaPorExtenso}</b>`;
  const agenda = estado.doDia.length
    ? `${cabecalho}\n\n${estado.doDia.map(linhaEvento).join('\n')}`
    : `${cabecalho}\n\nNada marcado para hoje.`;
  await enviar(env, chatId, agenda, { silencioso });

  // 2. Prazos a chegar — antes de a data passar.
  const prazosVivos = estado.prazos.filter((c) => devePerguntar(c, hoje));
  for (const c of prazosVivos) {
    const quando = c.faltam === 0 ? 'hoje' : c.faltam === 1 ? 'amanhã' : `daqui a ${c.faltam} dias`;
    const token = await guardarAcao(env, { t: 'estado', cal: c.calendarioId, ev: c.id, valor: 'feito' });
    const adiarToken = await guardarAcao(env, { t: 'adiar', cal: c.calendarioId, ev: c.id, dias: 7 });
    await enviar(env, chatId, `⏳ <b>${escaparHtml(c.titulo)}</b>\nPrazo ${quando} (${c.diaCurto}).`, {
      silencioso,
      botoes: [[
        { text: '✅ Já tratei', callback_data: `a:${token}` },
        { text: '📅 +1 semana', callback_data: `a:${adiarToken}` },
      ]],
    });
    await registarPergunta(env, c);
  }

  // 3. O que já passou e ficou por fechar.
  const porPerguntar = estado.porFechar.filter((c) => devePerguntar(c, hoje)).slice(0, 8);
  for (const c of porPerguntar) {
    const ha = c.diasAtras === 0 ? 'hoje' : c.diasAtras === 1 ? 'ontem' : `há ${c.diasAtras} dias`;
    const feito = await guardarAcao(env, { t: 'estado', cal: c.calendarioId, ev: c.id, valor: 'feito' });
    const falhado = await guardarAcao(env, { t: 'estado', cal: c.calendarioId, ev: c.id, valor: 'falhado' });
    const adiado = await guardarAcao(env, { t: 'adiar', cal: c.calendarioId, ev: c.id, dias: 7 });
    await enviar(env, chatId, `❓ <b>${escaparHtml(c.titulo)}</b>\nEra ${ha} (${c.diaCurto}). Ficou feito?`, {
      silencioso,
      botoes: [[
        { text: '✅ Sim', callback_data: `a:${feito}` },
        { text: '❌ Não', callback_data: `a:${falhado}` },
        { text: '📅 Adiar', callback_data: `a:${adiado}` },
      ]],
    });
    await registarPergunta(env, c);
  }

  // 4. O que o email sugere.
  for (const s of estado.sugestoes.slice(0, 6)) {
    const quando = s.data ? ` · ${s.data}${s.hora ? ` ${s.hora}` : ''}` : '';
    if (s.tipo === 'responder') {
      await enviar(
        env, chatId,
        `✉️ <b>${escaparHtml(s.titulo)}</b>\n${escaparHtml(s.porque)}\n\n<i>Rascunho pronto no Gmail.</i>`,
        { silencioso },
      );
      continue;
    }
    const juntar = await guardarAcao(env, { t: 'sugestao', id: s.id, escolha: 'add' });
    const ignorar = await guardarAcao(env, { t: 'sugestao', id: s.id, escolha: 'ignorar' });
    await enviar(
      env, chatId,
      `${ICONE[s.tipo] ?? '📬'} <b>${escaparHtml(s.titulo)}</b>${quando}\n${escaparHtml(s.porque)}\n<i>de ${escaparHtml(s.de.slice(0, 60))}</i>`,
      {
        silencioso,
        botoes: [[
          { text: '➕ Adicionar', callback_data: `a:${juntar}` },
          { text: '🗑 Ignorar', callback_data: `a:${ignorar}` },
        ]],
      },
    );
  }

  // 5. O rodapé, só quando houve alguma coisa a mais.
  const perguntasFeitas = prazosVivos.length + porPerguntar.length;
  const porFecharRestantes = estado.porFechar.length - porPerguntar.length;
  if (porFecharRestantes > 0 && env.URL_PUBLICA) {
    await enviar(
      env, chatId,
      `Ficaram ${porFecharRestantes} por fechar de dias anteriores. Vê todas no painel: ${env.URL_PUBLICA}/painel?k=${env.PAINEL_TOKEN}`,
      { silencioso: true },
    );
  }

  return {
    eventosHoje: estado.doDia.length,
    perguntas: perguntasFeitas,
    sugestoes: estado.sugestoes.length,
  };
}
