// Regras e constantes do assistente.

/** Propriedades que o assistente guarda dentro do próprio evento do Google
 *  Calendar (extendedProperties.private). Vivem no calendário, não numa base de
 *  dados nossa — se o KV se perder, o estado sobrevive. */
export const PROP = {
  ESTADO: 'ass_estado',        // aberto | feito | falhado | adiado
  CONFIRMAR: 'ass_confirmar',  // sim | nao  (sobrepõe-se à heurística)
  PERGUNTADO: 'ass_perguntado',// "YYYY-MM-DD" da última pergunta
  INSISTENCIAS: 'ass_insistencias',
  ORIGEM: 'ass_origem',        // telegram | email | painel
};

/** Palavras que, num título, denunciam uma tarefa que precisa de confirmação
 *  em vez de um compromisso que simplesmente acontece. */
const VERBOS_TAREFA = [
  'confirmar', 'confirma', 'ligar', 'telefonar', 'marcar', 'remarcar', 'agendar',
  'enviar', 'mandar', 'responder', 'pagar', 'tratar', 'renovar', 'entregar',
  'comprar', 'reservar', 'inscrever', 'inscrição', 'avisar', 'levantar',
  'encomendar', 'verificar', 'perguntar', 'pedir', 'assinar', 'confirmação',
];

const SEM_ACENTOS = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Decide se um evento precisa de confirmação explícita ("isto aconteceu?")
 * ou se se pode assumir que aconteceu por a data ter passado.
 */
export function precisaConfirmacao(evento) {
  const marca = evento?.extendedProperties?.private?.[PROP.CONFIRMAR];
  if (marca === 'sim') return true;
  if (marca === 'nao') return false;

  const titulo = SEM_ACENTOS(evento?.summary ?? '');
  if (!titulo) return false;
  if (titulo.includes('?')) return true;
  if (VERBOS_TAREFA.some((v) => titulo.includes(SEM_ACENTOS(v)))) return true;

  // Convites de terceiros com resposta dada não precisam de confirmação.
  return false;
}

/** Estado atual do evento segundo o assistente. */
export function estadoDoEvento(evento) {
  return evento?.extendedProperties?.private?.[PROP.ESTADO] ?? 'aberto';
}

/** Instante de fim de um evento (all-day ou com hora), como Date. */
export function fimDoEvento(evento) {
  const fim = evento?.end?.dateTime ?? evento?.end?.date;
  return fim ? new Date(fim) : null;
}

export function inicioDoEvento(evento) {
  const ini = evento?.start?.dateTime ?? evento?.start?.date;
  return ini ? new Date(ini) : null;
}

export function ehDiaInteiro(evento) {
  return Boolean(evento?.start?.date);
}

// Limites operacionais — mantêm o custo e o ruído controlados.
export const LIMITES = {
  DIAS_PARA_TRAS: 21,        // até onde o varrimento procura eventos por fechar
  DIAS_PARA_A_FRENTE: 14,    // até onde olha para lembretes e agenda
  ANTECEDENCIA_LEMBRETE: 3,  // dias antes do prazo em que começa a lembrar
  MAX_INSISTENCIAS: 3,       // quantas vezes repete a mesma pergunta
  MAX_THREADS_EMAIL: 12,     // emails analisados por varrimento
  MAX_VOLTAS_FERRAMENTAS: 10,
  MAX_HISTORICO: 12,         // turnos de conversa guardados por chat
};

/** Calendários que o assistente nunca escreve (feriados, aniversários, etc.). */
export function calendarioEditavel(cal) {
  if (!cal) return false;
  if (cal.id?.includes('#holiday@')) return false;
  if (cal.id?.includes('#contacts@')) return false;
  return cal.accessRole === 'owner' || cal.accessRole === 'writer';
}
