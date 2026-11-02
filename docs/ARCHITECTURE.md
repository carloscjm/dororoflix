# Arquitetura

## Visão geral

```text
 PC Windows (192.168.15.165)                         Samsung Q60C (192.168.15.92, Tizen 9)
┌────────────────────────────────────┐   LAN HTTP    ┌──────────────────────────────────────┐
│ home-media-server (Fastify :8080)  │◄─────────────►│ MultiFlix (homeflix, .wgt)           │
│  • catálogo / séries / legendas    │  JSON, VTT,   │  • telas + FocusManager + Router     │
│  • streaming com HTTP Range        │  imagens,     │  • AVPlay (vídeo nativo)             │
│  • listas IPTV (M3U, cache)        │  Range        │  • histórico em localStorage         │
└──────────────┬─────────────────────┘               └───────────────┬──────────────────────┘
               │ leitura (somente)                                   │ streams IPTV direto
          E:\Filmes                                             Internet (HLS / MPEG-TS)
```

- O PC só serve arquivos e metadados. **Não há transcodificação**: a TV decodifica (MKV/MP4, H.264/HEVC, AAC/AC-3/E-AC-3).
- Canais IPTV **não** passam pelo PC: o servidor só lê a lista; a TV abre cada stream direto.
- O histórico ("continuar assistindo") vive na TV.

## Servidor (`home-media-server`)

### Fluxo do scan

```text
LocalFileSource.scan()            → arquivos (vídeo, legenda .srt/.vtt, imagem)
  └ buildLibrary(sourceId, files) → função pura (library-builder.ts)
       ├ classifyVideoPath()      → filme | episódio (série, temporada, episódio)
       ├ applyOverride()          → correções manuais (METADATA_OVERRIDES_FILE)
       ├ associateSubtitles()     → legendas por nome / subpasta Legenda / pasta de um vídeo só
       └ artwork                  → imagem com o nome do vídeo; ou qualquer imagem da pasta de um único filme / da série
CatalogService                    → mapas em memória (vídeos, séries); scan concorrente compartilhado
```

- `POST /api/library/scan` refaz tudo (e recarrega o IPTV) sem reiniciar.
- **IDs**: vídeo = `createVideoId("local", caminhoRelativo)`; série = `createStableId("series", nomeNormalizado)`; legenda e canal idem com namespaces próprios. Todos com 16 hex.

### Classificação de episódios (`media-classifier.ts`)

Conservadora: só vira episódio com temporada **e** episódio **e** nome de série.
- `S01E02`, `S1E2`, `S01.E02`, `1x02` no nome do arquivo; ou
- pasta de temporada imediata (`Temporada 1`, `Season 01`, `S01`, `1ª Temporada`, `Série - Temporada 2`, `Serie.S02.1080p`) + número no arquivo (`E02`, `Ep 2`, `Episódio 02`, `02 - Título`, `ep1`).
- Nome da série: pasta acima da temporada → prefixo do arquivo → pasta não genérica mais próxima (`Series`, `Filmes`, `Downloads`… são ignoradas).

### Streaming

`StreamingService.plan()` decide 200/206/416 com `Range`, `If-Range`, `ETag`; `openStream` usa `createReadStream` com `highWaterMark` de 256 KiB (memória estável em arquivos de vários GB).

### IPTV (`src/iptv`)

`parseM3u` lê `#EXTINF` (`tvg-logo`, `group-title`, `#EXTGRP`), ignora duplicados e não-http(s). `IptvService` carrega as fontes de `IPTV_SOURCE` (URL ou arquivo), respeita `IPTV_MAX_LIST_MB`, mantém cache de 30 min e a última lista válida em caso de falha. A API entrega **categorias** e **canais por categoria** para não sobrecarregar a TV.

## App (`homeflix`)

### Composição (`main.ts`)

Cria `SettingsRepository`/`ProgressRepository` (sobre `localStorage`), `MediaApi`, `FocusManager`, `OverlayManager`, `Router`, `CatalogStore` e escolhe o motor de vídeo: **AVPlay** se `webapis.avplay` existe, senão **HTML5** (navegador) — `?engine=html5` força HTML5.

### Telas e navegação

```text
HomeScreen (aba "Filmes e Séries")  ── MovieScreen ── PlayerScreen
   │                               └─ SeriesScreen ── PlayerScreen
   ├─ LiveHomeScreen (aba "Canais ao vivo") ── ChannelsScreen ── LivePlayerScreen
   └─ SettingsScreen
```

- `Router` é uma pilha: telas anteriores ficam ocultas (não destruídas), então Voltar é instantâneo; o foco é restaurado por `data-key`. Voltar na raiz abre "Sair do MultiFlix?".
- `OverlayManager`: diálogos e menus laterais viram camadas de foco; Voltar fecha a camada.

### Gerenciador de foco (`navigation/focus-manager.ts`)

Modelo declarativo (não depende de medidas de layout):

| Atributo | Uso |
|---|---|
| `data-focus-group="id"` | grupo de itens |
| `data-orientation` | `horizontal` (fileiras), `vertical` (listas), `grid` + `data-columns` |
| `data-focusable` | item focável (`data-disabled` ignora) |
| `data-key` | identidade estável para restaurar foco |
| `data-nav-up/down/left/right="id"` | vizinho explícito (`none` bloqueia) |
| `data-scroll-x/y="start|nearest"`, `data-scroll-pad`, `data-scroll-target` | rolagem do contêiner para manter o item visível |

Sem vizinho explícito, ▲/▼ seguem a ordem dos grupos no DOM. Cada grupo lembra o último item focado.

### Reprodução

- `VideoEngine` (`player/video-engine.ts`): interface comum; `AvplayEngine` e `Html5Engine`.
- `PlaybackService`: salva o progresso a cada 10 s tocando, ao pausar, buscar, sair, trocar de episódio, ir para segundo plano e no erro; nunca grava antes de a reprodução começar (um erro ao abrir não zera o histórico). Marca assistido ao atingir o limite (90% padrão).
- `PlayerScreen`: controles que somem, seek acumulado (um único `seekTo` após 600 ms), menu de legendas/episódios, próximo episódio com contagem de 15 s.
- `LivePlayerScreen`: canais ao vivo; CH+/CH− ou ▲/▼ trocam de canal; sem histórico.

### Legendas

Servidor converte para WebVTT UTF-8 → `SubtitleService` baixa e interpreta (`parseVtt`) → `SubtitleRenderer` desenha sobre o vídeo, atualizado a cada 250 ms e após cada busca (busca binária nas falas). Só `<i>`, `<b>`, `<u>` e quebras de linha são renderizados.

### Persistência

| Chave `localStorage` | Conteúdo |
|---|---|
| `homeflix.progress.v1:<videoId>` | posição, duração, `updatedAt`, `watched`, `watchedAt`, `revision`, metadados (série/temporada/episódio) |
| `homeflix.settings.v1` | `serverUrl`, `subtitleLanguage`, `watchedThreshold` |

Um registro por vídeo (gravações pequenas e independentes). `updatedAt` + `revision` permitem sincronização futura com o servidor (última escrita vence).

### Build para Tizen

Vite gera `dist/app.js` (IIFE), `style.css` e assets com nomes fixos; o plugin `homeflix-tizen-html` troca o `<script type="module">` por `<script defer>` e injeta `$WEBAPIS/webapis/webapis.js`. `scripts/prepare-tizen.mjs` copia `config.xml` (versão do `package.json`) e `icon.png`. O `tizen package` assina com o perfil de certificado Samsung.
