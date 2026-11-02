# HomeFlix + Home Media Server

Streaming pessoal na rede local: um servidor no PC Windows disponibiliza os vídeos de `E:\Filmes`, e o app **HomeFlix** (Samsung Tizen) os exibe na TV com interface estilo Netflix.

| Pasta | O que é |
|---|---|
| [`home-media-server/`](home-media-server/README.md) | Backend Node.js + TypeScript + Fastify: catálogo, séries/episódios, legendas, capas e streaming com HTTP Range. Somente leitura. |
| [`homeflix/`](homeflix/README.md) | App Tizen (TypeScript + Vite, sem framework): catálogo, player AVPlay, legendas, "continuar assistindo", navegação pelo controle. |

## Uso rápido

1. Inicie o servidor: dois cliques em `home-media-server/iniciar-servidor.bat` (pare com `parar-servidor.bat`).
2. Teste no navegador do PC: `cd homeflix`, `npm run dev`, depois abra `http://localhost:5173`.
3. Para instalar na TV, siga [homeflix/README.md › Instalar na TV](homeflix/README.md#instalar-na-tv).

Cada pasta é um projeto Node independente (`npm install`, `npm test`, `npm run check`).

## O que nunca vai para o Git

Vídeos e legendas, `.env`/`.env.local`, certificados Samsung (`*.p12`), pacotes `.wgt` e builds. Veja `.gitignore`.
