import { createStableId } from '../library/video-id.js';

/** Canal de uma lista IPTV (M3U). O stream é tocado direto pela TV, sem passar pelo servidor. */
export interface Channel {
  readonly id: string;
  readonly name: string;
  readonly group: string;
  readonly logo: string | null;
  readonly url: string;
}

const ATTRIBUTE = /([\w-]+)="([^"]*)"/g;
const DEFAULT_GROUP = 'Outros';

/**
 * Lê listas M3U/M3U8 estendidas:
 *   #EXTINF:-1 tvg-id="x" tvg-logo="http://…/logo.png" group-title="Notícias",Nome do Canal
 *   http://servidor/stream.m3u8
 * Aceita também #EXTGRP. Entradas sem URL http(s) são ignoradas.
 */
export function parseM3u(text: string): Channel[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const channels: Channel[] = [];
  const seen = new Set<string>();
  let pending: { name: string; group: string | null; logo: string | null } | null = null;
  let extGroup: string | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') continue;

    if (line.startsWith('#EXTINF')) {
      const comma = findNameSeparator(line);
      const header = comma === -1 ? line : line.slice(0, comma);
      const name = comma === -1 ? '' : line.slice(comma + 1).trim();
      const attributes = new Map<string, string>();
      for (const match of header.matchAll(ATTRIBUTE)) attributes.set((match[1] ?? '').toLowerCase(), match[2] ?? '');
      pending = {
        name: name || attributes.get('tvg-name') || 'Canal sem nome',
        group: attributes.get('group-title')?.trim() || null,
        logo: attributes.get('tvg-logo')?.trim() || null,
      };
      continue;
    }
    if (line.startsWith('#EXTGRP:')) {
      extGroup = line.slice(8).trim() || null;
      continue;
    }
    if (line.startsWith('#')) continue;

    if (pending && /^https?:\/\//i.test(line) && !seen.has(line)) {
      seen.add(line);
      channels.push({
        id: createStableId('channel', line),
        name: pending.name,
        group: pending.group ?? extGroup ?? DEFAULT_GROUP,
        logo: pending.logo && /^https?:\/\//i.test(pending.logo) ? pending.logo : null,
        url: line,
      });
    }
    pending = null;
    extGroup = null;
  }
  return channels;
}

/** A vírgula que separa o nome fica fora das aspas dos atributos. */
function findNameSeparator(line: string): number {
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) return index;
  }
  return -1;
}
