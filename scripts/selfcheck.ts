// Auto-teste da lógica crítica. Rodar: npm run check
import assert from 'node:assert/strict';
import { parseClientData, normalizeCsvIfNeeded, detectInputType } from '../utils/parser';
import { toWhatsappNumber, applyAntiBan, processSpinSyntax, extractPhone } from '../utils/helpers';

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

console.log('selfcheck ok');
