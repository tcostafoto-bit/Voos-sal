#!/usr/bin/env node
// Verificação diária de preços voo+hotel Lisboa->Sal via SerpAPI, com alertas no Telegram.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const HISTORY_PATH = path.join(ROOT, 'data', 'history.json');
const HISTORY_ALT_PATH = path.join(ROOT, 'data', 'history-alternativas.json');
const ERROR_STATE_PATH = path.join(ROOT, 'data', 'error-state.json');

const SERPAPI_KEY = process.env.SERPAPI_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function isSunday(date) {
  return date.getUTCDay() === 0;
}

async function readJson(filePath, fallback) {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
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
  if (!res.ok) {
    throw new Error(`SerpAPI HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function fetchVoo({ origem, destino, adultos, criancas, moeda }, ida, volta) {
  try {
    const data = await serpApiGet({
      engine: 'google_flights',
      departure_id: origem,
      arrival_id: destino,
      outbound_date: ida,
      return_date: volta,
      adults: String(adultos),
      children: String(criancas),
      currency: moeda,
      hl: 'pt',
      gl: 'pt',
      type: '1', // round trip
    });

    const candidatos = [...(data.best_flights || []), ...(data.other_flights || [])];
    const diretos = candidatos.filter((f) => Array.isArray(f.flights) && f.flights.length === 1);

    if (diretos.length === 0) return null;

    const melhor = diretos.reduce((min, f) => (f.price < min.price ? f : min), diretos[0]);
    const perna = melhor.flights[0];

    return {
      precoDireto: melhor.price,
      companhia: perna.airline,
      detalhe: `${perna.departure_airport?.id ?? origem} ${formatHora(perna.departure_airport?.time)} → ${perna.arrival_airport?.id ?? destino} ${formatHora(perna.arrival_airport?.time)}`,
    };
  } catch (err) {
    console.error('Erro ao consultar voo:', err.message);
    return null;
  }
}

function formatHora(datetime) {
  if (!datetime) return '';
  const parts = datetime.split(' ');
  return parts[1]?.slice(0, 5) ?? '';
}

async function fetchHotel({ nome, cidade, noites, adultos, criancas, idadesCriancas, propertyToken, moeda }, checkIn, checkOut) {
  try {
    const params = {
      engine: 'google_hotels',
      q: `${nome} ${cidade}`,
      check_in_date: checkIn,
      check_out_date: checkOut,
      adults: String(adultos),
      children: String(criancas),
      currency: moeda,
      hl: 'pt',
      gl: 'pt',
    };
    if (criancas > 0 && idadesCriancas?.length) {
      params.children_ages = idadesCriancas.join(',');
    }
    if (propertyToken) {
      params.property_token = propertyToken;
    }
    const data = await serpApiGet(params);

    // Com property_token, a resposta é a propriedade única (não uma lista).
    const prop = propertyToken ? data : (data.properties || []).find((p) => p.name?.toLowerCase().includes('melia')) ?? data.properties?.[0];
    if (!prop) return null;

    const pax = adultos + criancas;
    const fontes = (data.prices || prop.prices || []).filter((s) => s.total_rate?.extracted_lowest != null);

    let melhorFonte = null;
    if (fontes.length > 0) {
      // Preferir a fonte oficial do hotel com a ocupação correta; senão, a mais barata com ocupação correta; senão, a mais barata disponível.
      const comOcupacaoCerta = fontes.filter((s) => s.num_guests === pax);
      const candidatas = comOcupacaoCerta.length > 0 ? comOcupacaoCerta : fontes;
      melhorFonte =
        candidatas.find((s) => s.official) ??
        candidatas.reduce((min, s) => (s.total_rate.extracted_lowest < min.total_rate.extracted_lowest ? s : min), candidatas[0]);
    }

    const total = melhorFonte?.total_rate?.extracted_lowest ?? prop.total_rate?.extracted_lowest ?? null;
    const rate = melhorFonte?.rate_per_night?.extracted_lowest ?? prop.rate_per_night?.extracted_lowest ?? null;

    let precoTotal;
    let base;
    if (total != null) {
      precoTotal = total;
      base = 'total';
    } else if (rate != null) {
      precoTotal = rate * noites;
      base = 'por_noite_multiplicado';
    } else {
      return null;
    }

    const regime = (prop.amenities || []).find((a) => /all.inclusive|tudo inclu/i.test(a)) ? 'Tudo incluído' : null;

    return { precoTotal, regime, baseCalculo: base, fonte: melhorFonte?.source ?? null };
  } catch (err) {
    console.error('Erro ao consultar hotel:', err.message);
    return null;
  }
}

async function enviarTelegram(mensagem) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('Telegram não configurado, a saltar envio.');
    return;
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: mensagem }),
  });
  if (!res.ok) {
    console.error('Falha ao enviar Telegram:', await res.text());
  }
}

function mediaUltimos(historico, campo, subcampo, n = 7) {
  const valores = historico
    .slice(-n)
    .map((r) => r[campo]?.[subcampo])
    .filter((v) => typeof v === 'number');
  if (valores.length === 0) return null;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

function minimoHistorico(historico, campo, subcampo) {
  const valores = historico.map((r) => r[campo]?.[subcampo]).filter((v) => typeof v === 'number');
  if (valores.length === 0) return null;
  return Math.min(...valores);
}

async function verificarDatas(config, ida, volta) {
  const voo = await fetchVoo(config.voo, ida, volta);
  const hotel = await fetchHotel(config.hotel, ida, volta);

  const totalPacote = voo?.precoDireto != null && hotel?.precoTotal != null ? voo.precoDireto + hotel.precoTotal : null;

  return {
    data: new Date().toISOString(),
    datas: { ida, volta },
    voo: voo ?? null,
    hotel: hotel ? { precoTotal: hotel.precoTotal, regime: hotel.regime, fonte: hotel.fonte } : null,
    totalPacote,
  };
}

function construirAlertas(config, registo, historico) {
  const alertas = [];

  if (registo.voo?.precoDireto != null && registo.voo.precoDireto <= config.voo.alvoTotal) {
    alertas.push('COMPRAR_VOO');
  }

  if (config.hotel.alvoTotal != null && registo.hotel?.precoTotal != null && registo.hotel.precoTotal <= config.hotel.alvoTotal) {
    alertas.push('COMPRAR_HOTEL');
  }

  const mediaVoo = mediaUltimos(historico, 'voo', 'precoDireto');
  if (mediaVoo != null && registo.voo?.precoDireto != null) {
    const quedaPct = ((mediaVoo - registo.voo.precoDireto) / mediaVoo) * 100;
    if (quedaPct >= config.voo.quedaAlertaPct) alertas.push('DESCIDA_VOO');
  }

  const mediaHotel = mediaUltimos(historico, 'hotel', 'precoTotal');
  if (mediaHotel != null && registo.hotel?.precoTotal != null) {
    const quedaPct = ((mediaHotel - registo.hotel.precoTotal) / mediaHotel) * 100;
    if (quedaPct >= config.hotel.quedaAlertaPct) alertas.push('DESCIDA_HOTEL');
  }

  return alertas;
}

function formatarMensagemPrincipal(registo, alertas, historico) {
  const { ida, volta } = registo.datas;
  const diaIda = ida.slice(8, 10);
  const mesIda = ida.slice(5, 7);
  const diaVolta = volta.slice(8, 10);

  const linhas = [`✈️🏨 Sal ${diaIda}–${diaVolta} fev · 3 pax`];

  if (registo.voo) {
    const mediaVoo = mediaUltimos(historico, 'voo', 'precoDireto');
    let seta = '';
    if (mediaVoo != null) {
      const pct = Math.round(((mediaVoo - registo.voo.precoDireto) / mediaVoo) * 100);
      if (pct > 0) seta = ` ▼ ${pct}%`;
      else if (pct < 0) seta = ` ▲ ${Math.abs(pct)}%`;
    }
    linhas.push(`Voo direto: ${registo.voo.precoDireto} € (${registo.voo.companhia})${seta}`);
  } else {
    linhas.push('Voo direto: sem resultados hoje');
  }

  if (registo.hotel) {
    linhas.push(`Hotel Meliá Dunas: ${registo.hotel.precoTotal.toLocaleString('pt-PT')} €`);
  } else {
    linhas.push('Hotel Meliá Dunas: sem resultados hoje');
  }

  if (registo.totalPacote != null) {
    linhas.push(`Pacote total: ${registo.totalPacote.toLocaleString('pt-PT')} €`);
  }

  if (alertas.includes('COMPRAR_VOO')) linhas.push('→ COMPRAR VOO');
  if (alertas.includes('COMPRAR_HOTEL')) linhas.push('→ COMPRAR HOTEL');
  if (alertas.some((a) => a.startsWith('DESCIDA')) && !alertas.some((a) => a.startsWith('COMPRAR'))) {
    linhas.push('→ Descida relevante, vale a pena olhar');
  }

  return linhas.join('\n');
}

function formatarResumoSemanal(config, registoRef, historico, resultadosAlt) {
  const { ida, volta } = registoRef.datas;
  const linhas = ['📊 Resumo semanal · Sal'];

  const vooRef = registoRef.voo?.precoDireto != null ? `${registoRef.voo.precoDireto} €` : 'n/d';
  const hotelRef = registoRef.hotel?.precoTotal != null ? `${registoRef.hotel.precoTotal} €` : 'n/d';
  linhas.push(`Ref. (${ida.slice(8, 10)}–${volta.slice(8, 10)} fev): voo ${vooRef} · hotel ${hotelRef}`);

  if (resultadosAlt && resultadosAlt.length > 0) {
    const refTotal = registoRef.totalPacote;
    let maisBarata = null;
    for (const alt of resultadosAlt) {
      const vooAlt = alt.voo?.precoDireto != null ? `${alt.voo.precoDireto} €` : 'n/d';
      const hotelAlt = alt.hotel?.precoTotal != null ? `${alt.hotel.precoTotal} €` : 'n/d';
      const isMaisBarata = refTotal != null && alt.totalPacote != null && alt.totalPacote < refTotal;
      if (isMaisBarata && (maisBarata == null || alt.totalPacote < maisBarata)) maisBarata = alt.totalPacote;
      linhas.push(
        `Alt. (${alt.datas.ida.slice(8, 10)}–${alt.datas.volta.slice(8, 10)} fev): voo ${vooAlt} · hotel ${hotelAlt}${isMaisBarata ? ' ← mais barato' : ''}`,
      );
    }
  }

  const semGatilho = 'Sem gatilho de compra.';
  const minVoo = minimoHistorico(historico, 'voo', 'precoDireto');
  linhas.push(`${semGatilho} Mín. histórico voo: ${minVoo != null ? minVoo + ' €' : 'n/d'}`);

  return linhas.join('\n');
}

async function main() {
  const config = await readJson(CONFIG_PATH, null);
  if (!config) throw new Error('config.json não encontrado.');

  let historico = await readJson(HISTORY_PATH, []);
  const historicoAlt = await readJson(HISTORY_ALT_PATH, []);
  const errorState = await readJson(ERROR_STATE_PATH, { falhasSeguidas: 0 });

  const { ida, volta } = config.datasReferencia;
  let registo;
  try {
    registo = await verificarDatas(config, ida, volta);
  } catch (err) {
    errorState.falhasSeguidas = (errorState.falhasSeguidas || 0) + 1;
    await writeJson(ERROR_STATE_PATH, errorState);
    if (errorState.falhasSeguidas >= 2) {
      await enviarTelegram(`⚠️ Alerta Voos Sal: falha na SerpAPI em ${errorState.falhasSeguidas} execuções seguidas.\n${err.message}`);
    }
    throw err;
  }

  const falhouTotal = registo.voo == null && registo.hotel == null;
  if (falhouTotal) {
    errorState.falhasSeguidas = (errorState.falhasSeguidas || 0) + 1;
    if (errorState.falhasSeguidas >= 2) {
      await enviarTelegram(`⚠️ Alerta Voos Sal: sem resultados (voo e hotel) em ${errorState.falhasSeguidas} execuções seguidas.`);
    }
  } else {
    errorState.falhasSeguidas = 0;
  }
  await writeJson(ERROR_STATE_PATH, errorState);

  const alertas = construirAlertas(config, registo, historico);
  historico.push(registo);

  const hoje = new Date();
  const domingo = isSunday(hoje);

  let resultadosAlt = [];
  if (domingo && config.datasAlternativas?.length) {
    for (const alt of config.datasAlternativas) {
      try {
        const registoAlt = await verificarDatas(config, alt.ida, alt.volta);
        resultadosAlt.push(registoAlt);
      } catch (err) {
        console.error('Erro ao verificar data alternativa:', alt, err.message);
      }
    }
    if (resultadosAlt.length > 0) {
      historicoAlt.push(...resultadosAlt);
      await writeJson(HISTORY_ALT_PATH, historicoAlt);
    }
  }

  await writeJson(HISTORY_PATH, historico);

  if (alertas.length > 0) {
    await enviarTelegram(formatarMensagemPrincipal(registo, alertas, historico.slice(0, -1)));
  }

  if (domingo) {
    await enviarTelegram(formatarResumoSemanal(config, registo, historico.slice(0, -1), resultadosAlt));
  }

  console.log('Verificação concluída.', JSON.stringify(registo, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
