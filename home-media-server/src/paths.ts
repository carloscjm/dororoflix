import { fileURLToPath } from 'node:url';

/**
 * Pasta "public" na raiz do projeto. Funciona tanto rodando de `src/` (tsx)
 * quanto de `dist/` (build), pois ambos ficam um nível abaixo da raiz.
 */
export const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
