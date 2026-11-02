# Decisões de arquitetura

Registro curto das decisões que não são óbvias pelo código. Ao tomar uma decisão relevante, acrescente uma entrada.

| # | Decisão | Motivo | Consequência |
|---|---|---|---|
| 1 | Servidor **somente leitura** sobre `MEDIA_ROOT` | Proteger a coleção do usuário | Nada de gerar miniaturas, renomear ou converter arquivos no lugar |
| 2 | **Sem transcodificação** | Simplicidade e desempenho do PC; a TV decodifica MKV/H.264/HEVC/AC-3 | Arquivos com codecs não suportados (ex.: DTS) não tocam |
| 3 | ID de vídeo = hash do caminho relativo | Estável entre scans e reinícios, sem banco de dados | Mover ou renomear arquivo perde o histórico daquele vídeo |
| 4 | Classificação de séries **conservadora** | Melhor um episódio como filme do que um filme virando episódio | Casos ambíguos usam `METADATA_OVERRIDES_FILE` |
| 5 | Legendas convertidas no servidor para **WebVTT UTF-8** | Legendas brasileiras em Windows-1252; um único formato no app | O app só precisa de um parser simples |
| 6 | Legendas **desenhadas pelo app**, não pelo AVPlay | `setExternalSubtitlePath` exige arquivo local na TV | Sincronização por polling de 250 ms + atualização após busca |
| 7 | App **sem framework** de UI | Memória e CPU limitadas na TV; bundle de cerca de 22 KB gzip | DOM manual com `h()`; telas como classes |
| 8 | Foco **declarativo** (grupos + vizinhos) em vez de geométrico | Previsível e testável sem layout real | Toda tela declara seus grupos |
| 9 | Bundle **IIFE** com `<script defer>` | `file://` bloqueia módulos ES no Tizen | Sem code splitting |
| 10 | Histórico no **localStorage da TV** | Funciona offline, sem conta; sobrevive a desligar a TV | Não sincroniza entre aparelhos (formato preparado com `updatedAt`/`revision`) |
| 11 | Salvamento **periódico** (10 s) além de eventos | A TV pode ser desligada sem evento de encerramento | Perde no máximo cerca de 10 s |
| 12 | IPTV: servidor lê a lista; **TV toca o stream direto** | Não sobrecarregar o PC nem a LAN | Streams com cabeçalhos especiais ou DRM não tocam |
| 13 | IPTV entregue **por categoria**, aba separada | Listas com dezenas de MB travavam a abertura do app | A tela inicial nunca carrega canais |
| 14 | Nome exibido "MultiFlix", ID do pacote mantido | Trocar o ID instalaria outro app e apagaria o histórico | Nome interno do projeto continua `homeflix` |
| 15 | `AGENTS.md` como fonte única para agentes de IA | Padrão aberto lido por várias ferramentas | `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, Copilot só apontam para ele |
