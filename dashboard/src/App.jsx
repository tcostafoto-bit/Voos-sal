import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

const REPO = import.meta.env.VITE_GITHUB_REPO || 'SEU_USER/voos-sal';
const BRANCH = import.meta.env.VITE_GITHUB_BRANCH || 'main';
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/data`;

const ALVO_VOO = 850;
const ALVO_HOTEL = null; // ajustado depois de ver histórico real

async function fetchJson(path) {
  try {
    const res = await fetch(`${RAW_BASE}/${path}?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    // Fallback local para desenvolvimento antes do repo GitHub ter dados publicados.
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

function minimo(historico, campo, sub) {
  const vals = historico.map((r) => r[campo]?.[sub]).filter((v) => typeof v === 'number');
  return vals.length ? Math.min(...vals) : null;
}

function media7(historico, campo, sub) {
  const vals = historico
    .slice(-7)
    .map((r) => r[campo]?.[sub])
    .filter((v) => typeof v === 'number');
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

export default function App() {
  const [historico, setHistorico] = useState(null);
  const [historicoAlt, setHistoricoAlt] = useState([]);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    fetchJson('history.json')
      .then(setHistorico)
      .catch((e) => setErro(e.message));
    fetchJson('history-alternativas.json')
      .then(setHistoricoAlt)
      .catch(() => setHistoricoAlt([]));
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

  if (!historico) {
    return <div className="estado">A carregar…</div>;
  }

  if (historico.length === 0) {
    return (
      <div className="estado">
        Ainda sem dados. A primeira verificação automática ainda não correu.
      </div>
    );
  }

  const ultimo = historico[historico.length - 1];
  const minVoo = minimo(historico, 'voo', 'precoDireto');
  const minHotel = minimo(historico, 'hotel', 'precoTotal');
  const media7Voo = media7(historico, 'voo', 'precoDireto');
  const media7Hotel = media7(historico, 'hotel', 'precoTotal');

  const pacotes = historico.map((r) => r.totalPacote).filter((v) => typeof v === 'number');
  const minPacoteFinal = pacotes.length ? Math.min(...pacotes) : null;

  const chartData = historico.map((r) => ({
    data: formatDataCurta(r.data),
    voo: r.voo?.precoDireto ?? null,
    hotel: r.hotel?.precoTotal ?? null,
  }));

  const ultimas10 = historico.slice(-10).reverse();
  const ultimaAltLote = historicoAlt.length > 0 ? historicoAlt.slice(-2).reverse() : [];

  return (
    <>
      <h1>Sal 4–10 fev · Voo + Hotel</h1>
      <div className="badge">Última verificação: {formatDataHora(ultimo.data)}</div>

      <div className="card card-destaque">
        <div className="label">Pacote total (voo + hotel)</div>
        <div className="valor">{formatEuro(ultimo.totalPacote)}</div>
        <div className="comparacao">
          Mínimo histórico: <strong>{formatEuro(minPacoteFinal)}</strong>
        </div>
      </div>

      <div className="cards-apoio">
        <div className="card-apoio">
          <div className="label">Mín. voo</div>
          <div className="valor">{formatEuro(minVoo)}</div>
        </div>
        <div className="card-apoio">
          <div className="label">Mín. hotel</div>
          <div className="valor">{formatEuro(minHotel)}</div>
        </div>
        <div className="card-apoio">
          <div className="label">Média 7d voo</div>
          <div className="valor">{formatEuro(media7Voo ? Math.round(media7Voo) : null)}</div>
        </div>
        <div className="card-apoio">
          <div className="label">Média 7d hotel</div>
          <div className="valor">{formatEuro(media7Hotel ? Math.round(media7Hotel) : null)}</div>
        </div>
      </div>

      <div className="card">
        <h2>Voo direto — evolução</h2>
        <div className="chart-wrap">
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="data" fontSize={11} />
              <YAxis fontSize={11} domain={['auto', 'auto']} />
              <Tooltip formatter={(v) => formatEuro(v)} />
              <ReferenceLine
                y={ALVO_VOO}
                stroke="var(--good)"
                strokeDasharray="4 4"
                label={{ value: 'alvo', fontSize: 11, position: 'insideTopLeft' }}
              />
              <Line type="monotone" dataKey="voo" stroke="var(--accent)" strokeWidth={2} dot={{ r: 2 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h2>Hotel Meliá Dunas — evolução</h2>
        <div className="chart-wrap">
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="data" fontSize={11} />
              <YAxis fontSize={11} domain={['auto', 'auto']} />
              <Tooltip formatter={(v) => formatEuro(v)} />
              {ALVO_HOTEL != null && (
                <ReferenceLine
                  y={ALVO_HOTEL}
                  stroke="var(--good)"
                  strokeDasharray="4 4"
                  label={{ value: 'alvo', fontSize: 11, position: 'insideTopLeft' }}
                />
              )}
              <Line type="monotone" dataKey="hotel" stroke="#f97316" strokeWidth={2} dot={{ r: 2 }} connectNulls />
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
              <th>Voo</th>
              <th>Hotel</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {ultimas10.map((r) => (
              <tr key={r.data}>
                <td>{formatDataCurta(r.data)}</td>
                <td>{formatEuro(r.voo?.precoDireto)}</td>
                <td>{formatEuro(r.hotel?.precoTotal)}</td>
                <td>{formatEuro(r.totalPacote)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ultimaAltLote.length > 0 && (
        <div className="card secao-discreta">
          <h2>Datas alternativas (última verificação de domingo)</h2>
          <table>
            <thead>
              <tr>
                <th>Datas</th>
                <th>Voo</th>
                <th>Hotel</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {ultimaAltLote.map((r) => (
                <tr key={`${r.data}-${r.datas.ida}`}>
                  <td>
                    {formatDataCurta(r.datas.ida)}–{formatDataCurta(r.datas.volta)}
                  </td>
                  <td>{formatEuro(r.voo?.precoDireto)}</td>
                  <td>{formatEuro(r.hotel?.precoTotal)}</td>
                  <td>{formatEuro(r.totalPacote)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
