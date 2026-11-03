# Operação

## Ambiente atual

| Item | Valor |
|---|---|
| PC servidor | Windows, `192.168.15.165` (Ethernet), porta `8080` |
| Pasta de mídia | `E:\Filmes` (somente leitura) |
| TV | Samsung QN50Q60CAGXZD, `192.168.15.92`, Tizen 9.0, DUID `CPCLIM2YEZ4WO` |
| Tizen SDK | `C:\tizen-studio` (SDK 10 CLI + TV Extensions + Samsung Certificate Extension) |
| Certificado | perfil `HomeFlix` em `C:\Users\carlo\SamsungCertificate\HomeFlix` (fora do repositório; validade de 1 ano, até 11/2027) |

## Servidor

### Ligar, desligar e verificar

Na pasta `home-media-server\`, dois cliques em:

- `iniciar-servidor.bat`: instala dependências se faltarem, cria `.env` a partir do exemplo e roda `npm run dev` numa janela "Home Media Server".
- `parar-servidor.bat`: fecha a janela e encerra o `node` na porta 8080 (incluindo o processo do `tsx watch`).
- `status-servidor.bat`: situação, tempo ativo, vídeos, séries, último scan, endereços e aparelhos conectados.

### Variáveis de ambiente (`home-media-server/.env`)

| Variável | Padrão | Descrição |
|---|---|---|
| `MEDIA_ROOT` | `E:\Filmes` | Pasta de vídeos (lida recursivamente) |
| `HOST` / `PORT` | `0.0.0.0` / `8080` | Interface e porta |
| `LAN_ONLY` | `true` | Recusa IPs fora de redes privadas |
| `CORS_ORIGINS` | vazio | Origens liberadas; use `null,file://` para o app da TV |
| `LOG_LEVEL` / `LOG_PRETTY` | `info` / `false` | Logs |
| `METADATA_OVERRIDES_FILE` | vazio | JSON de correções manuais de séries/episódios |
| `IPTV_SOURCE` | vazio | Listas M3U (URLs ou arquivos), separadas por `\|` |
| `IPTV_MAX_LIST_MB` | `50` | Tamanho máximo por lista (1–500) |

Mudanças no `.env` exigem reiniciar o servidor.

### Organização da mídia

```text
E:\Filmes\
├─ Nome do Filme\Filme.mkv  (+ Filme.pt-BR.srt, Legenda\Filme.srt, qualquer imagem = capa)
└─ Series\Nome da Série\
   ├─ poster.jpg            (capa da série; qualquer imagem serve)
   └─ Temporada 1\S01E01.mkv  (+ S01E01.pt-BR.srt)
```

Depois de adicionar arquivos: na TV, **Configurações › Atualizar biblioteca** (ou reiniciar o servidor). Mover ou renomear um arquivo muda o ID dele, e o progresso salvo daquele vídeo recomeça.

### Rede e firewall

- A rede do PC precisa estar como **Privada**, com o `node.exe` liberado no firewall só para redes privadas.
- Reserve o IP do PC no roteador (DHCP estático). Se ele mudar, atualize em Configurações na TV ou no `homeflix/.env.local`.

## App na TV

### Pré-requisitos (uma vez)

1. Tizen SDK em `C:\tizen-studio`. No Package Manager, use o repositório `http://download.tizen.org/sdk/tizenstudio`: o espelho `brazil.sdk-dl.tizen.org` responde 403. Instale **TV Extensions** e **Samsung Certificate Extension**.
2. TV em **Developer Mode**: Apps › `12345` › Host PC IP `192.168.15.165` › reiniciar a TV.
3. `sdb connect 192.168.15.92:26101` (se falhar, `sdb kill-server` e tentar de novo).
4. Certificate Manager (`C:\tizen-studio\tools\certificate-manager\certificate-manager.exe`): perfil **Samsung › TV › `HomeFlix`**, author + distributor com o DUID da TV, login na conta Samsung.

### Publicar uma nova versão

```bash
npm run check                                   # na raiz
npm --prefix homeflix run package               # gera homeflix/release/HomeFlix.wgt
npm --prefix homeflix run install:tv -- -TvIp 192.168.15.92
```

`homeflix/.env.local` (fora do Git) define o servidor pré-configurado no build: `VITE_DEFAULT_SERVER_URL=192.168.15.165:8080`.

### Depurar o app na TV (console remoto)

```powershell
$sdb='C:\tizen-studio\tools\sdb.exe'; $s='192.168.15.92:26101'
& $sdb -s $s shell 0 was_kill HmFlxApp01.HomeFlix
& $sdb -s $s shell 0 debug HmFlxApp01.HomeFlix      # mostra "port: NNNNN"
& $sdb -s $s forward tcp:9222 tcp:NNNNN
curl.exe http://127.0.0.1:9222/json                 # webSocketDebuggerUrl
```

Abra `chrome://inspect` no Chrome do PC (alvo `localhost:9222`) ou use o protocolo DevTools via WebSocket para `Runtime.evaluate`. Remova o encaminhamento depois: `sdb forward --remove-all`.

## Solução de problemas

| Sintoma | Causa / solução |
|---|---|
| App não conecta | Servidor parado, IP mudou, firewall ou rede "Pública". Rode `status-servidor.bat`. |
| Conecta no navegador mas não na TV | `CORS_ORIGINS` sem `null,file://`. |
| Áudio e legenda sem imagem | Página não transparente durante o AVPlay (ver invariantes em `AGENTS.md`). |
| Ícone no centro do vídeo | `<object>` do AVPlay visível (deve ter `opacity: 0`). |
| Filme toca sem som | Áudio DTS ou TrueHD, que a TV não decodifica (a tela do filme avisa). Gere uma **cópia** com o áudio em AC-3 fora de `E:\Filmes` e depois substitua: `ffmpeg -i entrada.mkv -map 0 -c:v copy -c:s copy -c:a ac3 -b:a 640k saida.mkv`. Ou prefira versões com áudio AC-3/E-AC-3 (DD/DDP). |
| Série não aparece | Pasta fora de `MEDIA_ROOT` ou sem número de temporada/episódio no nome. |
| Episódio aparece como filme | Falta `S01E01` no nome ou pasta `Temporada N`; ou use `METADATA_OVERRIDES_FILE`. |
| "Canais ao vivo não configurados" | `IPTV_SOURCE` vazio no `.env`. |
| "lista maior que X MB" | Ajuste `IPTV_MAX_LIST_MB` ou use uma lista só de canais ao vivo. |
| `npm run package` falha | Perfil `HomeFlix` inexistente/expirado no Certificate Manager. |
| `install:tv` falha com erro de assinatura | Certificado sem o DUID da TV ou Developer Mode desligado. |
| Package Manager "Network disconnected" | Repositório configurado no espelho do Brasil (403); troque pelo oficial. |
