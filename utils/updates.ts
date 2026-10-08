// Atualizações do app Android: compara a versão instalada com a última Release do GitHub,
// baixa o APK novo dentro do app (com progresso) e abre o instalador do Android.
// As novidades vêm do texto da Release (gerado pelo workflow a partir dos commits).
import { App } from '@capacitor/app';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileOpener } from '@capacitor-community/file-opener';
import { isNative } from './native';

const LATEST_RELEASE = 'https://api.github.com/repos/mclsousa/new-cob2026/releases/latest';
const APK_ASSET = 'TVBR.Cob.apk';

export interface AppUpdate {
  version: string;   // "2.0.7"
  build: number;     // 7 (versionCode do Android)
  notes: string[];   // linhas "Novo: …", "Correção: …"
  date: string;      // ISO da publicação
  apkUrl: string;
  sizeMb: number;
}

export interface InstalledVersion { version: string; build: number }

export const installedVersion = async (): Promise<InstalledVersion | null> => {
  if (!isNative()) return null;
  const info = await App.getInfo();
  return { version: info.version, build: Number(info.build) || 0 };
};

// "apk-v2.0.7" -> versão "2.0.7", build 7 (o último número é o run_number = versionCode)
export const parseTag = (tag: string): { version: string; build: number } | null => {
  const m = tag.match(/^apk-v(\d+\.\d+\.(\d+))$/);
  return m ? { version: m[1], build: Number(m[2]) } : null;
};

// Linhas "- texto" do corpo da Release viram a lista de novidades
export const parseNotes = (body: string): string[] =>
  body.split('\n').map(l => l.trim()).filter(l => l.startsWith('- ')).map(l => l.slice(2).trim()).filter(Boolean);

interface GithubRelease {
  tag_name: string;
  body?: string;
  published_at: string;
  assets: { name: string; browser_download_url: string; size: number }[];
}

export const fetchLatest = async (): Promise<AppUpdate | null> => {
  const res = await fetch(LATEST_RELEASE, { headers: { accept: 'application/vnd.github+json' }, cache: 'no-store' });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const rel = (await res.json()) as GithubRelease;
  const tag = parseTag(rel.tag_name);
  const apk = rel.assets.find(a => a.name === APK_ASSET);
  if (!tag || !apk) return null;
  return {
    ...tag,
    notes: parseNotes(rel.body || ''),
    date: rel.published_at,
    apkUrl: apk.browser_download_url,
    sizeMb: Math.round((apk.size / 1024 / 1024) * 10) / 10,
  };
};

/** Nova versão disponível para este aparelho, ou null (no navegador sempre null: o site já é a última versão). */
export const checkForUpdate = async (): Promise<AppUpdate | null> => {
  const current = await installedVersion();
  if (!current) return null;
  const latest = await fetchLatest();
  return latest && latest.build > current.build ? latest : null;
};

/** Baixa o APK e abre o instalador do Android (na 1ª vez o Android pede para permitir instalar do TVBR.Cob). */
export const downloadAndInstall = async (update: AppUpdate, onProgress: (percent: number) => void): Promise<void> => {
  const path = `TVBR.Cob-${update.version}.apk`;
  const listener = await Filesystem.addListener('progress', p => {
    if (p.contentLength > 0) onProgress(Math.round((p.bytes / p.contentLength) * 100));
  });
  try {
    await Filesystem.downloadFile({ url: update.apkUrl, path, directory: Directory.Cache, progress: true });
  } finally {
    await listener.remove();
  }
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
  await FileOpener.open({ filePath: uri, contentType: 'application/vnd.android.package-archive' });
};
