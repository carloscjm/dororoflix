import { describe, expect, it } from 'vitest';
import { audioCodecLabel, probeAudioCodecs } from '../src/library/media-probe.js';

const codec = (id: string): string => `${String.fromCharCode(0x80 | id.length)}${id}`;
const ebml = (...codecs: string[]): Buffer =>
  Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from(`lixo${codecs.map(codec).join('..')}A_7 binario`, 'latin1')]);

describe('probeAudioCodecs', () => {
  it('detecta áudio DTS como incompatível (dual áudio DTS + DTS)', () => {
    const probe = probeAudioCodecs(ebml('\x86\x8fV_MPEG4/ISO/AVC...\x86\x85A_DTS...\x86\x85A_DTS...S_HDMV/PGS'));
    expect(probe).toEqual({ audioCodecs: ['A_DTS', 'A_DTS'], unsupported: true });
  });

  it('aceita quando há ao menos uma faixa compatível', () => {
    expect(probeAudioCodecs(ebml('A_DTS', 'A_AC3')).unsupported).toBe(false);
    expect(probeAudioCodecs(ebml('A_EAC3')).unsupported).toBe(false);
  });

  it('ignora arquivos que não são Matroska e arquivos sem áudio', () => {
    expect(probeAudioCodecs(Buffer.from('....ftypisomA_DTS'))).toEqual({ audioCodecs: [], unsupported: false });
    expect(probeAudioCodecs(ebml('V_MPEG4/ISO/AVC'))).toEqual({ audioCodecs: [], unsupported: false });
  });

  it('gera nomes amigáveis', () => {
    expect(audioCodecLabel('A_DTS')).toBe('DTS');
    expect(audioCodecLabel('A_AAC/MPEG4/LC')).toBe('AAC');
    expect(audioCodecLabel('A_EAC3')).toBe('E-AC-3 (Dolby Digital Plus)');
  });
});
