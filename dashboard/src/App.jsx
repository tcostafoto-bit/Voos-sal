import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

const REPO = import.meta.env.VITE_GITHUB_REPO || 'SEU_USER/voos-sal';
const BRANCH = import.meta.env.VITE_GITHUB_BRANCH || 'main';
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/data`;

const ALVO = 380;
const DESTINOS = [
  { codigo: 'MUC', nome: 'Munique', regra: 'só diretos', cor: 'var(--accent)' },
  { codigo: 'SZG', nome: 'Salzburgo', regra: 'até 1 escala', cor: '#f97316' },
];

async function fetchJson(path) {
  try {
    const res = await fetch(`${RAW_BASE}/${path}?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    // Fallback local para desenvolvimento antes de o repo ter dados publicados.
    const res = await fetch(`/data/${path}?t=${Date.now()}`);
    if (!res.ok) throw new Error(`Falha ao ler ${path}: ${res.status}`);
    return res.json();
  }
}

function formatEuro(v) {
  if (v == null) return 'n/d';
  return `${v.toLocaleString('pt-PT')} €`;
}

function formatDataCurta(iso) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatDataHora(iso) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(
    d.getHours(),
  ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function totais(historico) {
  return historico.map((r) => r.melhor?.total).filter((v) => typeof v === 'number');
}

function minimoDestino(historico, codigo) {
  const vals = historico.map((r) => r.destinos?.[codigo]?.total).filter((v) => typeof v === 'number');
  return vals.length ? Math.min(...vals) : null;
}

function media7(historico) {
  const vals = totais(historico.slice(-7));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

export default function App() {
  const [historico, setHistorico] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    fetchJson('history.json')
      .then(setHistorico)
      .catch((e) => setErro(e.message));
  }, []);

  if (erro) {
    return (
      <div className="estado">
        Erro ao carregar dados: {erro}
        <br />
        Confirma VITE_GITHUB_REPO nas env vars do Vercel.
      </div>
    );
  }

  if (!historico) return <div className="estado">A carregar…</div>;

  if (historico.length === 0) {
    return (
      <div className="estado">
        Ainda sem dados. A primeira verificação automática ainda não correu.
      </div>
    );
  }

  const ultimo = historico[historico.length - 1];
  const vals = totais(historico);
  const minTotal = vals.length ? Math.min(...vals) : null;
  const mediaTotal = media7(historico);
  const melhorAgora = ultimo.melhor;
  const nomeMelhor = DESTINOS.find((d) => d.codigo === melhorAgora?.codigo)?.nome ?? melhorAgora?.codigo;

  const chartData = historico.map((r) => ({
    data: formatDataCurta(r.data),
    MUC: r.destinos?.MUC?.total ?? null,
    SZG: r.destinos?.SZG?.total ?? null,
  }));

  const ultimas10 = historico.slice(-10).reverse();

  return (
    <>
      <h1>Mondsee 8–11 jul · voo + saco de golfe</h1>
      <div className="badge">Última verificação: {formatDataHora(ultimo.data)}</div>

      <div className="card card-destaque">
        <div className="label">Mais barato agora {nomeMelhor ? `· ${nomeMelhor}` : ''}</div>
        <div className="valor">{formatEuro(melhorAgora?.total)}</div>
        <div className="comparacao">
          Alvo <strong>{formatEuro(ALVO)}</strong> · mínimo histórico <strong>{formatEuro(minTotal)}</strong>
        </div>
      </div>

      <div className="cards-apoio">
        {DESTINOS.map((d) => (
          <div className="card-apoio" key={d.codigo}>
            <div className="label">
              {d.nome} ({d.regra})
            </div>
            <div className="valor">{formatEuro(ultimo.destinos?.[d.codigo]?.total)}</div>
          </div>
        ))}
        <div className="card-apoio">
          <div className="label">Mín. Munique</div>
          <div className="valor">{formatEuro(minimoDestino(historico, 'MUC'))}</div>
        </div>
        <div className="card-apoio">
          <div className="label">Mín. Salzburgo</div>
          <div className="valor">{formatEuro(minimoDestino(historico, 'SZG'))}</div>
        </div>
        <div className="card-apoio">
          <div className="label">Média 7d (melhor)</div>
          <div className="valor">{formatEuro(mediaTotal ? Math.round(mediaTotal) : null)}</div>
        </div>
      </div>

      <div className="card">
        <h2>Evolução — voo + saco, por destino</h2>
        <div className="chart-wrap">
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="data" fontSize={11} />
              <YAxis fontSize={11} domain={['auto', 'auto']} />
              <Tooltip formatter={(v) => formatEuro(v)} />
              <Legend fontSize={11} />
              <ReferenceLine
                y={ALVO}
                stroke="var(--good)"
                strokeDasharray="4 4"
                label={{ value: 'alvo 380 €', fontSize: 11, position: 'insideTopLeft' }}
              />
              {DESTINOS.map((d) => (
                <Line
                  key={d.codigo}
                  type="monotone"
                  dataKey={d.codigo}
                  name={d.nome}
                  stroke={d.cor}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h2>Últimas verificações</h2>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Munique</th>
              <th>Salzburgo</th>
              <th>Melhor</th>
            </tr>
          </thead>
          <tbody>
            {ultimas10.map((r) => (
              <tr key={r.data}>
                <td>{formatDataCurta(r.data)}</td>
                <td>{formatEuro(r.destinos?.MUC?.total)}</td>
                <td>{formatEuro(r.destinos?.SZG?.total)}</td>
                <td>{formatEuro(r.melhor?.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="nota">
        Os valores incluem o saco de golfe: 45 €/trajeto na TAP, 60 €/trajeto nas outras companhias
        (estimativa, a confirmar).
      </p>
    </>
  );
}
