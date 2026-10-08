// Auto-teste da lógica crítica. Rodar: npm run check
import assert from 'node:assert/strict';
import { parseClientData, normalizeCsvIfNeeded, detectInputType, mergeImport, asTypedList, removeListType, listStats } from '../utils/parser';
import { toWhatsappNumber, processSpinSyntax, extractPhone } from '../utils/helpers';
import { buildPixPayload, crc16, normalizePixKey } from '../utils/pix';
import { addMonthsClamped, dueStatus, monthsFromLabel, lastPaymentByName, isRecentlyPaid, forecastRevenue, riskByName, dailySummary, dailyMessage, DEFAULT_NOTIFY } from '../utils/billing';
import { DEFAULT_CONFIG } from '../constants';
import { parseTag, parseNotes } from '../utils/updates';
import * as syncApi from '../api/sync';
import * as dailyApi from '../api/daily';
import * as pushApi from '../api/push';

const parse = (raw: string) => {
  const t = normalizeCsvIfNeeded(raw);
  return parseClientData(t, detectInputType(t)).parsedEntries;
};

const IPTV = [
  'ID;Login;Senha;"ID revenda";"Criado em";Vencimento;Teste;Habilitado;Telas;Notas',
  '1;joao01;x;3550;"25/04/2020 12:24";"05/11/2026 23:59";0;1;1;"completo 21 99979 4635"',
  '2;teste01;x;3550;"25/04/2020 12:24";"05/11/2026 23:59";1;1;1;"conta teste"',
].join('\n');
const P2P = [
  'ID;Login;Senha;Nome;"ID revenda";"Criado em";Vencimento;"Tipo (0=teste)";Status;Notas',
  '9;maria01;x;maria01;3550;"15/08/2020 17:23";"04/11/2026 23:30";1;1;"\'+55 47 9149-5407"',
  '10;semdata;x;semdata;3550;"05/10/2026 14:22";;0;\'-1;',
].join('\n');

// Relatório do painel: colunas certas, tipo certo, testes e linhas sem vencimento fora
const both = parse(IPTV + '\n' + P2P);
assert.deepEqual(both.map(c => [c.name, c.type]), [['joao01', 'iptv'], ['maria01', 'p2p']]);
assert.equal(both[0].rawNotes, 'completo 21 99979 4635'); // flags não poluem as notas
assert.equal(both[0].dueDate.getDate(), 5);

// Cópia do Excel (tabulação) dá o mesmo resultado
const tsv = (csv: string) => csv.split('\n').map(l => l.split(';').map(c => c.replace(/^"|"$/g, '')).join('\t')).join('\n');
assert.deepEqual(parse(tsv(IPTV) + '\n' + tsv(P2P)).map(c => c.name), ['joao01', 'maria01']);

// Normalização idempotente e IDs estáveis; mesmo arquivo 2x não duplica
const once = normalizeCsvIfNeeded(IPTV);
assert.equal(normalizeCsvIfNeeded(once), once);
assert.equal(both[0].id, 'iptv:joao01');
assert.equal(parse(IPTV + '\n\n' + IPTV).length, 1);

// Linha em branco encerra a seção: formato antigo depois volta à heurística
const mixed = parse(once + '\n\n123 ana 01/01/2026 10:00 05/11/2026 23:59 21 99999 9999');
assert.equal(mixed.find(c => c.name === 'ana')?.type, 'p2p');

// WhatsApp sempre com DDI 55
assert.equal(toWhatsappNumber(extractPhone('completo 21 99979 4635').whatsapp), '5521999794635');
assert.equal(toWhatsappNumber('5547991495407'), '5547991495407');

// Regras de cobrança: renovação não estoura fim do mês; status por dias até o vencimento
const now = new Date(2026, 9, 7, 15);
assert.equal(addMonthsClamped(new Date(2026, 0, 31), 1).getDate(), 28);
assert.equal(addMonthsClamped(new Date(2026, 10, 15), 3).getFullYear(), 2027);
assert.equal(dueStatus(new Date(2026, 9, 6), now).level, 'overdue');
assert.equal(dueStatus(new Date(2026, 9, 7, 23), now).level, 'today');
assert.equal(dueStatus(new Date(2026, 9, 8), now).level, 'tomorrow');
assert.equal(dueStatus(new Date(2026, 9, 20), now).level, 'active');
assert.equal(monthsFromLabel('3 Meses (2 Telas)'), 3);
const pays = [{ id: '1', clientId: 'a', clientName: 'Ana', amount: 35, paidAt: 1, newDueDate: '' }, { id: '2', clientId: 'a', clientName: 'ana', amount: 70, paidAt: 2, newDueDate: '' }];
assert.equal(lastPaymentByName(pays).get('ana')?.amount, 70);
assert.ok(!isRecentlyPaid(pays[1]));

// Previsão: último pagamento do cliente, senão 1º plano; dependente não conta
const day = (n: number) => new Date(2026, 9, 7 + n, 12).toISOString();
const stored = (name: string, n: number) => ({ id: name, name, dueDate: day(n), rawNotes: '', originalLine: '', type: 'iptv' as const, savedAt: 0 });
const base = [stored('Ana', 2), stored('Bia', 5), stored('Caio', 20), stored('Dep', 3), stored('Velho', -3)];
const f7 = forecastRevenue(base, pays, DEFAULT_CONFIG, { Bia: ['Dep'] }, 0, 7, now);
assert.deepEqual(f7, { amount: 70 + 60, count: 2 }); // Ana pagou 70; Bia titular de 2 telas = 60
assert.equal(forecastRevenue(base, pays, DEFAULT_CONFIG, {}, 0, 30, now).count, 4);
assert.equal(forecastRevenue(base, pays, DEFAULT_CONFIG, {}, -30, 0, now).count, 1);

// Risco: 2 cobranças em dias diferentes sem pagamento depois; ou 2 pagamentos atrasados
const send = (name: string, ts: number) => ({ clientId: name, clientName: name, timestamp: ts, action: 'whatsapp' as const });
const D = 24 * 3600e3;
const risk = riskByName(
  [{ id: 'p', clientId: 'x', clientName: 'Leo', amount: 35, paidAt: 5 * D, newDueDate: '', prevDueDate: new Date(2 * D).toISOString() },
   { id: 'q', clientId: 'x', clientName: 'Leo', amount: 35, paidAt: 40 * D, newDueDate: '', prevDueDate: new Date(35 * D).toISOString() }],
  [send('Rui', 10 * D), send('Rui', 10 * D + 60e3), send('Rui', 12 * D), send('Ivo', 10 * D), send('Leo', 1 * D), send('Leo', 3 * D)],
);
assert.equal(risk.get('rui')?.unanswered, 2);
assert.ok(!risk.has('ivo'));
assert.equal(risk.get('leo')?.late, 2);
assert.equal(risk.get('leo')?.unanswered, 0); // cobranças antes do último pagamento não contam

// Resumo da manhã
assert.deepEqual(dailySummary([stored('a', 0), stored('b', 1), stored('c', -4), stored('d', -5), stored('e', -6)], now), { today: 1, tomorrow: 1, overdue: 2 });
const msg = dailyMessage({ today: 2, tomorrow: 1, overdue: 3, risk: 4 }, { ...DEFAULT_NOTIFY, includeOverdue: false, includeRisk: true });
assert.equal(msg.title, 'Bom dia! 2 cobrança(s) para hoje'); // sem vencidos no total
assert.equal(msg.body, '2 vencem hoje · 1 vencem amanhã · 4 em risco');

// Importar substitui o arquivo do mesmo tipo e mantém o outro
const iptvA = ['Clientes IPTV', '1 joao01 x'].join('\n');
const iptvB = ['Clientes IPTV', '2 maria02 y'].join('\n');
const p2p = ['Clientes P2P', '3 ze03 z'].join('\n');
const sep = '\n\n';
assert.equal(mergeImport(iptvA + sep + p2p, iptvB), p2p + sep + iptvB);
// Importar P2P não apaga IPTV (e o contrário), nem texto digitado à mão
assert.equal(mergeImport(iptvA, p2p), iptvA + sep + p2p);
assert.equal(mergeImport('anotado à mão' + sep + iptvA, iptvB), 'anotado à mão' + sep + iptvB);
assert.equal(mergeImport('', iptvA), iptvA);
// Arquivo fora do padrão do painel ganha o tipo do botão; relatório do painel mantém o próprio tipo
const oldFormat = '123 ana 01/01/2026 10:00 05/11/2026 23:59 21 99999 9999';
const asP2P = asTypedList(oldFormat, 'p2p');
assert.deepEqual([asP2P.type, asP2P.text.split('\n')[0]], ['p2p', 'Clientes P2P']);
assert.equal(parse(asP2P.text)[0].type, 'p2p');
assert.equal(parse(asTypedList(oldFormat, 'iptv').text)[0].type, 'iptv');
assert.equal(asTypedList(normalizeCsvIfNeeded(IPTV), 'p2p').type, 'iptv');
assert.equal(removeListType(iptvA + sep + p2p, 'iptv'), p2p);
assert.deepEqual(listStats(iptvA + sep + p2p + sep + 'solto'), { iptv: 1, p2p: 1, other: 1 });

// Atualizações: tag da Release -> versão/build; corpo -> lista de novidades
assert.deepEqual(parseTag('apk-v2.0.17'), { version: '2.0.17', build: 17 });
assert.equal(parseTag('v1.2'), null);
const releaseBody = ['## Novidades', '- Novo: ficha do cliente', '- Correção: tela branca', '', 'Instala por cima.'].join('\n');
assert.deepEqual(parseNotes(releaseBody), ['Novo: ficha do cliente', 'Correção: tela branca']);

// Spin só sorteia blocos com "|"
assert.equal(processSpinSyntax('{pix} {plano1}'), '{pix} {plano1}');
assert.ok(['Oi', 'Olá'].includes(processSpinSyntax('{Oi|Olá}')));

// PIX copia e cola: CRC do exemplo do manual do BR Code (Banco Central)
const BCB_EXAMPLE = '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304';
assert.equal(crc16(BCB_EXAMPLE), '1D3D');

const brcode = buildPixPayload({ key: 'Tec.BR@hotmail.com', name: 'João da Silva', city: 'São Paulo', amount: 35, txid: 'joao01' });
assert.ok(brcode.includes('0118tec.br@hotmail.com'));     // chave normalizada (e-mail minúsculo)
assert.ok(brcode.includes('540535.00'));                  // valor com 2 casas
assert.ok(brcode.includes('5913JOAO DA SILVA6009SAO PAULO')); // sem acento, maiúsculo
assert.ok(brcode.includes('62100506joao01'));             // txid = login do cliente
assert.equal(brcode.slice(-4), crc16(brcode.slice(0, -4))); // CRC confere
assert.equal(normalizePixKey('(21) 99979-4635'), '+5521999794635');
assert.equal(normalizePixKey('123.456.789-09'), '12345678909');
assert.equal(normalizePixKey('+55 21 99979-4635'), '+5521999794635');

// /api/sync com Redis falso em memória (REST do Upstash: POST com o comando em JSON)
const db = new Map<string, string>();
process.env.KV_REST_API_URL = 'http://redis.test';
process.env.KV_REST_API_TOKEN = 't';
process.env.SYNC_PASSWORD = 'segredo';
globalThis.fetch = (async (_url: string, init: RequestInit) => {
  const [cmd, key, val] = JSON.parse(String(init.body)) as string[];
  let result: unknown = 'OK';
  if (cmd === 'GET') result = db.get(key) ?? null;
  else if (cmd === 'SET') db.set(key, val);
  else if (cmd === 'INCR') { result = Number(db.get(key) || 0) + 1; db.set(key, String(result)); }
  else if (cmd === 'HVALS') result = [];
  return new Response(JSON.stringify({ result }));
}) as typeof fetch;

const req = (method: string, pass: string, body?: unknown, ip = '1.1.1.1') =>
  new Request('http://x/api/sync', {
    method, body: body && JSON.stringify(body),
    headers: { authorization: `Bearer ${pass}`, 'x-forwarded-for': ip },
  });

(async () => {
  assert.equal((await syncApi.GET(req('GET', 'segredo'))).status, 404);
  assert.equal((await syncApi.GET(req('GET', 'errada'))).status, 401);
  const put = await syncApi.PUT(req('PUT', 'segredo', { data: { customNotes: '{}', hacker: 'x' }, baseUpdatedAt: 0 }));
  assert.equal(put.status, 200);
  const { updatedAt } = await put.json();
  const got = await (await syncApi.GET(req('GET', 'segredo'))).json();
  assert.deepEqual(got.data, { customNotes: '{}' }); // chave desconhecida descartada
  // base antiga = outro aparelho salvou depois -> 409 com o estado atual
  assert.equal((await syncApi.PUT(req('PUT', 'segredo', { data: {}, baseUpdatedAt: updatedAt - 1 }))).status, 409);
  assert.equal((await syncApi.PUT(req('PUT', 'segredo', { data: { customNotes: 1 } }))).status, 400);
  // 10 senhas erradas bloqueiam o IP, mesmo depois com a senha certa — e forjar o
  // início do X-Forwarded-For não escapa (vale o item que o proxy anexou, à direita)
  for (let i = 0; i < 10; i++) await syncApi.GET(req('GET', 'x', undefined, `6.6.6.${i}, 9.9.9.9`));
  assert.equal((await syncApi.GET(req('GET', 'segredo', undefined, '7.7.7.7, 9.9.9.9'))).status, 429);
  assert.equal((await syncApi.GET(req('GET', 'segredo', undefined, '1.1.1.1'))).status, 200);
  // Resumo diário: só a Vercel Cron (CRON_SECRET) chama; sem aparelhos inscritos envia 0
  process.env.CRON_SECRET = 'cron';
  assert.equal((await dailyApi.GET(new Request('http://x/api/daily'))).status, 401);
  const daily = await (await dailyApi.GET(new Request('http://x/api/daily?force=1', { headers: { authorization: 'Bearer cron' } }))).json();
  assert.deepEqual(daily.daily, { today: 0, tomorrow: 0, overdue: 0, sent: 0 });
  assert.equal(daily.reminders, 0);
  // App Android (https://localhost) pode chamar a API: pré-verificação CORS e cabeçalho nas respostas
  const pre = syncApi.OPTIONS();
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), 'https://localhost');
  assert.match(pre.headers.get('access-control-allow-headers') || '', /authorization/);
  assert.equal((await syncApi.GET(req('GET', 'segredo'))).headers.get('access-control-allow-origin'), 'https://localhost');
  // Push sem chaves VAPID: responde claramente em vez de quebrar
  assert.equal((await pushApi.GET()).status, 503);
  console.log('selfcheck ok');
})();
