// Auto-teste da lógica crítica. Rodar: npm run check
import assert from 'node:assert/strict';
import { parseClientData, normalizeCsvIfNeeded, detectInputType } from '../utils/parser';
import { toWhatsappNumber, applyAntiBan, processSpinSyntax, extractPhone } from '../utils/helpers';
import { buildPixPayload, crc16, normalizePixKey } from '../utils/pix';
import * as syncApi from '../api/sync';

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

// Anti-ban não corrompe chave PIX nem links
const msg = 'Chave PIX: tec.br@hotmail.com https://wa.me/5521999794635';
for (let i = 0; i < 50; i++) {
  const out = applyAntiBan(msg);
  assert.ok(out.includes('tec.br@hotmail.com') && out.includes('https://wa.me/5521999794635'));
}

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

// Anti-ban não toca na linha do PIX copia e cola (qualquer byte a mais quebra o CRC)
for (let i = 0; i < 50; i++) assert.ok(applyAntiBan(`Pague com:\n${brcode}\nObrigado a todos`).includes(brcode));

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
  // 10 senhas erradas bloqueiam o IP, mesmo depois com a senha certa
  for (let i = 0; i < 10; i++) await syncApi.GET(req('GET', 'x', undefined, '9.9.9.9'));
  assert.equal((await syncApi.GET(req('GET', 'segredo', undefined, '9.9.9.9'))).status, 429);
  console.log('selfcheck ok');
})();
