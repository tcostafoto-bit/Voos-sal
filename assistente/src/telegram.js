// Camada fina sobre a Bot API do Telegram.

const LIMITE_MENSAGEM = 3900; // o limite real é 4096; deixamos margem

function base(env) {
  return `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}`;
}

async function chamar(env, metodo, corpo) {
  const resposta = await fetch(`${base(env)}/${metodo}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const dados = await resposta.json();
  if (!dados.ok) {
    console.error(`Telegram ${metodo} falhou: ${JSON.stringify(dados).slice(0, 300)}`);
  }
  return dados;
}

/** Parte mensagens compridas em pedaços que o Telegram aceita. */
function partir(texto) {
  if (texto.length <= LIMITE_MENSAGEM) return [texto];
  const pedacos = [];
  let restante = texto;
  while (restante.length > LIMITE_MENSAGEM) {
    let corte = restante.lastIndexOf('\n', LIMITE_MENSAGEM);
    if (corte < LIMITE_MENSAGEM / 2) corte = LIMITE_MENSAGEM;
    pedacos.push(restante.slice(0, corte));
    restante = restante.slice(corte).replace(/^\n+/, '');
  }
  if (restante) pedacos.push(restante);
  return pedacos;
}

export async function enviar(env, chatId, texto, { botoes, silencioso = false } = {}) {
  const pedacos = partir(texto);
  let ultima = null;
  for (let i = 0; i < pedacos.length; i += 1) {
    const eUltimo = i === pedacos.length - 1;
    ultima = await chamar(env, 'sendMessage', {
      chat_id: chatId,
      text: pedacos[i],
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      disable_notification: silencioso,
      ...(eUltimo && botoes ? { reply_markup: { inline_keyboard: botoes } } : {}),
    });
  }
  return ultima;
}

export async function aEscrever(env, chatId) {
  return chamar(env, 'sendChatAction', { chat_id: chatId, action: 'typing' });
}

export async function responderBotao(env, callbackId, texto) {
  return chamar(env, 'answerCallbackQuery', {
    callback_query_id: callbackId,
    text: texto?.slice(0, 190),
  });
}

/** Substitui o texto de uma mensagem já enviada e tira-lhe os botões —
 *  é assim que uma pergunta respondida deixa de estar pendente no ecrã. */
export async function editarMensagem(env, chatId, messageId, texto) {
  return chamar(env, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: texto,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

export async function definirWebhook(env, url, segredo) {
  return chamar(env, 'setWebhook', {
    url,
    secret_token: segredo,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  });
}

export function escaparHtml(texto = '') {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
