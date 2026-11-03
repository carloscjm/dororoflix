/**
 * Detecção leve dos codecs de áudio de um arquivo Matroska (MKV/WebM), lendo só
 * o começo do arquivo: os CodecIDs das faixas ficam no elemento Tracks, perto do
 * início. Serve para avisar quando o áudio não toca na TV (ex.: DTS nas Samsung
 * recentes), já que o servidor não transcodifica.
 */

export const PROBE_BYTES = 2 * 1024 * 1024;

/** Codecs de áudio que as TVs Samsung recentes não decodificam (vídeo fica mudo). */
const UNSUPPORTED_AUDIO = new Set(['A_DTS', 'A_TRUEHD', 'A_MLP']);

export interface AudioProbe {
  /** CodecIDs Matroska das faixas de áudio, na ordem do arquivo (ex.: "A_AC3", "A_DTS"). */
  readonly audioCodecs: readonly string[];
  /** Há faixas de áudio e nenhuma é compatível com a TV. */
  readonly unsupported: boolean;
}

const CODEC_ID = /A_[A-Z0-9]+(?:\/[A-Z0-9]+)*/g;

/** Nome amigável para mensagens: "A_DTS" → "DTS", "A_EAC3" → "E-AC-3". */
export function audioCodecLabel(codecId: string): string {
  const names: Readonly<Record<string, string>> = {
    A_AC3: 'AC-3 (Dolby Digital)',
    A_EAC3: 'E-AC-3 (Dolby Digital Plus)',
    A_DTS: 'DTS',
    A_TRUEHD: 'Dolby TrueHD',
    A_MLP: 'Dolby TrueHD',
    A_AAC: 'AAC',
    A_OPUS: 'Opus',
    A_VORBIS: 'Vorbis',
    A_FLAC: 'FLAC',
    A_MPEG: 'MP3',
  };
  const base = codecId.split('/')[0] ?? codecId;
  return names[base] ?? names[codecId] ?? codecId.replace(/^A_/, '');
}

export function probeAudioCodecs(head: Buffer): AudioProbe {
  // Matroska começa com o cabeçalho EBML 1A 45 DF A3; outros contêineres não são analisados.
  if (head.length < 4 || head.readUInt32BE(0) !== 0x1a45dfa3) return { audioCodecs: [], unsupported: false };
  // Elemento CodecID: ID 0x86 + tamanho (vint de 1 byte, 0x80|n) + texto ASCII de n bytes.
  const audioCodecs: string[] = [];
  for (let index = head.indexOf(0x86); index !== -1 && index < head.length - 2; index = head.indexOf(0x86, index + 1)) {
    const sizeByte = head[index + 1] ?? 0;
    if (sizeByte < 0x83 || sizeByte > 0xa0) continue;
    const length = sizeByte & 0x7f;
    const value = head.toString('latin1', index + 2, index + 2 + length);
    const match = CODEC_ID.exec(value);
    CODEC_ID.lastIndex = 0;
    if (match && match.index === 0 && match[0].length === value.length) audioCodecs.push(value);
  }
  const bases = audioCodecs.map((codec) => codec.split('/')[0] ?? codec);
  return {
    audioCodecs,
    unsupported: bases.length > 0 && bases.every((codec) => UNSUPPORTED_AUDIO.has(codec)),
  };
}
