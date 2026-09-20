// Testa as funções puras do painel, extraídas do próprio HTML publicado.
// Corre com: node --test testes-painel.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./painel.html', import.meta.url), 'utf8');
const js = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</' + 'script>'));

// O script arranca sozinho e toca no DOM: dá-se-lhe um DOM de mentira.
const elemento = () => ({ textContent: '', innerHTML: '', hidden: false, addEventListener() {}, classList: { add() {}, remove() {} } });
const documento = { getElementById: elemento, addEventListener() {} };
const janela = {};
const P = new Function('document', 'window', js + `
  return { semAcentos, ehTarefa, jaFechado, ehPrincipal, somarDias, difDias, diaISO, datasNoTexto,
           abrangeDia, jaPassou, diaDoExtremo, arrumarEventos, montarLoteTriagem, podarTurnos,
           trechoComData, somarMinutos, somarDiasRelogio, relogioDe, COLABORADORAS, MAX_THREADS };
`)(documento, janela);

const HOJE = '2026-09-20';
const AGORA = new Date('2026-09-20T10:00:00+01:00');

test('datas escritas em texto: o caso real do contrato MEO', () => {
  const desc = 'Verificar como estão os preços da eletricidade no contrato da Centrimagem com a MEO Energia (a tarifa promocional era válida só até 30/09/2026). Ponto de entrega: Urbanização Portela.';
  assert.deepEqual(P.datasNoTexto(desc, HOJE), ['2026-09-30']);
});

test('datas escritas em texto: formas portuguesas', () => {
  assert.deepEqual(P.datasNoTexto('entregar até 15 de outubro', HOJE), ['2026-10-15']);
  assert.deepEqual(P.datasNoTexto('prazo 15 de out', HOJE), ['2026-10-15']);
  assert.deepEqual(P.datasNoTexto('pagar até 30/09', HOJE), ['2026-09-30']);
  assert.deepEqual(P.datasNoTexto('renovar 30-09-2026', HOJE), ['2026-09-30']);
  // Sem ano e já passado há muito: é do ano seguinte.
  assert.deepEqual(P.datasNoTexto('aniversário 05/01', HOJE), ['2027-01-05']);
  // Passou há pouco: ainda conta como este ano.
  assert.deepEqual(P.datasNoTexto('foi a 01/09', HOJE), ['2026-09-01']);
});

test('datas escritas em texto: não inventa', () => {
  assert.deepEqual(P.datasNoTexto('tel 912345678 ref 12/2024 lote 45/7000', HOJE), []);
  assert.deepEqual(P.datasNoTexto('Aroeira 1 · buraco 18', HOJE), []);
  assert.deepEqual(P.datasNoTexto('', HOJE), []);
  assert.deepEqual(P.datasNoTexto('32/13/2026 e 0/0', HOJE), []);
});

test('o trecho à volta da data dá contexto ao aviso', () => {
  const t = P.trechoComData('a tarifa promocional era válida só até 30/09/2026. Ponto de entrega: Portela.', '2026-09-30');
  assert.ok(t.includes('válida só até 30/09/2026'), t);
  assert.ok(t.length < 160);
});

function evento(id, titulo, inicio, fim, extra) {
  const soData = /^\d{4}-\d{2}-\d{2}$/.test(inicio);
  return Object.assign({ id, summary: titulo, status: 'confirmed',
    start: soData ? { date: inicio } : { dateTime: inicio },
    end: soData ? { date: fim || P.somarDias(inicio, 1) } : { dateTime: fim } }, extra || {});
}

const CALS = [
  { id: 'tcosta.foto@gmail.com', nome: 'tcosta.foto@gmail.com', cor: '#000', principal: true, contexto: false },
  { id: 'golfe@group.calendar.google.com', nome: 'Torneios Golfe', cor: '#111', principal: false, contexto: false },
  { id: 'laura@group.calendar.google.com', nome: 'Laura', cor: '#222', principal: false, contexto: true },
];

const EVENTOS = {
  'tcosta.foto@gmail.com': [
    evento('c', 'Marcar dentista', '2026-09-15'),                                  // passou, tarefa → a fechar
    evento('d', '✓ Marcar seguro', '2026-09-15'),                                  // fechado → nada
    evento('g', 'Anos abutre', '2026-09-13T11:00:00+01:00', '2026-09-13T12:00:00+01:00'), // passou, compromisso → fechou sozinho
    evento('b', 'Jantar com o Rui', '2026-10-01T20:00:00+01:00', '2026-10-01T22:00:00+01:00'), // próximos
    evento('f', 'Rever preços contrato MEO Energia (Centrimagem)', '2026-11-27T09:00:00+00:00', '2026-11-27T09:30:00+00:00',
      { description: 'Verificar (a tarifa promocional era válida só até 30/09/2026). Ponto de entrega: Portela.' }), // aviso
    evento('h', 'ACP Golfe', '2026-09-19', '2026-09-22'),                          // vários dias, abrange hoje
  ],
  'golfe@group.calendar.google.com': [
    evento('a', 'Inscrever no torneio Abreu', '2026-09-23'),                        // tarefa a 3 dias → prazo
  ],
  'laura@group.calendar.google.com': [
    evento('e', 'Ligar ao cliente', '2026-09-15'),                                  // colaboradora → nunca pendência
    evento('i', 'Sessão estúdio', '2026-09-20T15:00:00+01:00', '2026-09-20T16:00:00+01:00'), // colaboradora → aparece em hoje
  ],
};

test('arrumar: cada evento cai na gaveta certa', () => {
  const g = P.arrumarEventos(EVENTOS, CALS, AGORA, {});
  assert.deepEqual(g.aFechar.map((c) => c.id), ['c'], 'só a tarefa passada e aberta');
  assert.equal(g.aFechar[0].atras, 5);
  assert.deepEqual(g.prazos.map((c) => c.id), ['a']);
  assert.equal(g.prazos[0].faltam, 3);
  assert.deepEqual(g.fechados.map((c) => c.id), ['g'], 'compromisso passado fecha sozinho');
  assert.deepEqual(g.hoje.map((c) => c.id).sort(), ['h', 'i'], 'o de vários dias e o da colaboradora');
  assert.deepEqual(g.proximos.map((c) => c.id), ['b'], 'o prazo não se repete nos próximos; o MEO está longe');
});

test('arrumar: as colaboradoras nunca geram pendências', () => {
  const g = P.arrumarEventos(EVENTOS, CALS, AGORA, {});
  const ids = g.aFechar.concat(g.prazos, g.avisos).map((c) => c.id || c.evId);
  assert.ok(!ids.includes('e'), 'a tarefa da Laura não é do Tiago');
});

test('arrumar: encontra o prazo escondido na descrição', () => {
  const g = P.arrumarEventos(EVENTOS, CALS, AGORA, {});
  assert.equal(g.avisos.length, 1);
  assert.equal(g.avisos[0].evId, 'f');
  assert.equal(g.avisos[0].data, '2026-09-30');
  assert.equal(g.avisos[0].faltam, 10);
  assert.ok(g.avisos[0].trecho.includes('30/09/2026'));
});

test('arrumar: um aviso já tratado não volta', () => {
  const g = P.arrumarEventos(EVENTOS, CALS, AGORA, { 'f:2026-09-30': '2026-09-20' });
  assert.equal(g.avisos.length, 0);
});

test('lote de triagem: exclui o já visto e o já sugerido, corta excertos', () => {
  const threads = [
    { id: 't1', messages: [{ id: 'm1', sender: 'A <a@x.pt>', subject: 'Um', snippet: 'x'.repeat(600), date: '2026-09-19T10:00:00Z', labelIds: ['UNREAD'] }] },
    { id: 't2', messages: [{ id: 'm2', sender: 'B <b@x.pt>', subject: 'Dois', snippet: 'ok', date: '2026-09-19T10:00:00Z', labelIds: [] }] },
    { id: 't3', messages: [{ id: 'm3', sender: 'C <c@x.pt>', subject: 'Três', snippet: 'ok', date: '2026-09-19T10:00:00Z', labelIds: [] }] },
  ];
  const lote = P.montarLoteTriagem(threads, { t2: '2026-09-19' }, { t3: {} });
  assert.deepEqual(lote.map((l) => l.thread_id), ['t1']);
  assert.equal(lote[0].excerto.length, 400);
  assert.equal(lote[0].nao_lida, true);
  assert.equal(lote[0].ultima_mensagem_id, 'm1');
});

test('lote de triagem: nunca mais do que o máximo', () => {
  const muitos = Array.from({ length: 30 }, (_, i) => ({ id: 't' + i, messages: [{ id: 'm' + i, sender: 's', subject: 's', snippet: 's', date: '' }] }));
  assert.equal(P.montarLoteTriagem(muitos, {}, {}).length, P.MAX_THREADS);
});

test('podar turnos mantém a conversa a começar no utilizador', () => {
  const turnos = [];
  for (let i = 0; i < 6; i++) turnos.push({ role: 'user', content: 'u' + i }, { role: 'assistant', content: 'a' + i });
  const p = P.podarTurnos(turnos, 8);
  assert.ok(p.length <= 8);
  assert.equal(p[0].role, 'user');
  assert.equal(p[p.length - 1].role, 'assistant');
});

test('classificação dos calendários reais', () => {
  const reais = JSON.parse(fs.readFileSync('/tmp/claude-0/-home-user-Voos-sal/3de875c7-2232-56a9-b9df-f2eb9b422544/scratchpad/calendarios.json', 'utf8')).calendars;
  const contexto = reais.filter((c) => P.COLABORADORAS.includes(P.semAcentos(c.summary).trim())).map((c) => c.summary);
  assert.deepEqual(contexto.sort(), ['Catarina', 'Flavia', 'Laura']);
  assert.equal(reais.filter((c) => P.ehPrincipal(c.id)).length, 1);
});

test('tarefas: os verbos do dia-a-dia dele contam', () => {
  assert.equal(P.ehTarefa('Procurar fornecedores de conversores VHS'), true, 'evento real criado pela caixa');
  assert.equal(P.ehTarefa('Enviar orçamento ao casal Ferreira'), true);
  assert.equal(P.ehTarefa('Combinar visita com o António'), true);
  assert.equal(P.ehTarefa('Anos abutre'), false);
  assert.equal(P.ehTarefa('Final acp'), false);
  assert.equal(P.ehTarefa('Torneio the open embaixador'), false);
});

test('relógio de Lisboa: adiar por cima da mudança de hora mantém a hora', () => {
  assert.equal(P.somarDiasRelogio(P.relogioDe('2026-10-21T14:00:00+01:00'), 7), '2026-10-28T14:00:00');
  assert.equal(P.somarMinutos('2026-10-03T23:30', 60), '2026-10-04T00:30:00');
});
