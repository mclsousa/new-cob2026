
// Pad a number with leading zero
export const padZero = (num: number): string => String(num).padStart(2, '0');

// Format date as DD/MM/YYYY
export const formatDate = (date: Date): string => {
  if (isNaN(date.getTime())) return 'Data Inválida';
  return `${padZero(date.getDate())}/${padZero(date.getMonth() + 1)}/${date.getFullYear()}`;
};

// Format date for display in cards (short)
export const formatDateShort = (date: Date): string => {
  if (isNaN(date.getTime())) return 'Data Inválida';
  return `${padZero(date.getDate())}/${padZero(date.getMonth() + 1)}`;
};

// Format date with time (Configurable)
export const formatDateWithTime = (date: Date, timeString: string = '20:00'): string => {
  if (isNaN(date.getTime())) return 'Data Inválida';
  // Format the time string to ensure it looks good (e.g., 20:00 -> 20h)
  const formattedTime = timeString.replace(':', 'h');
  return `${formatDate(date)} às ${formattedTime}`;
};

// Format date object to YYYY-MM-DD input string
export const toInputDate = (date: Date): string => {
    const yyyy = date.getFullYear();
    const mm = padZero(date.getMonth() + 1);
    const dd = padZero(date.getDate());
    return `${yyyy}-${mm}-${dd}`;
};

// Format currency
export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

// Process Spin Syntax {a|b|c}
// Só blocos com "|" são sorteados: {nome}, {pix} etc. que sobrarem ficam intactos.
export const processSpinSyntax = (text: string): string => {
  return text.replace(/\{([^{}]*\|[^{}]*)\}/g, (_match, content: string) => {
    const choices = content.split('|');
    return choices[Math.floor(Math.random() * choices.length)];
  });
};

import { isSyncKey } from './syncKeys';
import { markDirty } from './sync';

// Re-export para acesso unificado a partir de helpers
export { validatePhone } from './phone';
import { validatePhone } from './phone';

// Versão validada: além de extrair, marca se o número parece válido
export const extractPhoneValidated = (text: string) => {
  const base = extractPhone(text);
  if (!base.whatsapp) {
    return { ...base, isValid: false, invalidReason: 'sem número', normalized: '' };
  }
  const v = validatePhone(base.whatsapp);
  return {
    ...base,
    isValid: v.valid,
    invalidReason: v.reason,
    normalized: v.normalized || base.whatsapp
  };
};

// Número pronto para wa.me: com DDI 55 quando é um número BR válido.
// Sem o 55, "21 99999 9999" vira wa.me/21999999999 e o WhatsApp não acha o contato.
export const toWhatsappNumber = (digits: string): string => {
  if (!digits) return '';
  const v = validatePhone(digits);
  return v.valid && v.normalized ? v.normalized : digits;
};

// Extract phone number from notes
export const extractPhone = (text: string) => {
  if (!text) return { cleanText: '', whatsapp: '', original: '' };

  // Improved Regex:
  // Supports (11) 9999-9999, 11 9999-9999, +55 11 ..., 5511...
  // Avoids matching dates (DD/MM/YYYY) by excluding '/' from main charset
  const phoneRegex = /(?:(?:\+|00)\d[\d\s().-]{5,}\d|[\d(][\d\s().-]{7,}\d)/i;
  
  const match = text.match(phoneRegex);

  let original = '';
  let whatsapp = '';
  let cleanText = text;

  if (match && match[0]) {
    original = match[0].trim();
    let tempNum = original;

    // Clean for WhatsApp link
    if (tempNum.startsWith('+')) {
      whatsapp = tempNum.substring(1).replace(/\D/g, '');
    } else if (tempNum.startsWith('00')) {
      whatsapp = tempNum.substring(2).replace(/\D/g, '');
    } else {
      whatsapp = tempNum.replace(/\D/g, '');
    }

    // Escape special characters for regex replacement to remove it from text
    const escapedOriginal = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleanText = text.replace(new RegExp(escapedOriginal), '').replace(/^[\s,;-]+|[\s,;-]+$/g, '').trim();
  }

  return { cleanText, whatsapp, original };
};

// Extract Credentials (User/Pass) from notes
export const extractCredentials = (text: string) => {
    if (!text) return { login: null, pass: null };
    
    // Regex looking for User: X | Pass: Y patterns
    // Captures content after User/Login/ID until next pipe or newline
    const loginMatch = text.match(/(?:User|Login|Usuario|ID)\s*[:=]\s*([^|\n]+)/i);
    const passMatch = text.match(/(?:Senha|Password|Pass)\s*[:=]\s*([^|\n]+)/i);

    return {
        login: loginMatch ? loginMatch[1].trim() : null,
        pass: passMatch ? passMatch[1].trim() : null
    };
};

// Generate CSV content
export const generateCSV = (data: Array<{ name: string; date: Date; notes: string; customNotes: string; phone: string }>, defaultTime: string) => {
  let csvContent = 'Nome,Data de Vencimento,Observações Originais,Telefone,Observação Adicional\n';
  
  data.forEach(row => {
    const escapeCSV = (text: string) => text ? `"${String(text).replace(/"/g, '""')}"` : '""';
    const dateStr = formatDateWithTime(row.date, defaultTime);
    csvContent += `${escapeCSV(row.name)},${escapeCSV(dateStr)},${escapeCSV(row.notes)},${escapeCSV(row.phone)},${escapeCSV(row.customNotes)}\n`;
  });

  return csvContent;
};

// Dispara o download de um Blob. O revoke precisa ser adiado: revogar logo após
// o click() cancela o download no Chrome/Edge antes de ele começar.
export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

// localStorage tolerante a falhas: JSON corrompido ou cota cheia não derrubam o app
export const loadJSON = <T,>(key: string, fallback: T): T => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as T) : fallback;
  } catch {
    return fallback;
  }
};

export const saveItem = (key: string, value: string): boolean => {
  try {
    // Os efeitos do React regravam tudo ao abrir o app: só conta como alteração
    // (e dispara a sincronização) quando o valor muda de fato.
    if (localStorage.getItem(key) === value) return true;
    localStorage.setItem(key, value);
    if (isSyncKey(key)) markDirty();
    return true;
  } catch {
    return false;
  }
};
