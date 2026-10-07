// PIX "copia e cola" (BR Code estático, padrão EMV QRCPS-MPM do Banco Central).
// Gera o texto que o cliente cola no app do banco, já com chave, nome, cidade e valor.

// Campo EMV: ID (2) + tamanho (2) + valor
const field = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;

// CRC16-CCITT (polinômio 0x1021, inicial 0xFFFF), exigido no campo 63
export const crc16 = (payload: string): string => {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
};

// Nome/cidade: só ASCII, sem acento, maiúsculo, cortado no limite do padrão
const ascii = (s: string, max: number) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\x20-\x7E]/g, '').trim().toUpperCase().slice(0, max);

/**
 * Normaliza a chave como o PIX espera:
 * - telefone vira +55DDDNÚMERO (aceita "+55 21 99999-9999", "(21) 99999-9999"...)
 * - CPF/CNPJ só dígitos; e-mail minúsculo; chave aleatória (EVP) como está
 */
export const normalizePixKey = (raw: string): string => {
  const key = raw.trim();
  if (key.includes('@')) return key.toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return key.toLowerCase();
  const digits = key.replace(/\D/g, '');
  if (key.startsWith('+')) return `+${digits}`;
  // ponytail: 11 dígitos puros são ambíguos (CPF x celular) e ficam como CPF.
  // Formatado como telefone ("(21) 99999-9999", "21 99999-9999", sem pontos de CPF) vira celular.
  if (/[\s()-]/.test(key) && !key.includes('.') && (digits.length === 10 || digits.length === 11)) return `+55${digits}`;
  return digits.length === 11 || digits.length === 14 ? digits : key;
};

export interface PixPayloadInput {
  key: string;
  name: string;
  city: string;
  amount?: number; // em reais; omitido = cliente digita o valor
  txid?: string;
}

export const buildPixPayload = ({ key, name, city, amount, txid = '***' }: PixPayloadInput): string => {
  const account = field('00', 'br.gov.bcb.pix') + field('01', normalizePixKey(key));
  const payload =
    field('00', '01') +
    field('26', account) +
    field('52', '0000') +
    field('53', '986') +
    (amount && amount > 0 ? field('54', amount.toFixed(2)) : '') +
    field('58', 'BR') +
    field('59', ascii(name, 25) || 'RECEBEDOR') +
    field('60', ascii(city, 15) || 'BRASIL') +
    field('62', field('05', txid.replace(/[^A-Za-z0-9*]/g, '').slice(0, 25) || '***')) +
    '6304';
  return payload + crc16(payload);
};
