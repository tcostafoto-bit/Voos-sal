#!/usr/bin/env node
// Verificação diária de preços de voo Lisboa → Munique / Salzburgo (viagem de
// golfe a Mondsee), via SerpAPI, com alertas no Telegram.
//
// O preço que conta é sempre voo + saco de golfe. Um voo barato numa companhia
// que cobra 60 €/trajeto pelo saco pode sair mais caro que um voo da TAP.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ESTE_FICHEIRO = fileURLToPath(import.meta.url);
const __dirname = path.dirname(ESTE_FICHEIRO);
const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const HISTORY_PATH = path.join(ROOT, 'data', 'history.json');
const ERROR_STATE_PATH = path.join(ROOT, 'data', 'error-state.json');

const SERPAPI_KEY = process.env.SERPAPI_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
// Numa execução à mão queremos a mensagem mesmo sem gatilho de compra.
const FORCAR_MENSAGEM = process.env.FORCAR_MENSAGEM === '1';

// ─── Funções puras (testadas em testes/precos.mjs) ──────────────────────────

export function isSunday(date) {
  return date.getUTCDay() === 0;
}

// A SerpAPI devolve "2027-07-08 07:15". Fica só "07:15".
export function horaDe(datetime) {
  if (!datetime) return '';
  return String(datetime).split(' ')[1]?.slice(0, 5) ?? '';
}

export function horaEmMinutos(hora) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hora || '').trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function eTap(companhia) {
  return /\btap\b/i.test(String(companhia || ''));
}

// O saco é por trajeto. 45 € na TAP, 60 € nas outras até o Tiago confirmar.
// Se um itinerário tiver pernas de companhias diferentes, vale a taxa mais
// alta — nunca prometer o preço bom sem o ter.
export function taxaSaco(companhias, saco) {
  const lista = (companhias || []).filter(Boolean);
  const tudoTap = lista.length > 0 && lista.every(eTap);
  const porTrajeto = tudoTap ? saco.porTrajetoTap : saco.porTrajetoOutras;
  return {
    total: porTrajeto * saco.trajetos,
    porTrajeto,
    tap: tudoTap,
    // Na TAP o valor está confirmado; nas outras é uma estimativa.
    confirmado: tudoTap ? true : Boolean(saco.confirmadoOutras),
  };
}

// Escolhe o itinerário mais barato *já com o saco*, entre os que cumprem as
// regras do destino (escalas e hora de partida da ida).
export function escolherMelhor(itinerarios, regras, saco) {
  const limite = horaEmMinutos(regras.partidaIdaAte);
  const validos = [];

  for (const it of itinerarios || []) {
    const pernas = Array.isArray(it?.flights) ? it.flights : [];
    if (pernas.length === 0 || typeof it.price !== 'number') continue;

    const escalas = pernas.length - 1;
    if (escalas > regras.maxEscalas) continue;

    const partida = horaDe(pernas[0].departure_airport?.time);
    const minutos = horaEmMinutos(partida);
    if (limite != null && (minutos == null || minutos > limite)) continue;

    const companhias = pernas.map((p) => p.airline);
    const s = taxaSaco(companhias, saco);
    validos.push({
      precoVoo: it.price,
      saco: s.total,
      sacoPorTrajeto: s.porTrajeto,
      sacoConfirmado: s.confirmado,
      total: it.price + s.total,
      companhia: companhias[0] ?? null,
      companhias,
      escalas,
      partidaIda: partida,
      detalhe: resumoItinerario(pernas),
    });
  }

  if (validos.length === 0) return null;
  return validos.reduce((min, c) => (c.total < min.total ? c : min), validos[0]);
}

export function resumoItinerario(pernas) {
  const primeira = pernas[0];
  const ultima = pernas[pernas.length - 1];
  const de = `${primeira.departure_airport?.id ?? '?'} ${horaDe(primeira.departure_airport?.time)}`;
  const para = `${ultima.arrival_airport?.id ?? '?'} ${horaDe(ultima.arrival_airport?.time)}`;
  const escalas = pernas.length - 1;
  const via = escalas > 0 ? ` via ${pernas.slice(0, -1).map((p) => p.arrival_airport?.id ?? '?').join(', ')}` : '';
  return `${de} → ${para}${via}`;
}

// Qual dos destinos sai mais barato, contando o saco.
export function destinoMaisBarato(destinos) {
  let melhor = null;
  for (const [codigo, d] of Object.entries(destinos || {})) {
    if (!d || typeof d.total !== 'number') continue;
    if (melhor == null || d.total < melhor.total) melhor = { codigo, total: d.total };
  }
  return melhor;
}

export function mediaUltimos(historico, n = 7) {
  const valores = historico
    .slice(-n)
    .map((r) => r.melhor?.total)
    .filter((v) => typeof v === 'number');
  if (valores.length === 0) return null;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

export function minimoHistorico(historico) {
  const valores = historico.map((r) => r.melhor?.total).filter((v) => typeof v === 'number');
  if (valores.length === 0) return null;
  return Math.min(...valores);
}

export function construirAlertas(config, registo, historico) {
  const alertas = [];
  const total = registo.melhor?.total;
  if (typeof total !== 'number') return alertas;

  if (total <= config.viagem.alvoTotal) alertas.push('COMPRAR');

  const media = mediaUltimos(historico);
  if (media != null) {
    const quedaPct = ((media - total) / media) * 100;
    if (quedaPct >= config.viagem.quedaAlertaPct) alertas.push('DESCIDA');
  }

  return alertas;
}

function euros(v) {
  return `${Number(v).toLocaleString('pt-PT')} €`;
}

function nomeDestino(config, codigo) {
  return config.viagem.destinos.find((d) => d.codigo === codigo)?.nome ?? codigo;
}

function linhaDestino(config, codigo, d, maisBarato) {
  const nome = nomeDestino(config, codigo);
  if (!d) return `${nome}: sem voos que sirvam hoje`;

  const escalas = d.escalas === 0 ? 'direto' : `${d.escalas} escala${d.escalas > 1 ? 's' : ''}`;
  const marca = maisBarato === codigo ? '  ← mais barato' : '';
  const porConfirmar = d.sacoConfirmado ? '' : ' (saco a confirmar)';
  return [
    `${nome} (${escalas}): ${euros(d.precoVoo)} + saco ${euros(d.saco)} = ${euros(d.total)}${marca}`,
    `  ${d.companhia ?? 'companhia n/d'} · ${d.detalhe}${porConfirmar}`,
  ].join('\n');
}

export function formatarMensagem(config, registo, historico, alertas) {
  const linhas = [config.viagem.titulo];
  const maisBarato = registo.melhor?.codigo ?? null;

  for (const destino of config.viagem.destinos) {
    linhas.push(linhaDestino(config, destino.codigo, registo.destinos[destino.codigo], maisBarato));
  }

  const minimo = minimoHistorico(historico);
  const media = mediaUltimos(historico);
  let tendencia = '';
  if (media != null && registo.melhor?.total != null) {
    const pct = Math.round(((media - registo.melhor.total) / media) * 100);
    if (pct > 0) tendencia = ` · ▼ ${pct}% vs média 7d`;
    else if (pct < 0) tendencia = ` · ▲ ${Math.abs(pct)}% vs média 7d`;
  }
  linhas.push(
    `Alvo ${euros(config.viagem.alvoTotal)} · mín. histórico ${minimo != null ? euros(minimo) : 'n/d'}${tendencia}`,
  );

  if (alertas.includes('COMPRAR')) linhas.push('→ COMPRAR');
  else if (alertas.includes('DESCIDA')) linhas.push('→ Descida relevante, vale a pena olhar');
  else linhas.push('→ Sem gatilho de compra.');

  return linhas.join('\n');
}

export function formatarResumoSemanal(config, registo, historico) {
  const linhas = [`📊 Resumo semanal · ${config.viagem.nome}`];
  const maisBarato = registo.melhor?.codigo ?? null;

  for (const destino of config.viagem.destinos) {
    const d = registo.destinos[destino.codigo];
    linhas.push(
      d
        ? `${destino.nome}: ${euros(d.total)}${maisBarato === destino.codigo ? ' ← mais barato' : ''}`
        : `${destino.nome}: sem voos que sirvam`,
    );
  }

  const minimo = minimoHistorico(historico);
  const media = mediaUltimos(historico);
  linhas.push(`Mín. histórico ${minimo != null ? euros(minimo) : 'n/d'} · média 7d ${media != null ? euros(Math.round(media)) : 'n/d'}`);
  linhas.push(`${historico.length} verificações até agora.`);

  return linhas.join('\n');
}

// ─── Lado de fora: rede e ficheiros ─────────────────────────────────────────

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf-8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJson(filePath, data) {
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

async function serpApiGet(params) {
  const url = new URL('https://serpapi.com/search.json');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('api_key', SERPAPI_KEY);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`SerpAPI HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchVoo(viagem, destino) {
  const { ida, volta } = viagem.datas;
  // O filtro da SerpAPI é por hora inteira ("0,10" = 00:00 às 10:59), por isso
  // pedimos a janela larga e cortamos a 10:00 exatas aqui no código.
  const limite = horaEmMinutos(viagem.partidaIdaAte);
  const horaMax = limite != null ? Math.min(23, Math.ceil(limite / 60)) : null;

  const params = {
    engine: 'google_flights',
    departure_id: viagem.origem,
    arrival_id: destino.codigo,
    outbound_date: ida,
    return_date: volta,
    adults: String(viagem.adultos),
    children: String(viagem.criancas ?? 0),
    currency: viagem.moeda,
    hl: 'pt',
    gl: 'pt',
    type: '1', // ida e volta
    // 1 = só diretos, 2 = até 1 escala, 3 = até 2 escalas.
    stops: String(destino.maxEscalas + 1),
  };
  if (horaMax != null) params.outbound_times = `0,${horaMax}`;

  const data = await serpApiGet(params);
  const candidatos = [...(data.best_flights || []), ...(data.other_flights || [])];
  return escolherMelhor(candidatos, {
    maxEscalas: destino.maxEscalas,
    partidaIdaAte: viagem.partidaIdaAte,
  }, viagem.sacoGolfe);
}

async function enviarTelegram(mensagem) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('Telegram não configurado, a saltar envio.');
    console.log('--- mensagem que teria sido enviada ---\n' + mensagem);
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: mensagem }),
  });
  if (!res.ok) console.error('Falha ao enviar Telegram:', await res.text());
}

async function verificar(viagem) {
  const destinos = {};
  const falhas = [];

  for (const destino of viagem.destinos) {
    try {
      destinos[destino.codigo] = await fetchVoo(viagem, destino);
    } catch (err) {
      console.error(`Erro ao consultar ${destino.codigo}:`, err.message);
      destinos[destino.codigo] = null;
      falhas.push(`${destino.codigo}: ${err.message}`);
    }
  }

  return {
    registo: {
      data: new Date().toISOString(),
      datas: { ...viagem.datas },
      destinos,
      melhor: destinoMaisBarato(destinos),
    },
    falhas,
  };
}

async function main() {
  const config = await readJson(CONFIG_PATH, null);
  if (!config?.viagem) throw new Error('config.json sem a secção "viagem".');
  const { viagem } = config;

  const historico = await readJson(HISTORY_PATH, []);
  const errorState = await readJson(ERROR_STATE_PATH, { falhasSeguidas: 0 });

  const { registo, falhas } = await verificar(viagem);
  const semNada = Object.values(registo.destinos).every((d) => d == null);

  if (semNada) {
    errorState.falhasSeguidas = (errorState.falhasSeguidas || 0) + 1;
    if (errorState.falhasSeguidas >= 2) {
      await enviarTelegram(
        `⚠️ ${viagem.titulo}\nSem resultados em ${errorState.falhasSeguidas} execuções seguidas.` +
          (falhas.length ? `\n${falhas.join('\n')}` : ''),
      );
    }
  } else {
    errorState.falhasSeguidas = 0;
  }
  await writeJson(ERROR_STATE_PATH, errorState);

  // Os alertas comparam-se com o histórico *antes* deste registo.
  const alertas = construirAlertas(config, registo, historico);
  const domingo = isSunday(new Date());

  if (alertas.length > 0 || FORCAR_MENSAGEM) {
    await enviarTelegram(formatarMensagem(config, registo, historico, alertas));
  }
  if (domingo) {
    await enviarTelegram(formatarResumoSemanal(config, registo, historico));
  }

  historico.push(registo);
  await writeJson(HISTORY_PATH, historico);

  console.log('Verificação concluída.', JSON.stringify(registo, null, 2));
  if (semNada) process.exitCode = 1;
}

// Só corre quando é chamado como programa; nos testes é só importado.
if (process.argv[1] && path.resolve(process.argv[1]) === ESTE_FICHEIRO) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
