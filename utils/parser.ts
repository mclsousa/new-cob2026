import { ParsedClient } from '../types';

const generateId = () => Math.random().toString(36).substring(2, 15);

// Regex to find a date: DD/MM/YYYY optionally followed by HH:mm(:ss)
const DATE_REGEX = /(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2})?)?)?/;

// Regex to capture Name from P2P/Standard lines (usually 2nd column)
// Matches: Start, non-spaces (ID), spaces, CAPTURE(Name), spaces...
const NAME_EXTRACTOR = /^\S+\s+(\S+)\s+/;

// Regex to capture Name from Split Header (ID User)
// Matches: Start, Digits, spaces, CAPTURE(User), optional spaces, End
const SPLIT_HEADER = /^(\d+)\s+(\S+)\s*$/;

interface ParseResult {
  parsedEntries: ParsedClient[];
  invalidLinesCount: number;
}

const parseDate = (dayStr: string, monthStr: string, yearStr: string, hourStr?: string, minStr?: string): Date | null => {
    const day = parseInt(dayStr, 10);
    const month = parseInt(monthStr, 10) - 1;
    const year = parseInt(yearStr, 10);
    const hours = hourStr ? parseInt(hourStr, 10) : 0;
    const minutes = minStr ? parseInt(minStr, 10) : 0;

    const date = new Date(year, month, day, hours, minutes);
    return isNaN(date.getTime()) ? null : date;
};

export const parseClientData = (text: string, forceP2PCheck: boolean = false): ParseResult => {
  const lines = text.split('\n');
  const entries: ParsedClient[] = [];
  let invalidLinesCount = 0;

  // State for split-line parsing
  let pendingPartial: { name: string; headerLine: string } | null = null;
  // Seção atual ("Clientes IPTV" / "Clientes P2P"); quando conhecida, define o tipo
  let section: 'iptv' | 'p2p' | null = null;

  lines.forEach((line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return;

    const sectionMatch = trimmedLine.match(/^Clientes (IPTV|P2P)/i);
    if (sectionMatch) {
        section = sectionMatch[1].toLowerCase() as 'iptv' | 'p2p';
        pendingPartial = null;
        return;
    }

    let matched = false;

    // 1. Extract all dates in the line
    // We use a global regex to find all occurrences of the date pattern
    const globalDateRegex = new RegExp(DATE_REGEX, 'g');
    const dateMatches = [...line.matchAll(globalDateRegex)];

    // 2. Logic for Split Line Continuation (Elite System)
    // Structure: [Indent/Pass] [Created Date] [Due Date] [Notes]
    if (pendingPartial) {
        // If we found at least one date, it's likely the continuation line
        // Elite system usually has Created AND Due in the continuation line.
        // If 2 dates: 2nd is Due. If 1 date: it's Due.
        if (dateMatches.length > 0) {
            const matchToUse = dateMatches.length >= 2 ? dateMatches[1] : dateMatches[0];
            
            // matchToUse indices: 0:Full, 1:DD, 2:MM, 3:YYYY, 4:HH, 5:mm
            const dueDate = parseDate(matchToUse[1], matchToUse[2], matchToUse[3], matchToUse[4], matchToUse[5]);
            
            if (dueDate) {
                // Notes are everything after the due date match
                const notesStartIndex = matchToUse.index! + matchToUse[0].length;
                const rawNotes = line.substring(notesStartIndex).trim();

                entries.push({
                    id: generateId(),
                    name: pendingPartial.name,
                    dueDate: dueDate,
                    rawNotes: rawNotes,
                    originalLine: pendingPartial.headerLine + '\n' + line,
                    type: section ?? 'iptv' // Assumed IPTV for split lines usually
                });
                matched = true;
                pendingPartial = null; // Clear pending
            }
        } else {
            // Line was not a valid continuation, discard partial
            pendingPartial = null; 
        }
    }

    // 3. Logic for Full Lines (P2P or Standard IPTV)
    // Structure: [ID] [Name] ... [Created Date] [Due Date] [Notes]
    if (!matched) {
        // We expect at least a Name and a Date.
        const nameMatch = line.match(NAME_EXTRACTOR);
        
        // P2P/Elite usually has TWO dates (Created, Due). 
        // We prioritize finding two dates to accurately identify "Due".
        if (nameMatch && dateMatches.length >= 2) {
            const name = nameMatch[1];
            // 2nd date is Due Date
            const matchToUse = dateMatches[1];
            const dueDate = parseDate(matchToUse[1], matchToUse[2], matchToUse[3], matchToUse[4], matchToUse[5]);

            if (dueDate) {
                const notesStartIndex = matchToUse.index! + matchToUse[0].length;
                const rawNotes = line.substring(notesStartIndex).trim();

                entries.push({
                    id: generateId(),
                    name: name,
                    dueDate: dueDate,
                    rawNotes: rawNotes,
                    originalLine: line,
                    type: section ?? 'p2p' // Heuristic
                });
                matched = true;
            }
        }
        // Fallback for lines with only ONE date (Standard IPTV sometimes)
        // Structure: ... [Due Date] [Notes]
        else if (nameMatch && dateMatches.length === 1) {
             const name = nameMatch[1];
             const matchToUse = dateMatches[0];
             const dueDate = parseDate(matchToUse[1], matchToUse[2], matchToUse[3], matchToUse[4], matchToUse[5]);

             if (dueDate) {
                const notesStartIndex = matchToUse.index! + matchToUse[0].length;
                const rawNotes = line.substring(notesStartIndex).trim();

                entries.push({
                    id: generateId(),
                    name: name,
                    dueDate: dueDate,
                    rawNotes: rawNotes,
                    originalLine: line,
                    type: section ?? 'iptv'
                });
                matched = true;
             }
        }
    }

    // 4. Logic for Start of Split Line
    // If we haven't matched a full entry, check if this is just "ID User"
    if (!matched && !pendingPartial) {
        const splitMatch = line.match(SPLIT_HEADER);
        if (splitMatch) {
            pendingPartial = { name: splitMatch[2], headerLine: line };
            matched = true;
        }
    }

    // 5. Error Counting
    if (!matched) {
         // Ignore headers
         const isHeader = /Clientes (IPTV|P2P)|Eu ia|Usuário|Senha|Criado|Vencimento/i.test(line);
         if (!isHeader && trimmedLine.length > 5) {
             // If we have a pending partial, maybe this line was meant for it but failed parsing
             if (pendingPartial) {
                 pendingPartial = null; // Reset if the next line wasn't valid
             }
             invalidLinesCount++;
         }
    }
  });

  return { parsedEntries: entries, invalidLinesCount };
};

export const detectInputType = (text: string): boolean => {
    // Heurística antiga: cabeçalho "Clientes P2P"
    if (text.includes('Clientes P2P')) return true;
    // Heurística nova: muitas linhas com 2+ datas (típico de export Elite P2P)
    const lines = text.split('\n').slice(0, 30); // amostra das primeiras linhas
    const dateRegex = /\d{2}\/\d{2}\/\d{4}/g;
    let multiDateLines = 0;
    let totalNonEmpty = 0;
    for (const line of lines) {
        if (!line.trim()) continue;
        totalNonEmpty++;
        const matches = line.match(dateRegex);
        if (matches && matches.length >= 2) multiDateLines++;
    }
    // Se >50% das linhas com conteúdo têm 2+ datas, provavelmente é P2P
    return totalNonEmpty > 0 && (multiDateLines / totalNonEmpty) > 0.5;
};

/**
 * Detecta se o conteúdo parece um CSV (vírgulas/ponto-e-vírgula como separador) e
 * retorna uma versão "achatada" para reaproveitar o parser de texto livre.
 * O AdminX em alguns casos exporta em CSV; em vez de tratar dois caminhos,
 * normalizamos antes de passar pro parseClientData.
 */
// Split de uma linha CSV respeitando aspas ("a;b" fica numa célula só, "" vira ")
const splitCsvLine = (line: string, sep: string): string[] => {
    const cells: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
            else inQuotes = !inQuotes;
        } else if (ch === sep && !inQuotes) {
            cells.push(cur.trim());
            cur = '';
        } else {
            cur += ch;
        }
    }
    cells.push(cur.trim());
    return cells;
};

const normHeader = (h: string) => h.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Relatório do painel (relatorio-iptv.csv / relatorio-p2p.csv):
 *   IPTV: ID;Login;Senha;ID revenda;Criado em;Vencimento;Teste;Habilitado;Telas;Notas
 *   P2P:  ID;Login;Senha;Nome;ID revenda;Criado em;Vencimento;Tipo (0=teste);Status;Notas
 * Lê pelas colunas do cabeçalho e emite "Clientes IPTV|P2P" + linhas limpas
 * "ID Login Criado Vencimento Notas", para que as flags não poluam as notas
 * (e o telefone extraído delas). Pula contas de teste e linhas sem vencimento.
 * Retorna null se o cabeçalho não for desse relatório.
 */
const convertPanelReport = (lines: string[], sep: string): string | null => {
    const header = splitCsvLine(lines[0], sep).map(normHeader);
    const col = (name: string) => header.findIndex(h => h.startsWith(name));
    const iLogin = col('login'), iCreated = col('criado'), iDue = col('vencimento'), iNotes = col('notas');
    if (iLogin < 0 || iDue < 0) return null;

    const iTipo = col('tipo');   // P2P: 0 = teste
    const iTeste = col('teste'); // IPTV: 1 = teste
    const isP2P = iTipo >= 0 || col('nome') >= 0;
    const out = [isP2P ? 'Clientes P2P' : 'Clientes IPTV'];

    for (const line of lines.slice(1)) {
        if (!line.trim()) continue;
        const c = splitCsvLine(line, sep).map(v => v.replace(/^'/, '')); // ' = escape do Excel
        if (!c[iDue] || !c[iLogin]) continue;
        if (iTipo >= 0 && c[iTipo] === '0') continue;
        if (iTeste >= 0 && c[iTeste] === '1') continue;
        out.push([c[0], c[iLogin], iCreated >= 0 ? c[iCreated] : '', c[iDue], iNotes >= 0 ? c[iNotes] : '']
            .filter(Boolean).join(' '));
    }
    return out.join('\n');
};

export const normalizeCsvIfNeeded = (input: string): string => {
    const text = input.replace(/^﻿/, '').replace(/\r/g, '');
    const firstLine = text.split('\n').find(l => l.trim()) || '';
    const semicolons = (firstLine.match(/;/g) || []).length;
    const commas = (firstLine.match(/,/g) || []).length;
    const looksLikeCsv = semicolons >= 3 || commas >= 3;
    if (!looksLikeCsv) return text;

    const sep = semicolons >= commas ? ';' : ',';
    const lines = text.split('\n').filter(l => l.trim());
    const report = convertPanelReport(lines, sep);
    if (report !== null) return report;

    return text
        .split('\n')
        .map(line => line.split(sep).map(c => c.trim().replace(/^"|"$/g, '')).join(' '))
        .join('\n');
};