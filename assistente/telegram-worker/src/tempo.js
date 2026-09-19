// Utilitários de data/hora sempre ancorados no fuso de Lisboa.
// O Worker corre em UTC, por isso nada aqui pode depender do fuso da máquina.

export const FUSO = 'Europe/Lisbon';

/** Devolve o offset de Lisboa nesse instante, no formato "+01:00". */
export function offsetLisboa(data = new Date()) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO,
    timeZoneName: 'longOffset',
  }).formatToParts(data);
  const nome = partes.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const offset = nome.replace('GMT', '');
  return offset === '' ? '+00:00' : offset;
}

/** Componentes de data/hora de um instante, tal como se veem em Lisboa. */
export function partesLisboa(data = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(data).map((x) => [x.type, x.value]));
  return {
    ano: p.year, mes: p.month, dia: p.day,
    hora: p.hour === '24' ? '00' : p.hour,
    minuto: p.minute, segundo: p.second,
  };
}

/** "2026-09-19" para o dia em Lisboa. */
export function dataISO(data = new Date()) {
  const { ano, mes, dia } = partesLisboa(data);
  return `${ano}-${mes}-${dia}`;
}

/** "2026-09-19T14:30:00+01:00" */
export function instanteISO(data = new Date()) {
  const { ano, mes, dia, hora, minuto, segundo } = partesLisboa(data);
  return `${ano}-${mes}-${dia}T${hora}:${minuto}:${segundo}${offsetLisboa(data)}`;
}

/** Início do dia (00:00 em Lisboa) de uma data ISO "YYYY-MM-DD", como Date. */
export function inicioDoDia(diaISO) {
  const provisorio = new Date(`${diaISO}T00:00:00Z`);
  // Duas passagens: a primeira dá-nos o offset correto para esse dia do ano.
  const off = offsetLisboa(provisorio);
  return new Date(`${diaISO}T00:00:00${off}`);
}

export function fimDoDia(diaISO) {
  const provisorio = new Date(`${diaISO}T23:59:59Z`);
  const off = offsetLisboa(provisorio);
  return new Date(`${diaISO}T23:59:59${off}`);
}

/** Soma dias a uma data ISO "YYYY-MM-DD" (trabalha ao nível do calendário). */
export function somarDias(diaISO, dias) {
  const d = new Date(`${diaISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "quinta-feira, 19 de setembro" */
export function diaPorExtenso(diaISO) {
  const d = new Date(`${diaISO}T12:00:00Z`);
  return `${DIAS_SEMANA[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}

/** "14:30" a partir de um instante ISO do Google. */
export function horaCurta(instante) {
  if (!instante) return '';
  return new Intl.DateTimeFormat('pt-PT', {
    timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(instante));
}

/** "19/09" */
export function dataCurta(diaISO) {
  const d = new Date(`${diaISO}T12:00:00Z`);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Quantos dias de calendário separam duas datas ISO (b - a). */
export function diferencaDias(aISO, bISO) {
  const a = Date.parse(`${aISO}T12:00:00Z`);
  const b = Date.parse(`${bISO}T12:00:00Z`);
  return Math.round((b - a) / 86400000);
}

/** Converte um instante do Google ("…T13:00:00+01:00") para a hora de relógio
 *  em Lisboa, sem fuso: "2026-09-21T13:00:00". */
export function paraRelogioLisboa(instante) {
  const { ano, mes, dia, hora, minuto, segundo } = partesLisboa(new Date(instante));
  return `${ano}-${mes}-${dia}T${hora}:${minuto}:${segundo}`;
}

/** Soma minutos a uma hora de relógio local, devolvendo o mesmo formato.
 *  Trabalha no relógio, não no instante: 23:30 + 60min dá 00:30 do dia seguinte. */
export function somarMinutosRelogio(local, minutos) {
  const completo = local.length === 16 ? `${local}:00` : local;
  const d = new Date(`${completo}Z`);
  d.setUTCMinutes(d.getUTCMinutes() + minutos);
  return d.toISOString().slice(0, 19);
}

/** Soma dias a uma hora de relógio local, mantendo a hora mesmo que haja
 *  mudança de hora pelo meio. */
export function somarDiasRelogio(local, dias) {
  const completo = local.length === 16 ? `${local}:00` : local;
  return somarDias(completo.slice(0, 10), dias) + completo.slice(10);
}
