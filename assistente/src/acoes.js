// As ações que os botões disparam — as mesmas no Telegram e no painel.

import { PROP } from './config.js';
import * as google from './google.js';
import { lerSugestoes, removerSugestao } from './estado.js';
import { adiar } from './varrimento.js';
import { dataCurta, dataISO, somarDias, somarMinutosRelogio } from './tempo.js';

/**
 * Aplica uma ação e devolve { ok, mensagem } — a mensagem é o que o utilizador
 * vê, tanto na bolha do Telegram como no toast do painel.
 */
export async function aplicar(env, acao) {
  try {
    switch (acao.t) {
      case 'estado': {
        await google.marcarPropriedades(env, acao.cal, acao.ev, {
          [PROP.ESTADO]: acao.valor,
        });
        return {
          ok: true,
          mensagem: acao.valor === 'feito' ? '✅ Marcado como feito' : '❌ Marcado como não feito',
        };
      }

      case 'adiar': {
        const novo = await adiar(env, acao.cal, acao.ev, acao.dias ?? 7);
        return { ok: true, mensagem: `📅 Adiado para ${dataCurta(novo.slice(0, 10))}` };
      }

      case 'sugestao': {
        const sugestoes = await lerSugestoes(env);
        const sugestao = sugestoes.find((s) => s.id === acao.id);
        if (!sugestao) return { ok: false, mensagem: 'Essa sugestão já não existe.' };

        if (acao.escolha === 'ignorar') {
          await removerSugestao(env, acao.id);
          return { ok: true, mensagem: '🗑 Ignorado' };
        }

        const calendarios = await google.listarCalendarios(env);
        const cal = google.resolverCalendario(calendarios, sugestao.calendario);
        const dia = sugestao.data || somarDias(dataISO(), 1);
        const temHora = Boolean(sugestao.hora && /^\d{2}:\d{2}$/.test(sugestao.hora));

        const corpo = {
          summary: sugestao.titulo,
          description: `${sugestao.porque}\n\nOrigem: email de ${sugestao.de}\nAssunto: ${sugestao.assunto}`,
          start: temHora
            ? { dateTime: `${dia}T${sugestao.hora}:00`, timeZone: 'Europe/Lisbon' }
            : { date: dia },
          end: temHora
            ? { dateTime: somarMinutosRelogio(`${dia}T${sugestao.hora}`, 60), timeZone: 'Europe/Lisbon' }
            : { date: somarDias(dia, 1) },
          extendedProperties: {
            private: {
              [PROP.ORIGEM]: 'email',
              [PROP.ESTADO]: 'aberto',
              [PROP.CONFIRMAR]: sugestao.tipo === 'prazo' ? 'sim' : 'nao',
            },
          },
        };
        await google.criarEvento(env, cal.id, corpo);
        await removerSugestao(env, acao.id);
        return { ok: true, mensagem: `➕ Na agenda (${cal.nome}), ${dataCurta(dia)}` };
      }

      default:
        return { ok: false, mensagem: 'Ação desconhecida.' };
    }
  } catch (erro) {
    console.error(`Ação ${acao.t} falhou: ${erro.message}`);
    return { ok: false, mensagem: `Correu mal: ${erro.message.slice(0, 120)}` };
  }
}
