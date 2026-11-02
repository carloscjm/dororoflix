# AGENTS.md — guia para agentes de IA (qualquer fornecedor)

Este arquivo é a **fonte única de instruções** para agentes de código (Claude, Codex, Copilot, Cursor, Gemini, etc.).
`CLAUDE.md`, `GEMINI.md` e `.github/copilot-instructions.md` só apontam para cá. Ao mudar regras, edite **apenas este arquivo**.

## 1. O que é o projeto

Streaming pessoal na rede local, em dois projetos Node independentes no mesmo repositório:

| Pasta | Papel | Stack |
|---|---|---|
| `home-media-server/` | Backend no PC Windows. Lê `E:\Filmes` (somente leitura) e expõe catálogo, séries, legendas, capas, streaming HTTP Range e canais IPTV. | Node ≥ 20.12, TypeScript estrito, Fastify 5, Zod, Vitest |
| `homeflix/` | App de TV Samsung Tizen (exibido como **MultiFlix**). Interface de 10 pés, controle remoto, player AVPlay. | TypeScript estrito, Vite 8 (bundle IIFE), sem framework de UI, Vitest + happy-dom |

Documentação detalhada: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/API.md`](docs/API.md), [`docs/OPERATIONS.md`](docs/OPERATIONS.md), [`docs/DECISIONS.md`](docs/DECISIONS.md).

## 2. Idioma

- **Toda comunicação com o usuário, UI, mensagens de erro, logs, comentários e documentação: português do Brasil.**
- Identificadores de código (variáveis, funções, tipos) em inglês, como já está.

## 3. Comandos

Na raiz (valida os dois projetos):

```bash
npm run install:all   # npm install nos dois projetos
npm run check         # typecheck + testes + build dos dois projetos
```

Por projeto:

| Projeto | Comando | O que faz |
|---|---|---|
| servidor | `npm run dev` | `tsx watch` (recarrega ao salvar) |
| servidor | `npm test` / `npm run check` | testes / typecheck + testes |
| servidor | `npm run build` / `npm start` | compila para `dist/` / roda compilado |
| app | `npm run dev` | Vite em `http://localhost:5173` (proxy `/api` → `localhost:8080`, controle simulado na tela) |
| app | `npm test` / `npm run check` | testes / typecheck + testes + build |
| app | `npm run package` | build + `.wgt` assinado (Tizen CLI, perfil `HomeFlix`) → `homeflix/release/HomeFlix.wgt` |
| app | `npm run install:tv -- -TvIp <IP>` | instala e abre na TV via `sdb` |

O servidor do usuário roda pelos atalhos em `home-media-server/`: `iniciar-servidor.bat`, `parar-servidor.bat`, `status-servidor.bat`.

## 4. Definição de pronto

Uma mudança só está pronta quando:

1. `npm run check` na raiz passa (typecheck estrito, todos os testes, build).
2. Há testes novos para comportamento novo ou corrigido (regras puras ficam em funções testáveis, sem DOM nem rede).
3. Contratos públicos da API só mudam de forma **aditiva** (campos novos; nunca remover/renomear campos existentes).
4. A documentação afetada (`docs/*`, READMEs, este arquivo) foi atualizada.
5. Para mudanças no app que afetam a TV: dizer explicitamente o que **não** foi validado no aparelho. Mocks e o navegador **não** validam o AVPlay.

## 5. Invariantes (não quebrar)

**Segurança e dados do usuário**
- O servidor é **somente leitura** sobre a mídia: nunca criar, alterar, mover ou excluir arquivos em `MEDIA_ROOT`.
- Todo acesso a arquivo passa por `LocalFileSource.resolveSafe` (path traversal, realpath, links ignorados). IDs nunca viram caminhos: legendas e capas são servidas só pelo ID que o scan associou.
- `LAN_ONLY=true` por padrão; não expor o servidor à internet. CORS liberado apenas para `null,file://` (app empacotado).
- Nunca registrar ou exibir credenciais de URLs IPTV (`describe()` mostra só o domínio).
- Nunca versionar: `.env`, `.env.local`, certificados (`*.p12`, pasta `SamsungCertificate`), `*.wgt`, vídeos, legendas, builds. Ver `.gitignore`.

**Estabilidade de IDs**
- ID de vídeo = `sha256("local:" + caminho relativo)` (16 hex, minúsculas no Windows). O histórico da TV depende disso. **Não mudar o algoritmo.**
- O ID do pacote Tizen (`HmFlxApp01.HomeFlix`) **não pode mudar**: mudaria o app instalado e apagaria o histórico salvo na TV.

**App de TV (Tizen)**
- O build precisa continuar **IIFE com `<script defer>`** (módulos ES são bloqueados em `file://`). Alvo `chrome85`.
- Durante a reprodução, `html`, `body`, `.stage` e `.screens` ficam transparentes (classe `is-playing` no `<html>`): o AVPlay desenha **atrás** da página. Senão: áudio sem imagem.
- O `<object type="application/avplayer">` fica com `opacity: 0` (no Tizen 9 ele desenha um ícone no centro).
- Legendas externas são renderizadas pelo app sobre o vídeo (o AVPlay não aceita URL HTTP de `.srt`). O servidor sempre entrega WebVTT UTF-8.
- Navegação 100% por controle remoto: todo elemento interativo precisa de `data-focusable` dentro de um `data-focus-group`. Ver seção de foco em `docs/ARCHITECTURE.md`.
- Layout fixo 1920×1080; animar só `transform`/`opacity`; sem `backdrop-filter`/blur.
- Os canais IPTV **não** podem ser carregados na tela inicial (listas podem ter dezenas de MB); só na aba "Canais ao vivo", por categoria.

**Conteúdo**
- Não inventar capas ou metadados: só imagens existentes nas pastas; senão placeholder.
- IPTV: o recurso é para listas legais (canais abertos ou serviços licenciados do usuário). Não implementar mecanismos para contornar DRM, proteção de provedores ou para obter conteúdo não autorizado.

## 6. Convenções de código

- TypeScript estrito (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`). Sem `any`.
- Servidor: imports com extensão `.js` (NodeNext). App: imports sem extensão (Bundler).
- Rotas Fastify com JSON Schema de resposta (o schema também serializa: campo fora do schema **some** da resposta).
- Erros de domínio via `AppError` com `code` estável (`src/errors/app-error.ts`); resposta `{ error: { code, message } }`.
- App: DOM direto com o helper `h()` (`src/utils/dom.ts`); textos sempre como texto, nunca `innerHTML` com dados externos.
- Comentários explicam o **porquê**, em português, densidade similar à do código existente.
- Dependências: evitar novas. Fixar versões exatas no app; preferir versões publicadas há pelo menos 2 semanas.

## 7. Mapa rápido do código

```text
home-media-server/src/
  app.ts                  composição (plugins, serviços, rotas)
  config/env.ts           variáveis de ambiente (Zod)
  library/                scan, classificação de séries, legendas, capas, IDs
    library-builder.ts    função pura: arquivos → vídeos + séries (legendas/capas associadas)
    media-classifier.ts   regras S01E01 / 1x01 / Temporada N
    subtitle-convert.ts   SRT/VTT → WebVTT UTF-8 (Windows-1252 incluso)
  iptv/                   parser M3U + serviço com cache
  routes/                 videos, series, iptv, library, health, web
  streaming/              HTTP Range
homeflix/src/
  main.ts                 composição, teclas, escolha do motor de vídeo
  navigation/             FocusManager, Router (pilha de telas), overlays/diálogos
  screens/                home, movie, series, player, live-home, channels, live-player, settings
  player/                 VideoEngine (AVPlay | HTML5) + PlaybackService (salva progresso)
  storage/                ProgressRepository, SettingsRepository (localStorage)
  subtitles/              parser VTT, renderer seguro, escolha de faixa
  models/library.ts       regras puras: seções da home, continuação de séries
```

## 8. Fluxos comuns

- **Novo endpoint:** rota em `src/routes/`, schema de resposta, registrar em `app.ts`, teste com `app.inject` (ver `test/series-api.test.ts`), documentar em `docs/API.md`.
- **Nova tela no app:** classe que implementa `Screen` (`navigation/router.ts`), grupos de foco declarados, abrir com `ctx.router.push`, tecla Voltar tratada pelo Router.
- **Nova regra de classificação de série:** `media-classifier.ts` + casos em `test/media-classifier.test.ts` (positivos **e** negativos; nunca classificar arquivos ambíguos).
- **Publicar na TV:** `npm run check` → `npm run package` → `npm run install:tv -- -TvIp 192.168.15.92`. Ver `docs/OPERATIONS.md`.

## 9. Git

- Branch `main`, remoto `origin` = `github.com/carloscjm/dororoflix`.
- Mensagens de commit em português, estilo `feat: …`, `fix: …`, `docs: …`.
- Só fazer commit/push quando o usuário pedir. Antes de `git add`, conferir `git status` para não incluir arquivos pessoais.
