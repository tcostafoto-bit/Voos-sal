// Testa as funções puras do painel, extraídas do próprio HTML publicado.
// Corre com: node --test testes-painel.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./painel.html', import.meta.url), 'utf8');
const js = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</' + 'script>'));

// O script arranca sozinho e toca no DOM: dá-se-lhe um DOM de mentira.
// Tem de responder a tudo o que o arranque toca — um null aqui rebenta o
// ficheiro inteiro de testes e esconde o que eles tinham a dizer.
const elemento = () => ({
  textContent: '', innerHTML: '', hidden: false, dataset: {}, scrollTop: 0,
  addEventListener() {}, setAttribute() {}, removeAttribute() {},
  classList: { add() {}, remove() {} },
  querySelector: () => elemento(), querySelectorAll: () => [],
  closest: () => null, focus() {},
});
const documento = {
  getElementById: elemento, querySelector: elemento, querySelectorAll: () => [],
  addEventListener() {},
};
const janela = { localStorage: { getItem: () => null, setItem() {} } };
globalThis.localStorage = janela.localStorage;
const P = new Function('document', 'window', js + `
  return { semAcentos, ehTarefa, jaFechado, ehPrincipal, somarDias, difDias, diaISO, datasNoTexto,
           abrangeDia, jaPassou, diaDoExtremo, arrumarEventos, montarLoteTriagem, podarTurnos,
           trechoComData, somarMinutos, somarDiasRelogio, relogioDe, COLABORADORAS, MAX_THREADS,
           estadoMemoria, ehNota, notasDeEventos, contagens, ABAS, TITULOS, tratados, MARCA_NOTA, PREFIXO_TAREFA, PREFIXO_FACTO, DIA_GAVETA, DIAS_REPETICAO };
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

test('uma secção da memória nunca desaparece — diz sempre em que pé está', () => {
  // O defeito que escondeu a nota do António: sem memória, a secção não existia.
  const aLigar = P.estadoMemoria('aLigar', '', 'vazio normal');
  assert.equal(aLigar.ok, false);
  assert.ok(aLigar.html.includes('A abrir a memória'));

  const sem = P.estadoMemoria('indisponivel', '', 'vazio normal');
  assert.equal(sem.ok, false);
  assert.ok(sem.html.includes('não tem acesso à memória'), sem.html);

  const falhou = P.estadoMemoria('pronta', 'revoked', 'vazio normal');
  assert.equal(falhou.ok, false);
  assert.ok(falhou.html.includes('retirado'), falhou.html);

  const desconhecido = P.estadoMemoria('pronta', 'codigo_novo', 'vazio normal');
  assert.ok(desconhecido.html.includes('codigo_novo'), 'um código novo continua a ser dito');

  const bem = P.estadoMemoria('pronta', '', 'vazio normal');
  assert.equal(bem.ok, true);
  assert.ok(bem.html.includes('vazio normal'));

  // Em nenhum caso devolve vazio: haveria sempre alguma coisa a mostrar.
  for (const r of [aLigar, sem, falhou, bem]) assert.ok(r.html.length > 10);

  // Todo o estado sem saída automática traz a maneira de sair dele.
  for (const r of [sem, falhou]) assert.ok(r.html.includes('data-memoria'), 'falta o Tentar de novo');
  assert.ok(!bem.html.includes('data-memoria'));

  // O caso da captura do Tiago: ficou preso "a abrir" e sem saída.
  const preso = P.estadoMemoria('pronta', 'sem_resposta', 'vazio normal');
  assert.ok(preso.html.includes('não respondeu a tempo'), preso.html);
  assert.ok(preso.html.includes('data-memoria'));
});

test('notas: vivem no calendário e vêm de duas fontes', () => {
  const nota = (id, titulo, criada) => ({ id, summary: titulo, status: 'confirmed',
    start: { date: '2026-09-20' }, end: { date: '2026-09-21' },
    description: '[' + P.MARCA_NOTA + '] tarefa sem data · caixa', created: criada });

  const dedicados = [
    nota('n1', P.PREFIXO_TAREFA + ' Ligar ao António dos Simuladores', '2026-09-20T11:30:00Z'),
    nota('n2', P.PREFIXO_FACTO + ' O casamento dos Silva é com a Joana', '2026-09-19T09:00:00Z'),
    nota('n3', '✓ Comprar tinteiros', '2026-09-18T09:00:00Z'),
    nota('n4', '✗ Coisa que já não interessa', '2026-09-17T09:00:00Z'),
  ];
  // A mesma n1 também veio no watch normal do calendário: não pode duplicar.
  const porCal = { 'p@x': [dedicados[0], nota('n5', P.PREFIXO_TAREFA + ' Enviar orçamento dos sacos', '2026-09-20T12:00:00Z')] };

  const r = P.notasDeEventos(dedicados, porCal, 'p@x');
  assert.deepEqual(r.map((n) => n.id), ['n5', 'n1', 'n2'], 'sem duplicados, mais recente primeiro, sem ✓/✗');
  assert.equal(r.find((n) => n.id === 'n1').texto, 'Ligar ao António dos Simuladores', 'o prefixo sai do texto');
  assert.equal(r.find((n) => n.id === 'n2').tipo, 'facto');
  assert.equal(r.find((n) => n.id === 'n1').tipo, 'tarefa');

  // Se o watch dedicado falhar, o calendário normal ainda sustenta a lista.
  assert.equal(P.notasDeEventos([], porCal, 'p@x').length, 2, 'uma fonte em baixo não esvazia a lista');
  assert.equal(P.notasDeEventos(dedicados, {}, 'p@x').length, 2);
});

test('notas: nunca aparecem como compromissos da agenda', () => {
  const marcada = { summary: P.PREFIXO_TAREFA + ' Ligar ao António', description: '[' + P.MARCA_NOTA + '] tarefa sem data' };
  assert.equal(P.ehNota(marcada), true);
  assert.equal(P.ehNota({ summary: 'Jantar com o Rui' }), false);
  // Basta o prefixo, mesmo sem descrição — ou a marca, mesmo sem prefixo.
  assert.equal(P.ehNota({ summary: P.PREFIXO_FACTO + ' Um facto' }), true);
  assert.equal(P.ehNota({ summary: 'Sem prefixo', description: 'x [' + P.MARCA_NOTA + '] y' }), true);

  const cals = [{ id: 'p@x', nome: 'Principal', cor: '#000', principal: true, contexto: false }];
  const g = P.arrumarEventos({ 'p@x': [marcada && {
    id: 'n1', status: 'confirmed', summary: marcada.summary, description: marcada.description,
    start: { date: '2026-09-20' }, end: { date: '2026-09-21' } }] }, cals, new Date('2026-09-20T10:00:00+01:00'), {});
  assert.equal(g.hoje.length, 0, 'uma nota não ocupa o dia');
  assert.equal(g.aFechar.length + g.prazos.length + g.proximos.length, 0);
});

test('notas: um facto fica na gaveta, fora de qualquer dia real', () => {
  assert.ok(P.DIA_GAVETA < '2020-01-01', 'a gaveta tem de estar longe do presente');
  const facto = { id: 'f1', status: 'confirmed',
    summary: P.PREFIXO_FACTO + ' O casamento dos Silva é com a Joana',
    description: '[' + P.MARCA_NOTA + '] facto',
    start: { date: P.DIA_GAVETA }, end: { date: '2010-01-02' } };
  const cals = [{ id: 'p@x', nome: 'Principal', cor: '#000', principal: true, contexto: false }];
  const g = P.arrumarEventos({ 'p@x': [facto] }, cals, new Date('2026-09-20T10:00:00+01:00'), {});
  assert.equal(g.hoje.length + g.proximos.length + g.aFechar.length + g.prazos.length + g.fechados.length, 0);
  assert.equal(P.notasDeEventos([facto], {}, 'p@x')[0].tipo, 'facto');
});

test('notas: uma tarefa repetida conta uma vez, pelo evento-mestre', () => {
  // O Google devolve uma ocorrência por dia; a lista não pode mostrar 30 linhas
  // iguais, e fechar tem de apagar a série, não o dia de hoje.
  const ocorrencia = (dia) => ({
    id: 'mestre_' + dia.replace(/-/g, ''), recurringEventId: 'mestre', status: 'confirmed',
    summary: P.PREFIXO_TAREFA + ' Ligar ao António dos Simuladores',
    description: '[' + P.MARCA_NOTA + '] tarefa sem data',
    start: { date: dia }, end: { date: '2026-09-30' }, created: '2026-09-20T11:30:00Z' });

  const r = P.notasDeEventos([ocorrencia('2026-09-20'), ocorrencia('2026-09-21'), ocorrencia('2026-09-22')], {}, 'p@x');
  assert.equal(r.length, 1, 'três ocorrências, uma tarefa');
  assert.equal(r[0].id, 'mestre', 'é o mestre que se fecha, não a ocorrência do dia');
  assert.equal(r[0].texto, 'Ligar ao António dos Simuladores');

  // E uma tarefa repetida nunca ocupa um dia da agenda.
  const cals = [{ id: 'p@x', nome: 'Principal', cor: '#000', principal: true, contexto: false }];
  const g = P.arrumarEventos({ 'p@x': [ocorrencia('2026-09-20')] }, cals, new Date('2026-09-20T10:00:00+01:00'), {});
  assert.equal(g.hoje.length, 0);
});

test('notas: uma fechada sai da lista e fica como registo', () => {
  const feita = { id: 'r1', status: 'confirmed', summary: '✓ Ligar ao António dos Simuladores',
    description: '[' + P.MARCA_NOTA + '] fechada', start: { date: '2026-09-22' }, end: { date: '2026-09-23' } };
  assert.equal(P.notasDeEventos([feita], {}, 'p@x').length, 0, 'já não é uma nota aberta');
  assert.equal(P.ehNota(feita), true, 'mas continua a ser excluída da agenda');
});

test('a repetição tem fim: uma tarefa esquecida não fica eterna', () => {
  assert.ok(P.DIAS_REPETICAO > 30 && P.DIAS_REPETICAO <= 366, 'repete-se o suficiente sem ser para sempre');
});

test('abas: os números são o que está à espera dele', () => {
  const g = { hoje: [{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }], aFechar: [{ id: 'a1' }],
    prazos: [{ id: 'p1' }], avisos: [{ id: 'v1' }], proximos: [], fechados: [] };
  const tarefas = [{ id: 't1' }];

  const c = P.contagens(g, tarefas, 3, [{ id: 'f1' }, { id: 'f2' }]);
  assert.equal(c.hoje, 3, 'os eventos do dia');
  assert.equal(c.fazer, 4, 'uma passada, um prazo, um aviso, uma sem data');
  assert.equal(c.email, 3);
  assert.equal(c.memoria, 0, 'um facto não é para fazer: nunca leva número');

  // Cada aba tem título e cada título tem aba.
  assert.deepEqual(P.ABAS.slice().sort(), Object.keys(P.TITULOS).sort());
  assert.deepEqual(P.ABAS.slice().sort(), Object.keys(c).sort());
});

test('abas: o que já foi tratado sai da conta', () => {
  const g = { hoje: [], aFechar: [{ id: 'a1' }, { id: 'a2' }], prazos: [], avisos: [], proximos: [], fechados: [] };
  assert.equal(P.contagens(g, [], 0, []).fazer, 2);
  // O painel guarda o que o utilizador acabou de fechar; o número tem de acompanhar.
  P.tratados.a1 = 'feito';
  assert.equal(P.contagens(g, [], 0, []).fazer, 1, 'uma fechada, menos uma no número');
  delete P.tratados.a1;
});
