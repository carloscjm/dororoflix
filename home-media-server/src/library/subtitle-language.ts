/**
 * Identifica idioma e marcações de uma legenda pelo trecho do nome que vem
 * depois do nome do vídeo. Ex.: "Filme.pt-BR.srt" → sufixo "pt-BR".
 */

export interface SubtitleLanguageInfo {
  readonly language: string | null;
  readonly label: string | null;
  readonly forced: boolean;
  readonly sdh: boolean;
}

interface LanguageEntry {
  readonly code: string;
  readonly label: string;
}

const PT_BR: LanguageEntry = { code: 'pt-BR', label: 'Português (Brasil)' };
const PT_PT: LanguageEntry = { code: 'pt-PT', label: 'Português (Portugal)' };
const PT: LanguageEntry = { code: 'pt', label: 'Português' };
const EN: LanguageEntry = { code: 'en', label: 'Inglês' };
const ES: LanguageEntry = { code: 'es', label: 'Espanhol' };

/** Pares de tokens consecutivos (ex.: "pt" + "br" em "Filme.pt_br.srt"). */
const PAIR_TOKENS: Readonly<Record<string, LanguageEntry>> = {
  'pt br': PT_BR,
  'pt pt': PT_PT,
  'en us': EN,
  'en gb': EN,
  'es es': ES,
  'es la': { code: 'es-419', label: 'Espanhol (América Latina)' },
  'es mx': { code: 'es-419', label: 'Espanhol (América Latina)' },
};

const SINGLE_TOKENS: Readonly<Record<string, LanguageEntry>> = {
  ptbr: PT_BR,
  'pt-br': PT_BR,
  pob: PT_BR,
  brazilian: PT_BR,
  brasil: PT_BR,
  'pt-pt': PT_PT,
  pt: PT,
  por: PT,
  portuguese: PT,
  portugues: PT,
  en: EN,
  eng: EN,
  english: EN,
  ingles: EN,
  'en-us': EN,
  'en-gb': EN,
  es: ES,
  spa: ES,
  spanish: ES,
  espanol: ES,
  espanhol: ES,
  'es-419': { code: 'es-419', label: 'Espanhol (América Latina)' },
  fr: { code: 'fr', label: 'Francês' },
  fre: { code: 'fr', label: 'Francês' },
  fra: { code: 'fr', label: 'Francês' },
  french: { code: 'fr', label: 'Francês' },
  it: { code: 'it', label: 'Italiano' },
  ita: { code: 'it', label: 'Italiano' },
  italian: { code: 'it', label: 'Italiano' },
  de: { code: 'de', label: 'Alemão' },
  ger: { code: 'de', label: 'Alemão' },
  deu: { code: 'de', label: 'Alemão' },
  german: { code: 'de', label: 'Alemão' },
  ja: { code: 'ja', label: 'Japonês' },
  jpn: { code: 'ja', label: 'Japonês' },
  japanese: { code: 'ja', label: 'Japonês' },
};

const FORCED_TOKENS = new Set(['forced', 'forcada', 'forcado', 'forcadas']);
const SDH_TOKENS = new Set(['sdh', 'cc', 'hi']);

export function parseSubtitleSuffix(suffix: string): SubtitleLanguageInfo {
  const tokens = suffix
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[\s._()[\]]+/)
    .filter((token) => token.length > 0);

  let entry: LanguageEntry | null = null;
  let forced = false;
  let sdh = false;

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index] ?? '';
    if (FORCED_TOKENS.has(token)) forced = true;
    else if (SDH_TOKENS.has(token)) sdh = true;
    else if (entry === null) {
      const next = tokens[index + 1];
      const pair = next === undefined ? undefined : PAIR_TOKENS[`${token} ${next}`];
      if (pair !== undefined) {
        entry = pair;
        index++;
      } else {
        entry = SINGLE_TOKENS[token] ?? SINGLE_TOKENS[token.replace(/_/g, '-')] ?? null;
      }
    }
  }

  return { language: entry?.code ?? null, label: entry?.label ?? null, forced, sdh };
}
