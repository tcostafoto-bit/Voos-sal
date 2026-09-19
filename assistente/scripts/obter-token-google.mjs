#!/usr/bin/env node
// Obtém o refresh token do Google. Corre uma vez, no teu computador:
//
//   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/obter-token-google.mjs
//
// Abre o link que aparece, autoriza com a tua conta, e o token fica impresso
// no terminal. Guarda-o com `npx wrangler secret put GOOGLE_REFRESH_TOKEN`.

import http from 'node:http';
import { randomBytes } from 'node:crypto';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const PORTA = Number(process.env.PORTA ?? 8976);
const REDIRECT = `http://localhost:${PORTA}`;

const ESCOPOS = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Faltam GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET nas variáveis de ambiente.');
  process.exit(1);
}

const estado = randomBytes(16).toString('hex');
const autorizacao = new URL('https://accounts.google.com/o/oauth2/v2/auth');
autorizacao.search = new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT,
  response_type: 'code',
  scope: ESCOPOS.join(' '),
  access_type: 'offline',
  prompt: 'consent',
  state: estado,
}).toString();

console.log('\nAbre este link no browser e autoriza:\n');
console.log(autorizacao.toString());
console.log('\nÀ espera da resposta do Google…\n');

const servidor = http.createServer(async (pedido, resposta) => {
  const url = new URL(pedido.url, REDIRECT);
  if (url.pathname !== '/') {
    resposta.writeHead(404).end();
    return;
  }

  const responder = (texto) => {
    resposta.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    resposta.end(`<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;padding:40px">${texto}</body>`);
  };

  if (url.searchParams.get('state') !== estado) {
    responder('<h1>Estado inválido.</h1><p>Volta a correr o script.</p>');
    console.error('O parâmetro "state" não bateu certo — pedido ignorado.');
    return;
  }

  const erro = url.searchParams.get('error');
  if (erro) {
    responder(`<h1>Recusado</h1><p>${erro}</p>`);
    console.error(`O Google recusou: ${erro}`);
    servidor.close();
    process.exit(1);
  }

  const codigo = url.searchParams.get('code');
  if (!codigo) {
    responder('<h1>Sem código.</h1>');
    return;
  }

  const troca = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: codigo,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT,
      grant_type: 'authorization_code',
    }),
  });

  const dados = await troca.json();
  if (!troca.ok || !dados.refresh_token) {
    responder('<h1>Não veio refresh token.</h1><p>Vê o terminal.</p>');
    console.error('Resposta do Google:', dados);
    console.error('\nSe não veio refresh_token, revoga o acesso em https://myaccount.google.com/permissions e repete.');
    servidor.close();
    process.exit(1);
  }

  responder('<h1>Pronto.</h1><p>Podes fechar esta janela — o token está no terminal.</p>');
  console.log('─'.repeat(64));
  console.log('GOOGLE_REFRESH_TOKEN:\n');
  console.log(dados.refresh_token);
  console.log('\n' + '─'.repeat(64));
  console.log('\nGuarda-o com:\n  npx wrangler secret put GOOGLE_REFRESH_TOKEN\n');
  servidor.close();
  process.exit(0);
});

servidor.listen(PORTA, '127.0.0.1');
