# API do Home Media Server

Base: `http://<IP-do-PC>:8080`. Todas as respostas são JSON (exceto stream, legendas e imagens). Erros:

```json
{ "error": { "code": "VIDEO_NOT_FOUND", "message": "Vídeo \"…\" não encontrado no catálogo." } }
```

Acesso restrito à rede local (`LAN_ONLY=true` → 403 `FORBIDDEN_NETWORK` fora dela). IDs são 16 caracteres hex; formato inválido → 400.

## Saúde e biblioteca

| Método e rota | Resposta |
|---|---|
| `GET /health` | `{ status: "ok", uptimeSeconds, catalog: { total, scannedAt } }` |
| `POST /api/library/scan` | Reescaneia a mídia e recarrega o IPTV. `{ total, durationMs, scannedAt }` |
| `GET /` | Página HTML de teste (catálogo + player do navegador) |

## Vídeos

### `GET /api/videos` → `{ total, scannedAt, items: Video[] }`

```json
{
  "id": "c4aa534e30ab35eb",
  "sourceId": "local",
  "title": "O Expresso Polar 2004 1080p BluRay X264-Lozano",
  "format": "mkv",
  "mimeType": "video/x-matroska",
  "sizeBytes": 5870391455,
  "relativePath": "Expresso.Polar…/O.Expresso.Polar….mkv",
  "modifiedAt": "2020-12-06T02:44:02.509Z",
  "streamUrl": "/api/videos/c4aa534e30ab35eb/stream",
  "media": { "kind": "movie" },
  "subtitles": [
    { "id": "a0642cc0afa0a3bc", "language": null, "label": "Legenda", "format": "srt", "forced": false,
      "url": "/api/videos/c4aa534e30ab35eb/subtitles/a0642cc0afa0a3bc" }
  ],
  "artworkUrl": "/api/videos/c4aa534e30ab35eb/artwork"
}
```

Episódios: `"media": { "kind": "episode", "seriesId", "seriesTitle", "season", "episode", "episodeTitle" }`.

| Rota | Descrição |
|---|---|
| `GET /api/videos/:id` | Um vídeo (mesmo formato). 404 `VIDEO_NOT_FOUND`. |
| `GET\|HEAD /api/videos/:id/stream` | Arquivo com HTTP Range: 200 (inteiro), 206 (`Content-Range`), 416 (fora do arquivo). `ETag`, `Last-Modified`, `If-Range`. 404 `FILE_MISSING` se o arquivo sumiu após o scan. |
| `GET /api/videos/:id/subtitles` | `{ items: Subtitle[] }` |
| `GET /api/videos/:id/subtitles/:subtitleId` | WebVTT UTF-8 (`text/vtt`). 404 `SUBTITLE_NOT_FOUND` (inclusive ID de outro vídeo), 422 `SUBTITLE_INVALID`, 413 `FILE_TOO_LARGE` (> 5 MB). |
| `GET /api/videos/:id/probe` | Codecs de áudio lidos do início do arquivo (MKV): `{ audioCodecs: ["A_DTS",…], audioLabels: ["DTS",…], unsupported }`. `unsupported` = nenhuma faixa decodificável pela TV (DTS/TrueHD). Em cache por vídeo. |
| `GET /api/videos/:id/artwork` | Imagem da capa (`Cache-Control: max-age=3600`). 404 `ARTWORK_NOT_FOUND`. |

## Séries

| Rota | Resposta |
|---|---|
| `GET /api/series` | `{ total, items: [{ id, title, seasonCount, episodeCount, latestModifiedAt, artworkUrl }] }` |
| `GET /api/series/:id` | Resumo + `seasons: [{ number, episodes: Video[] }]` (ordenados). 404 `SERIES_NOT_FOUND`. |
| `GET /api/series/:id/artwork` | Capa da pasta da série. |

## TV ao vivo (IPTV)

Configuração: `IPTV_SOURCE` (URLs/arquivos separados por `|`), `IPTV_MAX_LIST_MB` (padrão 50). Campos de status em todas as respostas: `configured`, `total`, `loadedAt`, `errors[]` (sem credenciais).

| Rota | Resposta |
|---|---|
| `GET /api/iptv/groups` | `items: [{ name, count }]` na ordem da lista |
| `GET /api/iptv/channels?group=<nome>` | `items: [{ id, name, group, logo, url }]` da categoria (sem `group`: todos — evitar na TV com listas grandes) |

`url` é o stream original (HLS/MPEG-TS), tocado direto pela TV.

## CORS

Desligado por padrão no código; o `.env` libera `CORS_ORIGINS=null,file://` para o app empacotado. Cabeçalhos expostos: `Content-Range`, `Content-Length`, `Accept-Ranges`, `ETag`, `Last-Modified`.

## Códigos de erro

`VIDEO_NOT_FOUND`, `SERIES_NOT_FOUND`, `SUBTITLE_NOT_FOUND`, `ARTWORK_NOT_FOUND`, `FILE_MISSING`, `FILE_TOO_LARGE`, `SUBTITLE_INVALID`, `FORBIDDEN_PATH`, `FORBIDDEN_NETWORK`, `RANGE_NOT_SATISFIABLE`, `ROUTE_NOT_FOUND`, `INTERNAL_ERROR` e códigos de validação do Fastify (`FST_ERR_*`).
