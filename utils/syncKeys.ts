// Chaves do localStorage que formam os dados do app.
// Usada pelo backup (JSON), pela sincronização na nuvem e pelo servidor (/api/sync).
export const SYNC_KEYS = [
  'cobrancaConfig',
  'customNotes',
  'customMessages',
  'phoneOverrides',
  'pixOverrides',
  'clientTags',
  'clientLinks',
  'clientDatabase',
  'reminders',
  'sentClientsHistory',
  'actionHistory',
  'lastInputData',
  'themeElite',
  'unifiedStart',
  'unifiedEnd',
] as const;

export type SyncKey = (typeof SYNC_KEYS)[number];
export type SyncData = Partial<Record<SyncKey, string | null>>;

export const isSyncKey = (key: string): key is SyncKey => (SYNC_KEYS as readonly string[]).includes(key);
