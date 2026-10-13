// Testes das funções puras de scripts/check-prices.mjs.
// Correr com: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../scripts/check-prices.mjs';

const SACO = { trajetos: 2, porTrajetoTap: 45, porTrajetoOutras: 60, confirmadoOutras: false };

const CONFIG = {
  viagem: {
    nome: 'Mondsee',
    titulo: '⛳ Mondsee 8–11 jul',
    alvoTotal: 380,
    quedaAlertaPct: 8,
    destinos: [
      { codigo: 'MUC', nome: 'Munique', maxEscalas: 0 },
      { codigo: 'SZG', nome: 'Salzburgo', maxEscalas: 1 },
    ],
  },
};

// Um itinerário como a SerpAPI o devolve, reduzido ao que o código lê.
function perna(de, saidaHora, para, chegadaHora, companhia) {
  return {
    airline: companhia,
    departure_airport: { id: de, time: `2027-07-08 ${saidaHora}:00` },
    arrival_airport: { id: para, time: `2027-07-08 ${chegadaHora}:00` },
  };
}

function itinerario(preco, pernas) {
  return { price: preco, flights: pernas };
}

test('horaDe e horaEmMinutos', () => {
  assert.equal(P.horaDe('2027-07-08 07:15'), '07:15');
  assert.equal(P.horaDe(undefined), '');
  assert.equal(P.horaEmMinutos('10:00'), 600);
  assert.equal(P.horaEmMinutos('9:30'), 570);
  assert.equal(P.horaEmMinutos('tralha'), null);
});

test('saco de golfe: 45 €/trajeto na TAP, 60 € nas outras, ×2 trajetos', () => {
  const tap = P.taxaSaco(['TAP Air Portugal'], SACO);
  assert.equal(tap.total, 90);
  assert.equal(tap.confirmado, true, 'na TAP o valor está confirmado');

  const outra = P.taxaSaco(['Lufthansa'], SACO);
  assert.equal(outra.total, 120);
  assert.equal(outra.confirmado, false, 'nas outras é estimativa até ele confirmar');
});

test('saco: itinerário misto paga a taxa mais alta — nunca prometer o preço bom', () => {
  const misto = P.taxaSaco(['TAP Air Portugal', 'Austrian Airlines'], SACO);
  assert.equal(misto.total, 120);
  assert.equal(misto.confirmado, false);
});

test('ida: partidas depois das 10:00 ficam de fora', () => {
  const cedo = itinerario(200, [perna('LIS', '07:15', 'MUC', '11:05', 'TAP Air Portugal')]);
  const tarde = itinerario(150, [perna('LIS', '10:30', 'MUC', '14:20', 'TAP Air Portugal')]);

  const melhor = P.escolherMelhor([tarde, cedo], { maxEscalas: 0, partidaIdaAte: '10:00' }, SACO);
  assert.equal(melhor.precoVoo, 200, 'o mais barato parte tarde, por isso não serve');
  assert.equal(melhor.partidaIda, '07:15');

  const exatamenteAs10 = itinerario(100, [perna('LIS', '10:00', 'MUC', '13:50', 'TAP Air Portugal')]);
  const comAs10 = P.escolherMelhor([exatamenteAs10], { maxEscalas: 0, partidaIdaAte: '10:00' }, SACO);
  assert.ok(comAs10, 'às 10:00 em ponto ainda serve');
});

test('escalas: MUC só aceita diretos, SZG aceita uma', () => {
  const direto = itinerario(300, [perna('LIS', '08:00', 'MUC', '12:00', 'TAP Air Portugal')]);
  const comEscala = itinerario(180, [
    perna('LIS', '08:00', 'FRA', '11:30', 'Lufthansa'),
    perna('FRA', '12:30', 'SZG', '13:40', 'Lufthansa'),
  ]);

  assert.equal(
    P.escolherMelhor([direto, comEscala], { maxEscalas: 0, partidaIdaAte: '10:00' }, SACO).escalas,
    0,
    'com maxEscalas 0, o de escala não entra',
  );

  const szg = P.escolherMelhor([comEscala], { maxEscalas: 1, partidaIdaAte: '10:00' }, SACO);
  assert.equal(szg.escalas, 1);
  assert.equal(szg.detalhe, 'LIS 08:00 → SZG 13:40 via FRA');
});

test('o mais barato é o mais barato COM saco, não o voo mais barato', () => {
  // 300 € na TAP + 90 = 390. 320 € na Lufthansa + 120 = 440.
  // Mas ao contrário: 250 na Lufthansa + 120 = 370 ganha a 300 na TAP + 90 = 390.
  const tapCaro = itinerario(300, [perna('LIS', '07:00', 'MUC', '11:00', 'TAP Air Portugal')]);
  const outraBarata = itinerario(250, [perna('LIS', '08:00', 'MUC', '12:00', 'Lufthansa')]);

  const melhor = P.escolherMelhor([tapCaro, outraBarata], { maxEscalas: 0, partidaIdaAte: '10:00' }, SACO);
  assert.equal(melhor.total, 370);
  assert.equal(melhor.companhia, 'Lufthansa');

  // E o caso em que o saco inverte a ordem: 290 na Lufthansa (410) perde
  // para 300 na TAP (390).
  const quaseIgual = itinerario(290, [perna('LIS', '08:00', 'MUC', '12:00', 'Lufthansa')]);
  const vence = P.escolherMelhor([tapCaro, quaseIgual], { maxEscalas: 0, partidaIdaAte: '10:00' }, SACO);
  assert.equal(vence.companhia, 'TAP Air Portugal', 'o saco mais barato compensa os 10 € de voo');
  assert.equal(vence.total, 390);
});

test('sem itinerários válidos devolve null, não rebenta', () => {
  assert.equal(P.escolherMelhor([], { maxEscalas: 0, partidaIdaAte: '10:00' }, SACO), null);
  assert.equal(P.escolherMelhor(undefined, { maxEscalas: 0, partidaIdaAte: '10:00' }, SACO), null);
  const semPreco = itinerario(null, [perna('LIS', '07:00', 'MUC', '11:00', 'TAP Air Portugal')]);
  assert.equal(P.escolherMelhor([semPreco], { maxEscalas: 0, partidaIdaAte: '10:00' }, SACO), null);
});

test('destinoMaisBarato compara os dois e ignora o que falhou', () => {
  assert.deepEqual(P.destinoMaisBarato({ MUC: { total: 390 }, SZG: { total: 370 } }), {
    codigo: 'SZG',
    total: 370,
  });
  assert.deepEqual(P.destinoMaisBarato({ MUC: { total: 390 }, SZG: null }), { codigo: 'MUC', total: 390 });
  assert.equal(P.destinoMaisBarato({ MUC: null, SZG: null }), null);
});

test('alerta de compra dispara no alvo de 380 €, com saco incluído', () => {
  const noAlvo = { melhor: { codigo: 'MUC', total: 380 } };
  assert.deepEqual(P.construirAlertas(CONFIG, noAlvo, []), ['COMPRAR']);

  const acima = { melhor: { codigo: 'MUC', total: 381 } };
  assert.deepEqual(P.construirAlertas(CONFIG, acima, []), []);

  // 410 € não chega ao alvo, mas é uma queda de 18% face à média de 500.
  const historico = [500, 500, 500].map((t) => ({ melhor: { codigo: 'MUC', total: t } }));
  assert.deepEqual(P.construirAlertas(CONFIG, { melhor: { total: 410 } }, historico), ['DESCIDA']);
});

test('sem preço nenhum não há alertas', () => {
  assert.deepEqual(P.construirAlertas(CONFIG, { melhor: null }, []), []);
});

test('média e mínimo leem o total do melhor destino', () => {
  const h = [300, 400, 500].map((t) => ({ melhor: { total: t } }));
  assert.equal(P.minimoHistorico(h), 300);
  assert.equal(P.mediaUltimos(h), 400);
  assert.equal(P.minimoHistorico([]), null);
  assert.equal(P.mediaUltimos([{ melhor: null }]), null);
});

test('a mensagem tem o título pedido, os dois destinos e diz qual é mais barato', () => {
  const registo = {
    destinos: {
      MUC: {
        precoVoo: 300, saco: 90, total: 390, companhia: 'TAP Air Portugal',
        escalas: 0, detalhe: 'LIS 07:15 → MUC 11:05', sacoConfirmado: true,
      },
      SZG: {
        precoVoo: 250, saco: 120, total: 370, companhia: 'Lufthansa',
        escalas: 1, detalhe: 'LIS 08:00 → SZG 13:40 via FRA', sacoConfirmado: false,
      },
    },
    melhor: { codigo: 'SZG', total: 370 },
  };
  const msg = P.formatarMensagem(CONFIG, registo, [], ['COMPRAR']);

  assert.ok(msg.startsWith('⛳ Mondsee 8–11 jul\n'), 'título na primeira linha');
  assert.match(msg, /Munique \(direto\): 300 € \+ saco 90 € = 390 €/);
  assert.match(msg, /Salzburgo \(1 escala\): 250 € \+ saco 120 € = 370 €  ← mais barato/);
  assert.match(msg, /saco a confirmar/, 'a Lufthansa leva a marca de estimativa');
  assert.ok(!/Munique.*saco a confirmar/.test(msg), 'a TAP não leva marca');
  assert.match(msg, /Alvo 380 €/);
  assert.match(msg, /→ COMPRAR/);
});

test('mensagem sem resultados num destino não esconde o outro', () => {
  const registo = {
    destinos: {
      MUC: null,
      SZG: {
        precoVoo: 400, saco: 120, total: 520, companhia: 'Austrian',
        escalas: 1, detalhe: 'LIS 09:00 → SZG 15:00 via VIE', sacoConfirmado: false,
      },
    },
    melhor: { codigo: 'SZG', total: 520 },
  };
  const msg = P.formatarMensagem(CONFIG, registo, [], []);
  assert.match(msg, /Munique: sem voos que sirvam hoje/);
  assert.match(msg, /Salzburgo \(1 escala\)/);
  assert.match(msg, /Sem gatilho de compra/);
});

test('resumo semanal diz o mínimo e quantas verificações já houve', () => {
  const registo = {
    destinos: { MUC: { total: 390 }, SZG: { total: 370 } },
    melhor: { codigo: 'SZG', total: 370 },
  };
  const h = [420, 400].map((t) => ({ melhor: { total: t } }));
  const msg = P.formatarResumoSemanal(CONFIG, registo, h);
  assert.ok(msg.startsWith('📊 Resumo semanal · Mondsee'));
  assert.match(msg, /Salzburgo: 370 € ← mais barato/);
  assert.match(msg, /Mín. histórico 400 €/);
  assert.match(msg, /2 verificações/);
});

// Este não testa código, testa o config.json a sério: é a rede de segurança
// contra alguém mexer num número e o alerta passar a seguir outra viagem.
test('o config.json em uso é a viagem que o Tiago pediu', async () => {
  const { readFile } = await import('node:fs/promises');
  const url = new URL('../config.json', import.meta.url);
  const { viagem } = JSON.parse(await readFile(url, 'utf-8'));

  assert.equal(viagem.origem, 'LIS');
  assert.equal(viagem.adultos, 1);
  assert.equal(viagem.criancas, 0);
  assert.deepEqual(viagem.datas, { ida: '2027-07-08', volta: '2027-07-11' });
  assert.equal(viagem.partidaIdaAte, '10:00');
  assert.equal(viagem.alvoTotal, 380);
  assert.equal(viagem.titulo, '⛳ Mondsee 8–11 jul');
  assert.deepEqual(
    viagem.destinos.map((d) => [d.codigo, d.maxEscalas]),
    [['MUC', 0], ['SZG', 0]],
    'os dois destinos são só diretos',
  );
  assert.equal(viagem.sacoGolfe.porTrajetoTap, 45);
  assert.equal(viagem.sacoGolfe.porTrajetoOutras, 60);
  assert.equal(viagem.sacoGolfe.trajetos, 2);
});

test('isSunday usa UTC', () => {
  assert.equal(P.isSunday(new Date('2026-10-18T00:00:00Z')), true);
  assert.equal(P.isSunday(new Date('2026-10-19T00:00:00Z')), false);
});
