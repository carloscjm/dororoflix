# HomeFlix — app Samsung Smart TV (Tizen)

> Na TV o app aparece como **MultiFlix** (logo e ícone em `src/assets/brand/` e `tizen/icon.png`). O nome interno do projeto e o ID do pacote (`HmFlxApp01.HomeFlix`) continuam os mesmos para preservar o histórico já salvo na TV.

Plataforma pessoal de streaming, com interface inspirada na Netflix, para assistir na **Samsung Q60C** aos vídeos do PC servidos pelo [Home Media Server](../home-media-server).

- Tela inicial com banner e fileiras: **Continuar assistindo**, **Filmes**, **Séries**, **Adicionados recentemente**.
- Detalhes de filme e de série, com temporadas, episódios, indicador de assistido e progresso parcial.
- Player baseado no **Samsung AVPlay** (decodificação nativa da TV), com abstração HTML5 para testar no navegador.
- **Continua de onde parou**: posição salva por filme e por episódio, que sobrevive a desligar a TV.
- **Legendas externas** (`.srt`/`.vtt`) desenhadas pelo próprio app sobre o vídeo, com menu de seleção e idioma preferido.
- Navegação 100% pelo controle remoto, com gerenciador de foco e restauração do item selecionado ao voltar.
- Configurações: IP/porta do servidor, teste de conexão, atualização da biblioteca, idioma das legendas.
- TypeScript sem framework e sem dependências em tempo de execução: o bundle inteiro tem cerca de 21 KB gzip.

> **Situação da validação:** tudo foi testado no navegador (Chrome) e com testes automatizados. **Ainda não foi executado na TV.** O AVPlay, as teclas de mídia, a suspensão e o empacotamento assinado precisam ser confirmados no aparelho (veja [O que falta validar na TV](#o-que-falta-validar-na-tv)).

---

## Sumário

1. [Requisitos](#requisitos)
2. [Desenvolvimento no navegador](#desenvolvimento-no-navegador)
3. [Scripts](#scripts)
4. [Conectar ao servidor](#conectar-ao-servidor)
5. [Instalar na TV](#instalar-na-tv)
6. [Como funciona](#como-funciona)
7. [Arquitetura](#arquitetura)
8. [Testes](#testes)
9. [Limitações e codecs da Q60C](#limitações-e-codecs-da-q60c)
10. [O que falta validar na TV](#o-que-falta-validar-na-tv)
11. [Solução de problemas](#solução-de-problemas)

---

## Requisitos

- Node.js 20.12 ou superior (testado com 24.14).
- Home Media Server rodando no PC (`../home-media-server`, `iniciar-servidor.bat`).
- Para instalar na TV: **Tizen Studio** com **Samsung TV Extensions** e **Samsung Certificate Extension**, além de uma conta Samsung (gratuita).

```powershell
cd "E:\servidor player\home-media-server\homeflix"
npm install
```

## Desenvolvimento no navegador

Com o servidor de mídia ligado:

```powershell
npm run dev
```

Abra `http://localhost:5173`. O Vite repassa `/api` e `/health` para `http://localhost:8080`, então não há CORS no desenvolvimento. Para usar outro backend, defina `HOMEFLIX_BACKEND=http://IP:PORTA` antes de rodar.

**Controle remoto simulado:** um painel no canto inferior direito tem os botões do controle (clicáveis). A tecla **H** oculta o painel. Pelo teclado:

| Controle | Teclado |
|---|---|
| Setas | Setas |
| OK | Enter |
| Voltar | Backspace ou Esc |
| Play/Pause | Espaço ou K |
| Avançar / Retroceder | F ou `.` / R ou `,` |
| Parar | S |
| Vermelho (A) / Amarelo (C) | F1 / F3 |
| Números | 0–9 |

No navegador, o player usa `<video>` HTML5. MKV com áudio AC-3/DTS costuma não tocar no Chrome; isso é limitação do navegador, não do app. Na TV o AVPlay é usado. Para forçar o HTML5 na TV ao depurar, abra o app com `?engine=html5`.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento com recarga automática. |
| `npm run build` | Typecheck + bundle IIFE em `dist/` + `config.xml` e ícone (pronto para empacotar). |
| `npm test` | Testes automatizados (Vitest + happy-dom). |
| `npm run check` | Typecheck, testes e build. |
| `npm run package` | Build + `.wgt` assinado com o Tizen Studio CLI → `release/HomeFlix.wgt`. |
| `npm run install:tv -- -TvIp <IP>` | Conecta via `sdb`, instala e abre o app na TV. |

## Conectar ao servidor

Na TV, `localhost` é a própria TV. O app sempre usa o **IP do PC na rede local** (hoje `192.168.15.165:8080`).

- **Primeira execução:** sem endereço configurado, o app abre direto em **Configurações**. Digite o IP e a porta com o teclado na tela (ou os números do controle), depois escolha **Salvar e conectar**.
- **Pré-configurado no build (recomendado):** crie `homeflix/.env.local`, que não vai para o Git:

  ```env
  VITE_DEFAULT_SERVER_URL=192.168.15.165:8080
  ```

  O app instalado já abre conectado. O endereço pode ser trocado depois em Configurações.
- **No servidor**, o `.env` precisa liberar a origem do app empacotado (já configurado):

  ```env
  CORS_ORIGINS=null,file://
  ```

- Em **Configurações** também há: **Testar conexão**, **Atualizar biblioteca** (reescaneia o PC), idioma preferido das legendas, quando considerar um vídeo "assistido" (85/90/95%) e limpar o histórico.

Dica: reserve o IP do PC no roteador (DHCP estático) para o endereço não mudar.

## Instalar na TV

A Samsung exige que apps fora da loja sejam **assinados com um certificado Samsung que inclua o DUID da TV**. Não há como gerar um `.wgt` instalável sem isso. Por isso estes passos são feitos uma vez, por você:

1. **Instalar o Tizen Studio** (developer.tizen.org) e, no **Package Manager**, instalar:
   - *Tizen SDK tools* (já vem);
   - em *Extension SDK*: **Samsung TV Extensions** e **Samsung Certificate Extension**.
2. **Ativar o Developer Mode na TV:**
   - abra **Apps** na Q60C e digite **1 2 3 4 5** no controle (use o botão 123 para o teclado numérico);
   - ligue **Developer mode**, informe o IP do PC (`192.168.15.165`) e **reinicie a TV** (desligue da tomada por alguns segundos, se necessário);
   - anote o IP da TV (Configurações › Geral › Rede › Status da rede).
3. **Conectar a TV no Tizen Studio:** em *Tools › Device Manager*, use *Remote Device Manager* › **+** com o IP da TV e a porta `26101`. Ou, no terminal:

   ```powershell
   C:\tizen-studio\tools\sdb.exe connect <IP-da-TV>:26101
   ```

4. **Criar o certificado:** em *Tools › Certificate Manager*, clique em **+**, escolha **Samsung**, tipo **TV**, perfil **`HomeFlix`**, crie o *author certificate* e entre com a conta Samsung. No *distributor certificate*, confirme que o **DUID da TV conectada** aparece na lista.
5. **Empacotar e instalar:**

   ```powershell
   npm run package
   npm run install:tv -- -TvIp <IP-da-TV>
   ```

   O pacote fica em `release/HomeFlix.wgt` e o app aparece em **Apps** na TV.

Alternativa sem scripts: no Tizen Studio, *File › Import › Tizen › Tizen Project*, aponte para a pasta `dist/` (depois de `npm run build`), clique com o botão direito no projeto e escolha **Run As › Tizen Web Application**.

**Detalhes do pacote** (`tizen/config.xml`):

- ID do app `HmFlxApp01.HomeFlix`, perfil `tv-samsung` e `required_version` 6.5 (TVs 2022+; a Q60C 2023 usa Tizen 7.0).
- Privilégios: `internet` (acessar o servidor) e `tv.inputdevice` (teclas de mídia e cores do controle).
- `<access origin="*">`: o IP do servidor é configurável na TV. O app só fala com o endereço que você informar, e o servidor só responde à rede local (`LAN_ONLY=true`).

## Como funciona

### Histórico e "continuar assistindo"

- Cada vídeo (filme ou episódio) tem um registro próprio no `localStorage` do app: `homeflix.progress.v1:<id>`. Ele guarda a posição, a duração, a data da última reprodução, a marca de assistido e uma revisão.
- No Tizen, esse armazenamento fica na área de dados do aplicativo e **sobrevive a fechar o app e desligar a TV**. Só é apagado ao desinstalar.
- O progresso é salvo **a cada 10 s** tocando, ao **pausar**, ao **avançar/retroceder**, ao **sair do player**, ao **trocar de episódio**, quando o app vai para **segundo plano** (botão Home, troca de entrada) e em `pagehide`. Como a TV pode ser desligada sem aviso, o salvamento periódico é a garantia principal: perde-se no máximo cerca de 10 s.
- O ID vem do servidor e é estável (hash do caminho), então **reescanear a biblioteca não apaga o histórico**. Mover ou renomear o arquivo gera um ID novo.
- A partir de **90%** o vídeo conta como assistido (ajustável em Configurações). Ao abrir um vídeo pela metade, o app pergunta: **Continuar de 21:35** ou **Começar do início**.
- **Séries:** o progresso é por episódio. "Continuar" retoma o último episódio pela metade; se ele terminou, vai para o próximo não assistido.
- O formato (`updatedAt` + `revision` por registro) já permite sincronizar com o servidor no futuro, com a última escrita vencendo, sem migração.

### Legendas

- O servidor associa `.srt`/`.vtt` aos vídeos e sempre entrega **WebVTT UTF-8**, corrigindo legendas em Windows-1252.
- O AVPlay **não** recebe a legenda: `setExternalSubtitlePath` exige um arquivo local na TV, não uma URL HTTP. O app desenha as falas numa camada sobre o vídeo, sincronizada pela posição do player a cada 250 ms e imediatamente após cada busca. A busca é binária, então pausar, avançar e retroceder ficam corretos.
- Só `<i>`, `<b>`, `<u>` e quebras de linha são renderizados. Qualquer outra tag vira texto, para não haver injeção de HTML.
- Arquivo inválido ou indisponível: aviso na tela, e a legenda é desativada sem interromper o vídeo.
- Menu **Legendas** no player (ou a tecla amarela): desativar ou escolher a faixa. A escolha vira o idioma preferido, usado nos próximos vídeos.

### Controle remoto

| Tecla | Catálogo | Player (controles ocultos) | Player (controles visíveis) |
|---|---|---|---|
| Setas | Move o foco | ◀ ▶ retrocede/avança 10 s; ▲ ▼ mostram os controles | Navega pela barra e pelos botões; na barra, ◀ ▶ = ±10 s |
| OK | Abre | Play/Pause | Aciona o botão |
| Voltar | Volta; na tela inicial, pergunta se quer sair | Sai do player (salvando) | Idem |
| ⏯ ⏵ ⏸ | — | Play/Pause | Play/Pause |
| ⏩ ⏪ | — | ±30 s | ±30 s |
| ⏹ | — | Sai do player | Sai do player |
| Vermelho (A) | Recarrega a tela inicial | — | — |
| Amarelo (C) | — | Menu de legendas | Menu de legendas |

Toques rápidos de avançar/retroceder são acumulados e enviados como um único seek, o que é mais leve para a TV. Ao terminar um episódio, aparece **Próximo episódio em 15 s**, com as opções *Assistir agora* e *Voltar ao catálogo*.

## Arquitetura

```text
homeflix/
├─ index.html                 página única (no build, inclui $WEBAPIS/webapis/webapis.js)
├─ vite.config.ts             bundle IIFE (file:// bloqueia módulos), alvo Chromium 85
├─ tizen/config.xml, icon.png manifesto e ícone do pacote
├─ scripts/                   ícone, preparo do dist/, empacotar e instalar (PowerShell)
├─ src/
│  ├─ main.ts                 composição: repositórios, API, foco, rotas, motor de vídeo
│  ├─ app-context.ts          dependências compartilhadas + cache do catálogo
│  ├─ api/media-api.ts        Media API: cliente REST com timeout e erros tipados
│  ├─ models/                 Media Models (contratos da API) e regras puras do catálogo
│  ├─ navigation/             Focus Manager, Router (pilha de telas), overlays/diálogos
│  ├─ platform/               teclas do controle, APIs Tizen, controle simulado
│  ├─ storage/                Progress Repository, Settings Repository, armazenamento
│  ├─ player/                 Playback Service, AVPlay, HTML5 (interface VideoEngine)
│  ├─ subtitles/              Subtitle Service, parser WebVTT, renderizador seguro
│  ├─ components/ui.ts        cards, fileiras, botões, capas e placeholders
│  ├─ screens/                início, filme, série, player, configurações
│  └─ styles/main.css         layout 1920×1080, só transform/opacity nas animações
└─ test/                      testes (Vitest + happy-dom)
```

Decisões principais:

- **Sem framework:** DOM direto, sem dependências em tempo de execução, menos memória e CPU na TV.
- **Foco declarativo:** grupos (`data-focus-group`) com orientação e vizinhos explícitos, em vez de cálculo geométrico. É previsível, testável e cada fileira lembra o último card.
- **Telas empilhadas e ocultas** (não destruídas): voltar é instantâneo e restaura o foco pelo `data-key` do item.
- **Motor de vídeo plugável** (`VideoEngine`): AVPlay na TV, `<video>` no navegador, motor falso nos testes.
- **Capas:** só imagens que já existem nas pastas, exibidas como pôster vertical (2:3) nos cards, no banner e nos detalhes. Sem imagem, o placeholder é um gradiente com cor estável derivada do título. Nada de capas ou metadados inventados.

## Testes

```powershell
npm test         # 69 testes
npm run check    # typecheck + testes + build
```

Cobertura: persistência e recuperação do histórico, limite de assistido, registros corrompidos e cota cheia; agrupamento, ordenação e continuação de séries (próximo episódio, retomada, rever); montagem da tela inicial a partir do catálogo; gerenciador de foco (fileiras, grade, vizinhos, memória, camadas, restauração), Router (Voltar, sair só pela raiz) e diálogos; mapeamento das teclas Tizen e do teclado; parser WebVTT, sincronização após buscas, sanitização e escolha de legenda; Playback Service (salvamentos, erros sem apagar histórico, fim, troca de episódio); AVPlay com mock do ciclo de estados e erros; cliente da API (URLs, erros HTTP, rede e timeout).

> Os testes do AVPlay usam um **mock**. Eles garantem a lógica do app, **não** que a TV reproduz. O AVPlay só é validado no aparelho.

O backend (`../home-media-server`) tem os próprios testes para séries, legendas, capas e CORS: `npm test` lá.

## Limitações e codecs da Q60C

- **Sem transcodificação:** a TV recebe o arquivo como está. Segundo as especificações de multimídia publicadas pela Samsung para a linha 2023, o AVPlay costuma aceitar MKV, MP4, AVI, MOV e TS com vídeo H.264, HEVC (H.265), VP9 e AV1, e áudio AAC, MP3, AC-3 e E-AC-3 (Dolby Digital Plus, como o `DDP5.1` do seu filme do Mickey). **DTS geralmente não é suportado** em TVs Samsung recentes: o vídeo pode abrir sem som ou falhar. **Confirme no aparelho.**
- **Q60C é 4K/60 Hz:** remux 4K com bitrate muito alto pode travar em Wi-Fi fraco. Não há streaming adaptativo (HLS/DASH). Prefira cabo de rede no PC (já é o caso) e, se possível, na TV.
- **Legendas embutidas** no MKV não são listadas pelo app; só arquivos externos. O AVPlay pode exibir as internas por conta própria em alguns firmwares, o que não foi testado.
- **Uma TV, um histórico:** o progresso fica na TV. Outros aparelhos não compartilham o histórico, e a sincronização com o servidor está preparada mas não implementada.
- **Sem autenticação:** qualquer aparelho da rede local acessa o servidor (veja o README do backend).

## O que falta validar na TV

1. Instalação do `.wgt` assinado (certificado Samsung com o DUID da Q60C).
2. Reprodução via AVPlay dos três filmes atuais (MKV H.264, áudio Dolby/DDP), incluindo a retomada com `seekTo` logo após `prepareAsync`.
3. Origem enviada pelo app nas chamadas `fetch` (`null` ou `file://`, ambas liberadas no CORS).
4. Teclas de mídia (`registerKeyBatch`) e o botão Voltar em todas as telas, sem fechar o app indevidamente.
5. `suspend`/`restore` ao apertar Home e voltar ao app; persistência após desligar a TV da tomada.
6. Desempenho das animações e da rolagem suave das fileiras.
7. Legibilidade das legendas e dos textos a 2–3 m de distância.

## Solução de problemas

| Sintoma | Causa provável / solução |
|---|---|
| "Não foi possível conectar ao servidor" | Servidor desligado, IP mudou, firewall do Windows ou rede do PC marcada como Pública. Teste `http://IP:8080/health` no navegador do celular. |
| Conecta no navegador, mas não no app da TV | `CORS_ORIGINS` sem `null,file://` no `.env` do servidor (reinicie o servidor depois de alterar). |
| "A TV não suporta o formato deste vídeo" | Codec incompatível (ex.: áudio DTS). Seria preciso converter uma cópia do arquivo (ex.: com ffmpeg). |
| Legenda com acentos errados | Atualize o servidor: ele converte Windows-1252. Se persistir, salve o `.srt` como UTF-8. |
| `npm run package` falha | Perfil `HomeFlix` inexistente no Certificate Manager, ou o Tizen Studio não está em `C:\tizen-studio` (defina `TIZEN_STUDIO_HOME`). |
| `install:tv` falha | Developer Mode desligado, IP do PC errado no Developer Mode ou certificado sem o DUID da TV. |
