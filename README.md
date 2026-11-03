# GatoFlix (HomeFlix) + Home Media Server

Streaming pessoal na rede local: um servidor no PC Windows disponibiliza os vídeos de `E:\Filmes`, e o app **GatoFlix** para Samsung Smart TV (Tizen) os exibe com interface estilo Netflix: filmes, séries, legendas, "continuar assistindo" e canais ao vivo (IPTV).

| Pasta | O que é |
|---|---|
| [`home-media-server/`](home-media-server/README.md) | Backend Node.js + TypeScript + Fastify: catálogo, séries/episódios, legendas, capas, streaming com HTTP Range e listas IPTV. Somente leitura. |
| [`homeflix/`](homeflix/README.md) | App Tizen (TypeScript + Vite, sem framework): catálogo, player AVPlay, legendas, histórico, TV ao vivo, navegação pelo controle. |

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Como as peças se encaixam: scan, classificação, streaming, telas, foco, player, persistência, build Tizen |
| [`docs/API.md`](docs/API.md) | Referência completa dos endpoints e códigos de erro |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | Rodar o servidor, variáveis de ambiente, organizar a mídia, publicar e depurar na TV, solução de problemas |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Decisões de arquitetura e seus motivos |
| [`AGENTS.md`](AGENTS.md) | Instruções para agentes de IA (comandos, invariantes, definição de pronto) |

## Uso rápido

1. Servidor: dois cliques em `home-media-server/iniciar-servidor.bat` (parar: `parar-servidor.bat`; situação: `status-servidor.bat`).
2. Testar no PC: `npm --prefix homeflix run dev` e abrir `http://localhost:5173`.
3. Na TV: abrir **GatoFlix** em Apps. Para publicar uma nova versão, veja [`docs/OPERATIONS.md`](docs/OPERATIONS.md#publicar-uma-nova-versão).

## Desenvolvimento

```bash
npm run install:all   # dependências dos dois projetos
npm run check         # typecheck + testes + build dos dois projetos
```

## Manutenção com agentes de IA

O repositório segue o padrão aberto **AGENTS.md**. Ferramentas como Codex, Cursor, GitHub Copilot, Gemini e Claude leem as mesmas instruções: `CLAUDE.md`, `GEMINI.md`, `.cursorrules` e `.github/copilot-instructions.md` apenas apontam para `AGENTS.md`.

## O que nunca vai para o Git

Vídeos e legendas, `.env`/`.env.local`, certificados Samsung (`*.p12`), pacotes `.wgt`, builds e atalhos pessoais. Veja `.gitignore`.
