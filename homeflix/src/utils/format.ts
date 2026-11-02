/** 1295.4 → "21:35"; 3723 → "1:02:03". */
export function formatTime(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor(safe / 60) % 60;
  const seconds = safe % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  return `${hours > 0 ? `${hours}:` : ''}${mm}:${String(seconds).padStart(2, '0')}`;
}

/** 1295 → "21min35s"; 3725 → "1h02min". Usado em textos como "Continuar de 21min35s". */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor(safe / 60) % 60;
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, '0')}min`;
  return `${minutes}min${String(safe % 60).padStart(2, '0')}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function episodeCode(season: number, episode: number): string {
  return `T${season}:E${episode}`;
}

/** Hash estável e barato (FNV-1a) para cores de placeholders. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Ano de lançamento quando aparece no nome do arquivo (ex.: "Filme 2004 1080p"). */
export function yearFromTitle(title: string): number | null {
  const match = /(?:^|\s)((?:19|20)\d{2})(?=\s|$)/.exec(title);
  return match?.[1] ? Number(match[1]) : null;
}

/** Remove ruído de release do título para exibição ("O Expresso Polar 2004 1080p BluRay" → "O Expresso Polar"). */
export function displayTitle(title: string): string {
  const noise =
    /(?:^|\s)(?:\(?(?:19|20)\d{2}\)?|\d{3,4}p|web|webrip|web-dl|bluray|brrip|bdrip|hdtv|dvdrip|x264|x265|h264|hevc|xvid|dual|dualaudio|dublado|legendado|amzn|nf|10bit)(?=\s|$)/i;
  const match = noise.exec(title);
  const cut = match && match.index > 0 ? title.slice(0, match.index) : title;
  return cut.replace(/[\s\-–([]+$/, '').trim() || title;
}
