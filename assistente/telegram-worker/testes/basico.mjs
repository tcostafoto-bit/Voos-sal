// Testes das partes que não falam com a rede: datas, heurísticas e conversões.
import test from 'node:test';
import assert from 'node:assert/strict';

import { abrangeDia, precisaConfirmacao, estadoDoEvento, PROP } from '../src/config.js';
import { inferirFim, montarExtremo } from '../src/ferramentas.js';
import {
  dataISO, diaPorExtenso, diferencaDias, paraRelogioLisboa,
  somarDias, somarDiasRelogio, somarMinutosRelogio,
} from '../src/tempo.js';

test('tarefas são distinguidas de compromissos', () => {
  const tarefa = (titulo) => precisaConfirmacao({ summary: titulo });
  // Títulos reais da agenda do Tiago.
  assert.equal(tarefa('MArcar teetime aroeira 1'), true);
  assert.equal(tarefa('Reuniao escola purificação ligar a confirmar'), true);
  assert.equal(tarefa('Pagar seguro do carro'), true);
  assert.equal(tarefa('Anos abutre'), false);
  assert.equal(tarefa('ACP Golfe'), false);
  assert.equal(tarefa('CARL COX | Lisbon 2026'), false);
  assert.equal(tarefa('Análise | FitGolfe & DDUA'), false);
});

test('a marca explícita ganha à heurística', () => {
  const evento = { summary: 'Marcar consulta', extendedProperties: { private: { [PROP.CONFIRMAR]: 'nao' } } };
  assert.equal(precisaConfirmacao(evento), false);
  const outro = { summary: 'Jantar', extendedProperties: { private: { [PROP.CONFIRMAR]: 'sim' } } };
  assert.equal(precisaConfirmacao(outro), true);
});

test('um evento sem marca está aberto', () => {
  assert.equal(estadoDoEvento({ summary: 'x' }), 'aberto');
  assert.equal(estadoDoEvento({ extendedProperties: { private: { [PROP.ESTADO]: 'feito' } } }), 'feito');
});

test('eventos com hora levam o fuso de Lisboa', () => {
  assert.deepEqual(montarExtremo('2026-10-03T15:00', false), {
    dateTime: '2026-10-03T15:00:00', timeZone: 'Europe/Lisbon',
  });
});

test('o fim de um evento de dia inteiro é exclusivo', () => {
  // Um evento "no dia 3" tem de terminar a 4, senão o Google mostra-o a menos.
  assert.deepEqual(montarExtremo('2026-10-03', true, { eFim: true }), { date: '2026-10-04' });
  assert.deepEqual(montarExtremo('2026-10-03', true), { date: '2026-10-03' });
});

test('sem fim indicado, um compromisso dura uma hora', () => {
  assert.deepEqual(inferirFim('2026-10-03T15:00', undefined, false), {
    dateTime: '2026-10-03T16:00:00', timeZone: 'Europe/Lisbon',
  });
});

test('sem fim indicado, uma tarefa ocupa o dia', () => {
  assert.deepEqual(inferirFim('2026-10-03', undefined, true), { date: '2026-10-04' });
});

test('as datas atravessam fins de mês e anos bissextos', () => {
  assert.equal(somarDias('2026-02-28', 1), '2026-03-01');
  assert.equal(somarDias('2028-02-28', 1), '2028-02-29');
  assert.equal(somarDias('2026-12-31', 1), '2027-01-01');
  assert.equal(diferencaDias('2026-09-19', '2026-10-01'), 12);
});

test('a data é a de Lisboa, não a do servidor em UTC', () => {
  // 23:30 UTC de 19/09 já é dia 20 em Lisboa (verão, UTC+1).
  assert.equal(dataISO(new Date('2026-09-19T23:30:00Z')), '2026-09-20');
  // 23:30 UTC de 19/12 ainda é dia 19 (inverno, UTC+0).
  assert.equal(dataISO(new Date('2026-12-19T23:30:00Z')), '2026-12-19');
});

test('os dias saem por extenso em português', () => {
  assert.equal(diaPorExtenso('2026-09-19'), 'sábado, 19 de setembro');
  assert.equal(diaPorExtenso('2027-03-01'), 'segunda-feira, 1 de março');
});

test('somar uma hora às 23:30 passa para o dia seguinte', () => {
  // A conta ingénua (23 + 1) daria "24:30", que o Google recusa.
  assert.equal(somarMinutosRelogio('2026-10-03T23:30', 60), '2026-10-04T00:30:00');
  assert.equal(somarMinutosRelogio('2026-12-31T23:00', 60), '2027-01-01T00:00:00');
});

test('adiar uma semana mantém a hora apesar da mudança de hora', () => {
  // 25/10/2026 é a noite em que Portugal recua uma hora. Um evento às 14h a
  // 21/10 tem de continuar às 14h a 28/10, não às 13h.
  const relogio = paraRelogioLisboa('2026-10-21T14:00:00+01:00');
  assert.equal(relogio, '2026-10-21T14:00:00');
  assert.equal(somarDiasRelogio(relogio, 7), '2026-10-28T14:00:00');
});

test('a hora de relógio vem do fuso de Lisboa, não de UTC', () => {
  assert.equal(paraRelogioLisboa('2026-07-15T12:00:00Z'), '2026-07-15T13:00:00');
  assert.equal(paraRelogioLisboa('2026-01-15T12:00:00Z'), '2026-01-15T12:00:00');
});

test('um evento de vários dias aparece em todos os dias que ocupa', () => {
  // "ACP Golfe" corre de 18 a 20 de setembro (o fim, 21, é exclusivo).
  const acp = { summary: 'ACP Golfe', start: { date: '2026-09-18' }, end: { date: '2026-09-21' } };
  assert.equal(abrangeDia(acp, '2026-09-17'), false);
  assert.equal(abrangeDia(acp, '2026-09-18'), true);
  assert.equal(abrangeDia(acp, '2026-09-19'), true, 'o dia do meio contava como livre');
  assert.equal(abrangeDia(acp, '2026-09-20'), true);
  assert.equal(abrangeDia(acp, '2026-09-21'), false);
});

test('um evento com hora ocupa o seu dia', () => {
  const reuniao = {
    summary: 'Reuniao escola',
    start: { dateTime: '2026-09-21T13:00:00+01:00' },
    end: { dateTime: '2026-09-21T14:00:00+01:00' },
  };
  assert.equal(abrangeDia(reuniao, '2026-09-21'), true);
  assert.equal(abrangeDia(reuniao, '2026-09-20'), false);
});
