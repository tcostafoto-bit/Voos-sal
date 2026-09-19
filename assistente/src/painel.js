// O painel visual. Uma página só, sem build, servida pelo próprio Worker.

export function paginaPainel() {
  return `<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0b0d10">
<title>Assistente</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🗓️</text></svg>">
<style>
  :root {
    --fundo: #f6f7f9;
    --cartao: #ffffff;
    --texto: #14171a;
    --suave: #667085;
    --risca: #e4e7ec;
    --realce: #1f6feb;
    --urgente: #b42318;
    --urgente-fundo: #fef3f2;
    --ok: #067647;
    --sombra: 0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.1);
    --raio: 14px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --fundo: #0b0d10;
      --cartao: #15181d;
      --texto: #e6e8eb;
      --suave: #939aa4;
      --risca: #262a31;
      --realce: #589bff;
      --urgente: #ff8a7a;
      --urgente-fundo: #2a1614;
      --ok: #4ade80;
      --sombra: none;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0 16px 64px;
    background: var(--fundo); color: var(--texto);
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .envolve { max-width: 760px; margin: 0 auto; }
  header { padding: 28px 0 8px; }
  h1 { margin: 0; font-size: 26px; letter-spacing: -.02em; }
  header p { margin: 4px 0 0; color: var(--suave); font-size: 15px; }
  h2 {
    margin: 32px 0 10px; font-size: 13px; font-weight: 600;
    text-transform: uppercase; letter-spacing: .08em; color: var(--suave);
    display: flex; align-items: center; gap: 8px;
  }
  h2 .conta {
    background: var(--risca); color: var(--suave); border-radius: 999px;
    padding: 1px 8px; font-size: 12px; letter-spacing: 0;
  }
  .cartao {
    background: var(--cartao); border: 1px solid var(--risca); border-radius: var(--raio);
    padding: 14px 16px; margin-bottom: 10px; box-shadow: var(--sombra);
    display: flex; gap: 12px; align-items: flex-start;
  }
  .cartao.urgente { border-color: color-mix(in srgb, var(--urgente) 40%, var(--risca)); background: var(--urgente-fundo); }
  .ponto { width: 10px; height: 10px; border-radius: 50%; margin-top: 7px; flex: 0 0 auto; }
  .corpo { flex: 1; min-width: 0; }
  .titulo { font-weight: 600; letter-spacing: -.01em; overflow-wrap: anywhere; }
  .meta { color: var(--suave); font-size: 14px; margin-top: 2px; }
  .hora {
    font-variant-numeric: tabular-nums; font-weight: 600;
    min-width: 52px; flex: 0 0 auto; color: var(--texto);
  }
  .hora.vazia { color: var(--suave); font-weight: 400; font-size: 13px; }
  .botoes { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  button {
    font: inherit; font-size: 14px; font-weight: 500;
    padding: 7px 14px; border-radius: 9px; cursor: pointer;
    border: 1px solid var(--risca); background: var(--cartao); color: var(--texto);
    transition: transform .06s ease, opacity .15s ease;
  }
  button:active { transform: scale(.97); }
  button.sim { background: var(--ok); border-color: var(--ok); color: #fff; }
  button:disabled { opacity: .4; cursor: default; }
  .vazio { color: var(--suave); font-size: 15px; padding: 4px 2px 8px; }
  .aviso {
    position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%) translateY(120%);
    background: var(--texto); color: var(--fundo); padding: 10px 18px; border-radius: 999px;
    font-size: 14px; font-weight: 500; transition: transform .25s cubic-bezier(.2,.8,.2,1);
    z-index: 10; max-width: calc(100vw - 32px); text-align: center;
  }
  .aviso.mostra { transform: translateX(-50%) translateY(0); }
  .rodape { margin-top: 40px; color: var(--suave); font-size: 13px; text-align: center; }
  .esqueleto { height: 64px; border-radius: var(--raio); background: var(--risca); margin-bottom: 10px; animation: pulsar 1.4s ease-in-out infinite; }
  @keyframes pulsar { 0%,100% { opacity: .5 } 50% { opacity: .9 } }
</style>
</head>
<body>
<div class="envolve">
  <header>
    <h1>Assistente</h1>
    <p id="data">a carregar…</p>
  </header>
  <main id="conteudo">
    <div class="esqueleto"></div><div class="esqueleto"></div><div class="esqueleto"></div>
  </main>
  <p class="rodape" id="rodape"></p>
</div>
<div class="aviso" id="aviso"></div>
<script>
const chave = new URLSearchParams(location.search).get('k') || '';
const conteudo = document.getElementById('conteudo');
const aviso = document.getElementById('aviso');
let temporizador;

function mostrar(texto) {
  aviso.textContent = texto;
  aviso.classList.add('mostra');
  clearTimeout(temporizador);
  temporizador = setTimeout(() => aviso.classList.remove('mostra'), 2600);
}

function esc(t) {
  return String(t ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function botao(rotulo, classe, acao) {
  return '<button class="' + classe + '" data-acao="' + esc(JSON.stringify(acao)) + '">' + rotulo + '</button>';
}

function cartao(c, { urgente = false, botoes = '', quando = '' } = {}) {
  const hora = quando || (c.hora || 'todo o dia');
  return '<div class="cartao' + (urgente ? ' urgente' : '') + '">' +
    '<span class="ponto" style="background:' + esc(c.cor || '#888') + '"></span>' +
    '<span class="hora' + (c.hora ? '' : ' vazia') + '">' + esc(hora) + '</span>' +
    '<div class="corpo">' +
      '<div class="titulo">' + esc(c.titulo) + '</div>' +
      '<div class="meta">' + esc([c.calendario, c.local].filter(Boolean).join(' · ')) + '</div>' +
      (botoes ? '<div class="botoes">' + botoes + '</div>' : '') +
    '</div></div>';
}

function seccao(titulo, conta, corpo, vazio) {
  return '<h2>' + titulo + (conta ? '<span class="conta">' + conta + '</span>' : '') + '</h2>' +
    (corpo || '<p class="vazio">' + vazio + '</p>');
}

async function carregar() {
  const r = await fetch('/api/estado?k=' + encodeURIComponent(chave));
  if (!r.ok) {
    conteudo.innerHTML = '<p class="vazio">Sem acesso. Verifica o link.</p>';
    return;
  }
  const d = await r.json();
  document.getElementById('data').textContent = d.diaPorExtenso;

  const porFechar = d.porFechar.map(c => cartao(c, {
    urgente: true,
    quando: c.diasAtras === 0 ? 'hoje' : c.diasAtras === 1 ? 'ontem' : 'há ' + c.diasAtras + 'd',
    botoes:
      botao('✅ Aconteceu', 'sim', { t: 'estado', cal: c.calendarioId, ev: c.id, valor: 'feito' }) +
      botao('❌ Não', '', { t: 'estado', cal: c.calendarioId, ev: c.id, valor: 'falhado' }) +
      botao('📅 Adiar 1 semana', '', { t: 'adiar', cal: c.calendarioId, ev: c.id, dias: 7 }),
  })).join('');

  const prazos = d.prazos.map(c => cartao(c, {
    quando: c.faltam === 0 ? 'hoje' : c.faltam === 1 ? 'amanhã' : 'em ' + c.faltam + 'd',
    botoes:
      botao('✅ Já tratei', 'sim', { t: 'estado', cal: c.calendarioId, ev: c.id, valor: 'feito' }) +
      botao('📅 +1 semana', '', { t: 'adiar', cal: c.calendarioId, ev: c.id, dias: 7 }),
  })).join('');

  const hoje = d.doDia.map(c => cartao(c)).join('');

  const sugestoes = d.sugestoes.map(s => {
    const meta = [s.data && (s.data + (s.hora ? ' ' + s.hora : '')), s.de].filter(Boolean).join(' · ');
    const acoes = s.tipo === 'responder'
      ? '<span class="meta">Rascunho no Gmail</span>'
      : botao('➕ Adicionar', 'sim', { t: 'sugestao', id: s.id, escolha: 'add' }) +
        botao('🗑 Ignorar', '', { t: 'sugestao', id: s.id, escolha: 'ignorar' });
    return '<div class="cartao">' +
      '<span class="hora vazia">' + (s.tipo === 'prazo' ? '⏳' : s.tipo === 'responder' ? '✉️' : '📌') + '</span>' +
      '<div class="corpo"><div class="titulo">' + esc(s.titulo) + '</div>' +
      '<div class="meta">' + esc(s.porque) + '</div>' +
      '<div class="meta">' + esc(meta) + '</div>' +
      '<div class="botoes">' + acoes + '</div></div></div>';
  }).join('');

  const proximos = d.proximos.map(c => cartao(c, { quando: c.diaCurto })).join('');

  conteudo.innerHTML =
    seccao('A precisar de ti', d.porFechar.length + d.prazos.length, porFechar + prazos, 'Nada pendente. Tudo fechado.') +
    seccao('Hoje', d.doDia.length, hoje, 'Dia livre.') +
    seccao('Do email', d.sugestoes.length, sugestoes, 'Nada de novo na caixa de entrada.') +
    seccao('Próximos 7 dias', d.proximos.length, proximos, 'Nada marcado.');

  document.getElementById('rodape').textContent =
    d.ultimoVarrimento ? 'Último varrimento: ' + new Date(d.ultimoVarrimento).toLocaleString('pt-PT') : '';
}

conteudo.addEventListener('click', async (evento) => {
  const alvo = evento.target.closest('button[data-acao]');
  if (!alvo) return;
  const grupo = alvo.closest('.botoes');
  grupo.querySelectorAll('button').forEach(b => { b.disabled = true; });
  const r = await fetch('/api/acao?k=' + encodeURIComponent(chave), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: alvo.dataset.acao,
  });
  const d = await r.json().catch(() => ({ mensagem: 'Falhou.' }));
  mostrar(d.mensagem || 'Feito');
  await carregar();
});

carregar();
setInterval(carregar, 120000);
</script>
</body>
</html>`;
}
