// Copia config.xml (com a versão do package.json) e o ícone para dist/, que vira o .wgt.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = `${root}dist/`;
const { version } = JSON.parse(readFileSync(`${root}package.json`, 'utf8'));

if (!existsSync(`${root}tizen/icon.png`)) {
  console.error('tizen/icon.png não encontrado (ícone MultiFlix do app).');
  process.exit(1);
}

const config = readFileSync(`${root}tizen/config.xml`, 'utf8').replace('__VERSION__', version);
writeFileSync(`${dist}config.xml`, config);
copyFileSync(`${root}tizen/icon.png`, `${dist}icon.png`);
console.log(`dist/ pronto para empacotar (HomeFlix ${version}).`);
