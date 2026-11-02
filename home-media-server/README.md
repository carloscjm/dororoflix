# Home Media Server

Backend de uma plataforma pessoal de streaming (estilo Netflix) que disponibiliza, na rede local, os vídeos guardados em um PC Windows. Esta é a base que será consumida futuramente por um aplicativo Samsung Smart TV (Tizen).

- Lê recursivamente a pasta de vídeos (padrão `E:\Filmes`) e monta um catálogo com IDs estáveis.
- API REST em Fastify + TypeScript com tipagem estrita.
- Streaming com **HTTP Range Requests** (200 / 206 / 416), permitindo pausar, avançar e retroceder.
- **Somente leitura**: nenhum arquivo original é criado, alterado, movido ou excluído.
- Proteção contra path traversal, restrição à rede local e CORS configurável.
- Página HTML de teste para navegar no catálogo e reproduzir no navegador.
- **Séries e episódios** identificados por pastas e nomes (`S01E01`, `1x01`, `Temporada 1`…), com correções manuais opcionais.
- **Legendas externas** (`.srt`/`.vtt`) associadas aos vídeos e entregues sempre em WebVTT UTF-8.
- **Capas** já existentes nas pastas (`Filme.jpg`, `poster.jpg`…), sem inventar imagens.
- Consumido pelo app **HomeFlix** para Samsung Tizen (pasta `../homeflix`).
- Sem transcodificação nesta versão (veja [Limitações de codecs e contêineres](#limitações-de-codecs-e-contêineres)).

---

## Sumário

1. [Requisitos](#requisitos)
2. [Instalação](#instalação)
3. [Configuração](#configuração)
4. [Scripts](#scripts)
5. [API](#api)
6. [Página de teste](#página-de-teste)
7. [Como funciona o Range](#como-funciona-o-range)
8. [Rede local e segurança](#rede-local-e-segurança)
9. [Limitações de codecs e contêineres](#limitações-de-codecs-e-contêineres)
10. [Arquitetura](#arquitetura)
11. [Testes](#testes)
12. [Git e GitHub](#git-e-github)
13. [Solução de problemas](#solução-de-problemas)
14. [Roadmap](#roadmap)

---

## Requisitos

- Windows 10 ou 11
- [Node.js](https://nodejs.org/) **20.12 ou superior** (recomendado: a versão LTS atual)
- npm (vem com o Node.js)
- Git (opcional, para versionamento)

Confira as versões no PowerShell:

```powershell
node --version
npm --version
```

## Instalação

```powershell
# 1. Entre na pasta do projeto (ajuste o caminho)
cd C:\Projetos\home-media-server

# 2. Instale as dependências
npm install

# 3. Crie o arquivo de configuração a partir do exemplo
copy .env.example .env

# 4. (Opcional) edite o .env — por exemplo, MEDIA_ROOT e PORT
notepad .env

# 5. Rode em modo desenvolvimento (recarrega ao salvar arquivos .ts)
npm run dev
```

Ao iniciar, o log mostra os endereços de acesso, por exemplo:

```
INFO: Catálogo atualizado {"total":142,"durationMs":85}
INFO: Servidor de mídia disponível {"urls":["http://localhost:8080","http://192.168.0.15:8080"]}
```

Abra `http://localhost:8080` no navegador do PC, ou `http://192.168.0.15:8080` em outro dispositivo da mesma rede.

### Produção (uso diário)

```powershell
npm run build
npm start
```

Para produção, use `LOG_PRETTY=false` (logs em JSON) e, se quiser menos ruído, `LOG_LEVEL=warn` — cada busca no player gera uma requisição Range, e todas são registradas no nível `info`.

## Configuração

Todas as opções vêm de variáveis de ambiente, lidas do arquivo `.env` na raiz do projeto. Valores vazios usam o padrão.

| Variável       | Padrão        | Descrição |
|----------------|---------------|-----------|
| `MEDIA_ROOT`   | `E:\Filmes`   | Pasta raiz dos vídeos, lida recursivamente. Escreva sem aspas. |
| `HOST`         | `0.0.0.0`     | Interface de rede. `0.0.0.0` aceita conexões da rede local; `127.0.0.1` restringe a este PC. |
| `PORT`         | `8080`        | Porta HTTP. |
| `LAN_ONLY`     | `true`        | Recusa (403) requisições vindas de IPs que não sejam de rede privada/local. |
| `CORS_ORIGINS` | *(vazio)*     | Origens liberadas para CORS, separadas por vírgula. Vazio = desativado; `*` = qualquer origem. |
| `LOG_LEVEL`    | `info`        | `fatal`, `error`, `warn`, `info`, `debug`, `trace` ou `silent`. |
| `LOG_PRETTY`   | `false`       | `true` = logs coloridos e legíveis (o `.env.example` já vem com `true` para desenvolvimento). |
| `NODE_ENV`     | `development` | `development`, `production` ou `test`. |

A configuração é validada na inicialização. Um valor inválido (ex.: `PORT=70000`) encerra o processo com uma mensagem explicando o problema. Se `MEDIA_ROOT` não existir — por exemplo, um HD externo desconectado — o servidor também não sobe e informa o motivo.

## Scripts

| Comando              | O que faz |
|----------------------|-----------|
| `npm run dev`        | Desenvolvimento com recarga automática (`tsx watch`). |
| `npm run build`      | Compila TypeScript para `dist/`. |
| `npm start`          | Inicia a versão compilada (`node dist/server.js`). |
| `npm test`           | Executa os testes automatizados (Vitest). |
| `npm run test:watch` | Testes em modo observação. |
| `npm run typecheck`  | Checagem de tipos sem gerar arquivos. |
| `npm run check`      | Typecheck + testes (útil antes de cada commit). |

## API

Todas as respostas de erro seguem o formato:

```json
{ "error": { "code": "VIDEO_NOT_FOUND", "message": "Vídeo \"…\" não encontrado no catálogo." } }
```

### `GET /health`

Verifica o funcionamento do servidor.

```json
{ "status": "ok", "uptimeSeconds": 42, "catalog": { "total": 142, "scannedAt": "2026-11-02T18:02:33.335Z" } }
```

### `GET /api/videos`

Lista os vídeos do catálogo, ordenados por título.

```json
{
  "total": 1,
  "scannedAt": "2026-11-02T18:02:33.335Z",
  "items": [
    {
      "id": "68011de282893efe",
      "sourceId": "local",
      "title": "Grande Filme 2024",
      "format": "mkv",
      "mimeType": "video/x-matroska",
      "sizeBytes": 838860800,
      "relativePath": "Ação/Grande.Filme.2024.mkv",
      "modifiedAt": "2026-11-02T18:02:33.039Z",
      "streamUrl": "/api/videos/68011de282893efe/stream"
    }
  ]
}
```

- `id`: 16 caracteres hexadecimais, derivados da origem + caminho relativo. É **estável** entre scans e reinícios. No Windows, mudar só maiúsculas/minúsculas do nome não altera o ID. Mover ou renomear o arquivo gera um ID novo.
- `title`: derivado do nome do arquivo (pontos e underscores viram espaços).
- `relativePath`: sempre com `/`. Caminhos absolutos nunca são expostos.

### `GET /api/videos/:id`

Metadados de um vídeo (mesmo formato de um item acima).

| Status | Quando |
|--------|--------|
| 200    | Vídeo encontrado. |
| 400    | `id` fora do formato (não são 16 hexadecimais). |
| 404    | `VIDEO_NOT_FOUND`: ID não existe no catálogo. |

### `GET /api/videos/:id/stream` (também `HEAD`)

Transmite o arquivo. Veja os detalhes em [Como funciona o Range](#como-funciona-o-range).

| Status | Quando |
|--------|--------|
| 200    | Sem `Range` (ou Range ignorado): arquivo inteiro. |
| 206    | `Range` válido: apenas o trecho pedido. |
| 416    | `Range` fora do tamanho do arquivo. |
| 404    | `VIDEO_NOT_FOUND`, ou `FILE_MISSING` se o arquivo foi apagado/movido depois do scan. |

### `POST /api/library/scan` *(auxiliar)*

Reescaneia a pasta sem reiniciar o servidor — útil depois de copiar filmes novos. Scans simultâneos são unificados em um só.

```json
{ "total": 143, "durationMs": 91, "scannedAt": "2026-11-02T19:10:00.000Z" }
```

### Séries, episódios, legendas e capas

Os vídeos de `GET /api/videos` e `GET /api/videos/:id` ganharam três campos **adicionais** (os campos antigos não mudaram):

```json
{
  "media": { "kind": "episode", "seriesId": "4f1c…", "seriesTitle": "Minha Serie", "season": 1, "episode": 2, "episodeTitle": null },
  "subtitles": [
    { "id": "a0642cc0afa0a3bc", "language": "pt-BR", "label": "Português (Brasil)", "format": "srt", "forced": false,
      "url": "/api/videos/c4aa534e30ab35eb/subtitles/a0642cc0afa0a3bc" }
  ],
  "artworkUrl": "/api/videos/c4aa534e30ab35eb/artwork"
}
```

Filmes têm `"media": { "kind": "movie" }`. `artworkUrl` é `null` quando não há imagem na pasta.

| Endpoint | Descrição |
|---|---|
| `GET /api/series` | Lista de séries: `id`, `title`, `seasonCount`, `episodeCount`, `latestModifiedAt`, `artworkUrl`. |
| `GET /api/series/:id` | Série com `seasons[]` (número + episódios ordenados, no mesmo formato de `/api/videos`). |
| `GET /api/series/:id/artwork` | Capa da série (`poster/capa/cover/folder.jpg` na pasta da série). |
| `GET /api/videos/:id/subtitles` | Legendas associadas ao vídeo. |
| `GET /api/videos/:id/subtitles/:subtitleId` | A legenda convertida para **WebVTT UTF-8** (`text/vtt`). 422 `SUBTITLE_INVALID` se o arquivo não tiver falas válidas; 413 acima de 5 MB. |
| `GET /api/videos/:id/artwork` | Capa do vídeo, quando existe na pasta. |

**Como os episódios são identificados** (`src/library/media-classifier.ts`). Só vira episódio quando há evidência de temporada **e** episódio, e um nome de série. Na dúvida, o arquivo continua como filme avulso.

- Nome do arquivo com `S01E02`, `S1E2`, `S01.E02` ou `1x02`.
- Pasta de temporada imediata (`Temporada 1`, `Season 01`, `S01`, `1ª Temporada`, `Minha Série - Temporada 2`, `Serie.S02.1080p`) combinada com número no arquivo (`E02`, `Ep 2`, `Episódio 02`, `02 - Título`).
- Nome da série: pasta acima da temporada, depois o prefixo do arquivo (`Breaking.Bad.S01E01` → "Breaking Bad"), depois a pasta mais próxima que não seja genérica (`Series`, `Filmes`, `Downloads`…).
- O ID da série é derivado do nome normalizado, então episódios em pastas diferentes da mesma série são agrupados.

**Como as legendas são associadas** (`src/library/library-builder.ts`):

- Mesmo nome do vídeo + sufixo de idioma: `Filme.mkv` ↔ `Filme.srt`, `Filme.pt-BR.srt`, `Filme.en.forced.srt`.
- Também em subpastas `Legenda`, `Legendas`, `Sub`, `Subs`, `Subtitles` ao lado do vídeo.
- Numa pasta com **um único vídeo**, legendas com outro nome (ex.: `Portuguese.srt`) também são associadas. Com vários vídeos, nada é adivinhado.
- Idioma pelo sufixo: `pt-BR`/`ptbr`/`pob` → Português (Brasil); `pt`/`por`; `en`/`eng`; `es`/`spa`; `fr`, `it`, `de`, `ja`… Marcas `forced` e `sdh` são reconhecidas.
- A conversão detecta a codificação: UTF-8 (com ou sem BOM), UTF-16 e, como último recurso, **Windows-1252**, comum em legendas brasileiras antigas.
- A legenda só é servida pelo ID que o scan associou ao vídeo. O ID nunca é usado como caminho, e a leitura passa pela mesma proteção de path traversal do streaming.

**Correções manuais** (`METADATA_OVERRIDES_FILE`): um JSON opcional, relido a cada scan, com a chave sendo o caminho relativo ou o ID do vídeo:

```json
{
  "videos": {
    "Series/Minha Serie/extra.mkv": { "kind": "episode", "seriesTitle": "Minha Série", "season": 1, "episode": 7 },
    "8f3bf34f71f17c24": { "kind": "movie", "title": "Esqueceram de Mim" }
  }
}
```

### Testando com `curl.exe` (já vem no Windows 10/11)

```powershell
curl.exe http://localhost:8080/health
curl.exe http://localhost:8080/api/videos

# Primeiros 1024 bytes de um vídeo (mostra os cabeçalhos da resposta)
curl.exe -s -o NUL -D - -H "Range: bytes=0-1023" http://localhost:8080/api/videos/<id>/stream
```

> No PowerShell, `curl` sem `.exe` é um alias de `Invoke-WebRequest` e se comporta de outro jeito. Use `curl.exe`.

## Página de teste

Acesse `http://localhost:8080/`. A página:

- lista o catálogo com filtro por título ou pasta;
- mostra formato, tamanho e a resposta do navegador para `canPlayType()` (indica se ele provavelmente reproduz aquele contêiner);
- reproduz o vídeo selecionado em um `<video>` nativo — o próprio navegador usa Range para buscar trechos;
- tem um botão para reescanear a biblioteca.

## Como funciona o Range

O servidor implementa a RFC 9110 para um único intervalo de bytes:

| Requisição                          | Resposta | Cabeçalhos principais |
|-------------------------------------|----------|-----------------------|
| sem `Range`                         | **200**  | `Content-Length: <tamanho>`, `Accept-Ranges: bytes` |
| `Range: bytes=0-1023`               | **206**  | `Content-Range: bytes 0-1023/<tamanho>`, `Content-Length: 1024` |
| `Range: bytes=500-` (até o fim)     | **206**  | `Content-Range: bytes 500-<tamanho-1>/<tamanho>` |
| `Range: bytes=-500` (últimos 500)   | **206**  | `Content-Range: bytes <tamanho-500>-<tamanho-1>/<tamanho>` |
| `Range: bytes=0-999999999` (passa do fim) | **206** | fim limitado ao último byte |
| `Range: bytes=<tamanho>-`           | **416**  | `Content-Range: bytes */<tamanho>` |
| sintaxe inválida ou vários intervalos (`0-10,20-30`) | **200** | o Range é ignorado, como a RFC permite |

Também:

- **`If-Range`** é respeitado: se o arquivo mudou (ETag ou data diferentes), o servidor envia o arquivo inteiro (200) em vez de um trecho de uma versão antiga.
- **`ETag`** e **`Last-Modified`** são calculados a partir do tamanho e da data de modificação atuais.
- O tamanho é sempre lido do disco **no momento da requisição**, não do catálogo. Assim, o `Content-Length` continua correto mesmo se o arquivo mudou depois do scan.
- O arquivo é lido com `fs.createReadStream` (blocos de 256 KiB). O vídeo nunca é carregado inteiro na memória: nos testes, o uso de memória ficou estável enquanto um arquivo de 800 MB era transmitido.
- Se o cliente desconectar no meio (fechou o player, pulou para outro ponto), o stream é encerrado e o arquivo fechado.

## Rede local e segurança

### Como o acesso fica restrito à rede local

1. **`HOST=0.0.0.0`** faz o servidor escutar em todas as interfaces do PC, o que é necessário para a TV alcançá-lo.
2. **`LAN_ONLY=true`** recusa com 403 qualquer IP de origem fora destas faixas: `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`, `fc00::/7`, `fe80::/10`. O servidor usa o IP real do socket e ignora `X-Forwarded-For`.
3. **Firewall do Windows**: na primeira execução, o Windows pergunta se o Node.js pode se comunicar na rede. Marque **apenas "Redes privadas"**. Para criar a regra manualmente, use o PowerShell **como administrador**:

   ```powershell
   New-NetFirewallRule -DisplayName "Home Media Server" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Private
   ```

   Confirme também que a sua rede está marcada como **Privada** em *Configurações → Rede e Internet → (sua conexão) → Tipo de perfil de rede*.
4. **Não** faça redirecionamento de porta (port forwarding) no roteador. Sem isso, o serviço não é alcançável pela internet.

**Dica:** reserve um IP fixo para o PC no DHCP do roteador. Assim o endereço que o app da TV usa não muda.

### Outras proteções

- **Path traversal**: o cliente nunca envia caminhos de arquivo, apenas IDs validados por regex (`^[a-f0-9]{16}$`) e procurados no catálogo. Mesmo assim, antes de abrir qualquer arquivo o servidor:
  - rejeita caminhos absolutos e caracteres nulos;
  - resolve o caminho e confirma que ele está dentro de `MEDIA_ROOT`;
  - segue links simbólicos e junctions (`realpath`) e verifica de novo que o destino real continua dentro da raiz.
- **Links simbólicos e junctions** são ignorados durante o scan.
- **Somente leitura**: o código só usa operações de leitura (`readdir`, `stat`, `realpath`, `createReadStream`).
- **Erros internos** não expõem detalhes na resposta (apenas `INTERNAL_ERROR`); os detalhes ficam no log.
- **Sem autenticação nesta versão**: qualquer dispositivo da rede local pode listar e assistir aos vídeos. Isso é aceitável numa rede doméstica confiável, mas evite redes compartilhadas.

### CORS (para o app Tizen)

O CORS vem **desativado por padrão** no código. A página de teste é servida pelo próprio servidor (mesma origem) e não precisa dele. Liberar `*` permitiria que qualquer site aberto num navegador da sua rede lesse o catálogo.

O app HomeFlix instalado na TV roda a partir de `file://` e faz `fetch` do catálogo e das legendas. Por isso o `.env` libera apenas as origens que ele usa:

```env
CORS_ORIGINS=null,file://
```

No modo de desenvolvimento do HomeFlix (`npm run dev` em `../homeflix`), o Vite repassa a API pela mesma origem e não precisa de CORS.

- O servidor expõe `Content-Range`, `Content-Length`, `Accept-Ranges`, `ETag` e `Last-Modified` para JavaScript, e aceita o cabeçalho `Range` em requisições preflight. Players como Shaka Player e hls.js precisam disso.
- Em apps Tizen empacotados (`.wgt`), a origem pode chegar como `null` ou `file://`, dependendo de como o app é carregado. Confira no log (`LOG_LEVEL=debug`) e ajuste a lista.
- Além do CORS, o app declara no `config.xml` o acesso à rede (`<access origin="*">`, já que o IP do PC é configurado na TV) e o privilégio `http://tizen.org/privilege/internet`.
- O elemento `<video>` e o player nativo AVPlay normalmente não estão sujeitos a CORS; ele importa quando o app usa `fetch`/XHR (catálogo, metadados) ou players em JavaScript.

## Limitações de codecs e contêineres

**Nesta versão não há transcodificação.** O servidor envia os bytes do arquivo como estão, e quem decodifica é o cliente. Se o player não suporta o contêiner ou os codecs de vídeo e áudio, o arquivo não toca — e o servidor não tem como resolver isso.

Repare que a extensão indica só o **contêiner**. Um `.mkv` pode conter H.264, HEVC, VP9 ou AV1 de vídeo, e AAC, AC-3, DTS etc. de áudio. É essa combinação que decide se o arquivo reproduz.

### Navegadores (página de teste)

| Contêiner | Situação típica em Chrome/Edge no Windows |
|-----------|--------------------------------------------|
| **MP4**   | Funciona com H.264 + AAC. HEVC (H.265) depende de suporte de hardware e do sistema. |
| **WebM**  | Funciona (VP8/VP9/AV1 + Opus/Vorbis). |
| **MOV**   | Costuma funcionar se tiver H.264 + AAC; não funciona com ProRes e outros codecs profissionais. |
| **MKV**   | Sem suporte oficial. Às vezes toca no Chrome quando os codecs são compatíveis (H.264/VP9 + AAC/Opus); no Firefox, em geral não. |
| **AVI**   | Não suportado por navegadores. |

O áudio também conta: **AC-3, E-AC-3 (Dolby) e DTS** frequentemente não são decodificados por navegadores. O vídeo pode abrir mudo ou nem abrir.

### Samsung TV (Tizen)

As TVs Samsung costumam suportar bem mais formatos que um navegador, sobretudo pelo player nativo **AVPlay**: MKV, AVI e MP4 com H.264 e HEVC, e, em modelos mais novos, VP9 e AV1. O suporte exato **varia por modelo e ano** (por exemplo, DTS não é suportado em vários modelos recentes). Confira as especificações de multimídia do seu modelo.

### Outros pontos

- **MP4 sem "faststart"**: se o índice (átomo `moov`) estiver no fim do arquivo, o player precisa buscar o final antes de começar. Funciona graças ao Range, mas o início demora mais. Dá para corrigir sem recodificar, gerando uma **cópia**:
  `ffmpeg -i entrada.mp4 -c copy -movflags +faststart saida.mp4`
  (o servidor nunca faz isso por conta própria nem altera os originais).
- **AVI** antigos podem ter busca (seek) imprecisa ou lenta.
- **Legendas**: arquivos externos `.srt`/`.vtt` são servidos (veja acima). Faixas de legenda **embutidas** no MKV não são expostas pela API.
- **Taxa de bits fixa**: não há HLS/DASH adaptativo. Um remux 4K (50–80 Mbps) pode travar em Wi-Fi fraco. Prefira cabo de rede na TV ou no PC.

## Arquitetura

```
home-media-server/
├── public/
│   └── index.html                  # página de teste (HTML + JS puro)
├── src/
│   ├── server.ts                   # ponto de entrada: .env, listen, shutdown
│   ├── app.ts                      # composition root: monta serviços, plugins e rotas
│   ├── paths.ts
│   ├── config/
│   │   ├── env.ts                  # validação das variáveis de ambiente (zod)
│   │   └── logger.ts               # configuração do pino
│   ├── errors/
│   │   └── app-error.ts            # AppError + códigos de erro da API
│   ├── library/                    # domínio: catálogo de mídia
│   │   ├── types.ts                # VideoItem, MediaSource, ByteRange...
│   │   ├── catalog.service.ts      # catálogo em memória, scan, busca por ID
│   │   ├── formats.ts              # extensões suportadas e MIME types
│   │   ├── video-id.ts             # ID estável (sha256 de origem + caminho)
│   │   ├── title.ts                # título a partir do nome do arquivo
│   │   ├── path-safety.ts          # proteção contra path traversal
│   │   └── sources/
│   │       └── local-source.ts     # MediaSource da pasta local (somente leitura)
│   ├── streaming/
│   │   ├── range.ts                # parser de Range/If-Range (funções puras)
│   │   └── streaming.service.ts    # decide 200/206/416 e abre o stream
│   ├── plugins/
│   │   ├── error-handler.ts        # erros → JSON padronizado + log
│   │   ├── lan-guard.ts            # restrição a IPs da rede local
│   │   └── cors.ts
│   └── routes/
│       ├── schemas.ts              # DTOs e JSON Schemas (validação/serialização)
│       ├── health.routes.ts
│       ├── videos.routes.ts
│       ├── library.routes.ts
│       └── web.routes.ts
└── test/                           # testes unitários e de integração (Vitest)
```

**Princípios:**

- As rotas só traduzem HTTP ↔ serviços. Não há regra de negócio nelas.
- Os serviços recebem dependências pelo construtor (injeção explícita), sem decorators globais. Isso facilita testar e trocar implementações.
- `MediaSource` é a fronteira com o armazenamento. O catálogo e o streaming não sabem se o arquivo está no disco ou na nuvem.
- O `VideoItem` interno guarda `relativePath` e `sourceId`; a API expõe um DTO separado, que nunca inclui caminhos absolutos.

### Pontos de extensão para o futuro

| Funcionalidade | Como encaixar |
|---|---|
| **Google Drive** | Criar `GoogleDriveSource implements MediaSource` (`scan`, `stat` e `openStream` com Range via API do Drive) e adicioná-la à lista de origens em `app.ts`. Os IDs já incluem `sourceId`, então não há colisão com arquivos locais. |
| **Capas e metadados** | Criar um `MetadataService` indexado por `VideoItem.id` (ex.: TMDB + cache em SQLite) e enriquecer o DTO, sem mexer no scanner. |
| **Categorias e coleções** | Derivar categorias das pastas (`relativePath`) ou criar um repositório próprio de coleções que referencie IDs. |
| **Histórico de reprodução** | Endpoint `PUT /api/videos/:id/progress` + persistência (SQLite). Como o Range já está implementado, retomar de uma posição funciona naturalmente. |
| **App Tizen** | Consumir `GET /api/videos` e tocar `streamUrl` com AVPlay ou `<video>`; liberar a origem em `CORS_ORIGINS`. |
| **Transcodificação** | Ficaria em uma nova camada, entre `StreamingService` e a origem (ex.: ffmpeg gerando HLS sob demanda), ativada só para formatos incompatíveis. |

**Atenção quanto à estabilidade do ID:** como ele deriva do caminho, renomear ou mover um arquivo muda o ID. Quando existir histórico de reprodução, pode valer a pena um identificador por conteúdo (ex.: tamanho + hash do início e do fim do arquivo).

## Testes

```powershell
npm test
```

Os testes criam uma biblioteca falsa em uma pasta temporária (nunca tocam em `E:\Filmes`) e cobrem:

- **Endpoints**: `/health`, listagem, metadados, 400/404 e a página HTML.
- **Range**: 200 sem Range; 206 para início, meio, fim, sufixo e intervalo que passa do fim; 416 com `Content-Range: bytes */tamanho`; Range inválido ou múltiplo ignorado; `If-Range`; `HEAD`; arquivo vazio. O corpo de cada resposta é comparado byte a byte com o original.
- **Catálogo**: varredura recursiva, filtro por extensão (sem diferenciar maiúsculas), MIME por contêiner, IDs estáveis entre instâncias, reescan, arquivo alterado ou removido depois do scan.
- **Segurança**: path traversal via URL e via caminhos internos, caminhos absolutos (POSIX e Windows), links simbólicos para fora da biblioteca, `LAN_ONLY` com IPs públicos e privados (IPv4/IPv6), CORS desativado, liberado e negado.
- **Configuração**: valores padrão, valores vazios e valores inválidos.

> No Windows, o teste de links simbólicos é pulado automaticamente se o usuário não tiver permissão para criar symlinks (exige o Modo de Desenvolvedor ou privilégios de administrador).

## Git e GitHub

```powershell
git init
git add .
git commit -m "feat: servidor de mídia local com streaming via HTTP Range"
git branch -M main
```

Crie um repositório **vazio** no GitHub (sem README nem .gitignore) e conecte:

```powershell
git remote add origin https://github.com/carloscjm/home-media-server.git
git push -u origin main
```

Ou, com a GitHub CLI: `gh repo create home-media-server --private --source . --push`.

O `.gitignore` já exclui `node_modules/`, `dist/` e `.env`. Versione o `.env.example`, nunca o `.env`.

## Solução de problemas

| Sintoma | Causa provável / solução |
|---|---|
| `MEDIA_ROOT "E:\Filmes" não existe` | Drive desconectado ou caminho errado no `.env`. |
| `EADDRINUSE` | A porta já está em uso. Mude `PORT` no `.env`. |
| Funciona no PC, mas a TV/celular não conecta | Firewall do Windows (libere a regra para o perfil **Privado**), rede marcada como Pública, ou IP do PC errado. Use o endereço mostrado no log de inicialização. |
| 403 `FORBIDDEN_NETWORK` | O cliente não está em uma faixa de IP local. Se for uma VPN/rede mesh (ex.: faixa `100.64.0.0/10`), use `LAN_ONLY=false` por sua conta e risco. |
| Vídeo não toca no navegador, mas a API responde | Contêiner ou codec não suportado pelo navegador (veja as [limitações](#limitações-de-codecs-e-contêineres)). |
| 404 `FILE_MISSING` | O arquivo foi movido ou apagado depois do scan. Use o botão "Reescanear" ou `POST /api/library/scan`. |
| Filme novo não aparece | O catálogo é montado na inicialização. Reescaneie. |

## Roadmap

- [ ] Integração com Google Drive (`GoogleDriveSource`)
- [ ] Capas e metadados (TMDB)
- [ ] Categorias e coleções
- [x] Histórico de reprodução / "continuar assistindo" (no app, salvo na TV)
- [x] Aplicativo Samsung Tizen com interface estilo Netflix (`../homeflix`)
- [x] Legendas externas (`.srt` → WebVTT)
- [x] Séries, temporadas e episódios
- [ ] Sincronizar o histórico com o servidor (vários aparelhos)
- [ ] Transcodificação sob demanda para formatos incompatíveis
- [ ] Autenticação simples (PIN ou token por dispositivo)
