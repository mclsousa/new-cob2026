# Melhorias Aplicadas — Ferramenta de Cobrança

## 8. Redesign (design system Dataviz) e novas funções

- **Visual:** tema claro padrão + escuro; roxo `#5E17EB`, Roboto, cards com
  raio pequeno. Tokens em `index.html`; componentes base em `components/ui.tsx`
  e gráficos SVG em `components/charts.tsx`.
- **Páginas:** Painel (KPIs, vencimentos 14 dias, recebimentos 30 dias,
  carteira), Cobranças, Clientes (tabela), Histórico (30 dias), Configurações.
  Importar lista virou modal.
- **Pagamentos:** botão "Pago" registra valor/plano, renova o vencimento no
  banco e envia o recibo (substitui "Gerar Recibo"). Chave `payments` no
  sync/backup. O banco mantém o vencimento mais novo ao reprocessar.
- **Filtros unificados:** Hoje / Amanhã (sexta = fim de semana) / Vencidos
  4–5d / 7 dias / Personalizado + tipo, status e etiqueta.
- **Removidos:** modo anti-ban e links rápidos.
- **Previsão de receita** (Painel): 7 e 30 dias + "a recuperar", pelo último
  pagamento de cada titular (sem histórico: 1º plano da tabela).
- **Ficha do cliente**: plano, total pago, risco e linha do tempo (90 dias).
- **Em risco** (automático): 2+ cobranças em dias diferentes sem pagamento depois,
  ou 2+ pagamentos atrasados entre os 6 últimos (`riskByName`).
- **Notificações** (aba própria): resumo diário no horário escolhido (o que
  incluir: vencidos, amanhã, em risco), lembretes agendados por push e faixa ao
  abrir o app. `api/daily.ts` roda de hora em hora pelo GitHub Actions
  (`.github/workflows/notify.yml`, plano gratuito da Vercel só agenda 1x/dia);
  inscrição em `api/push.ts`, `public/sw.js`. APK: delegação de notificações do
  TWA. Envs: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET (também como
  segredo no GitHub). Requer a sincronização ligada.
- Recibo foi para a aba Mensagens. Revisão de espaçamento mobile/web: filtros em
  grade (`ChipGroup`), cards em duas colunas independentes, texto das etiquetas
  com contraste automático.
- Selo "Enviado" dura 12h. Importar arquivo substitui o anterior do mesmo tipo
  (`mergeImport`). Nome/cidade do PIX removidos (copia e cola usa padrão).

---

## 7. Sincronização na nuvem e PIX copia e cola

- **Sincronização:** Configurações → Geral → "Sincronização na nuvem". Dados no
  Upstash Redis (`tvbrcob-sync`, região gru1) via `api/sync.ts`; senha na env
  `SYNC_PASSWORD` da Vercel (trocar = `vercel env rm/add` + redeploy).
  Envia 2s após cada alteração, baixa ao abrir/voltar para a aba. Conflito:
  vence o que chegou primeiro na nuvem.
- **PIX copia e cola:** nome e cidade nas Configurações; variável
  `{pix_copia_cola}` (valor do 1º plano da tabela, sozinha numa linha) e botão
  de copiar o código no card. Anti-ban não altera essa linha.

---

## 6. Revisão de bugs

- Link do WhatsApp agora sempre leva o DDI 55 (antes `21 9...` abria número errado).
- Modo anti-ban não insere caracteres invisíveis dentro da chave PIX/links.
- Lembrete disparava um dia antes (data lida em UTC) — corrigido.
- IDs estáveis: a marca "Enviado" sobrevive a reprocessar/recarregar; mesmo
  cliente carregado 2x não duplica.
- Modo Foco: sem tela branca quando a lista encolhe; Fila avança 1 por vez e
  mostra o relatório de envio manual ao terminar.
- localStorage corrompido ou cheio não derruba mais o app; notificações não
  quebram em navegadores sem suporte (iOS).
- Recibo: valor vazio não vira "R$ NaN"; 31/01 + 1 mês = 28/02.
- Spin `{a|b}` não come mais variáveis como `{pix}`.
- Colar/Arquivo/Banco separam blocos e mantêm o tipo IPTV/P2P.
- Links rápidos só abrem http(s). Ícones Tabler trocados por Lucide.
- Removidos: `PaymentModal` (não usado), dependência `uuid`, define do Gemini.
- `npm run check`: auto-teste da lógica crítica.

---

## 5. Novo formato de relatório (relatorio-iptv.csv / relatorio-p2p.csv)

- `normalizeCsvIfNeeded()` reconhece o relatório do painel pelo cabeçalho
  (`Login`, `Vencimento`, `Notas`...) e lê as colunas pelo nome.
- As colunas de flag (`Teste/Habilitado/Telas`, `Tipo/Status`) não vão mais
  parar nas notas. Antes elas poluíam o telefone extraído.
- Contas de teste (`Teste=1` / `Tipo=0`) e linhas sem vencimento são ignoradas.
- Remove BOM e o `'` que o Excel coloca antes do `+55`.
- O tipo (IPTV/P2P) vem do arquivo: dá para carregar os dois na mesma lista.

---

Todas as mudanças foram pensadas para refletir o documento de instruções
(disparo diário via WhatsApp, regras de calendário, validação de números
e relatório final de envio manual).

---

## 1. Regras de calendário (sábado e sexta-feira)

**Por quê:** o documento exige que sábado seja **bloqueado** e que sexta
filtre automaticamente um intervalo maior (amanhã + depois de amanhã,
para cobrir o sábado em que não se dispara).

**O que foi feito:**

- Novo módulo `utils/calendar.ts` com `getWeekdayContext()` e
  `getUpcomingRange()`. A regra fica num único lugar, fácil de testar e
  alterar.
- O App passa a recalcular o contexto a cada minuto (`setInterval`),
  então se a aba ficar aberta passando da meia-noite o estado ajusta
  sozinho.
- Sábado: banner vermelho na entrada, botões **Próximos**, **Foco** e
  **Fila** ficam **desabilitados** e mostram tooltip explicando.
- Sexta: banner amarelo de aviso. O botão **Próximos** muda o rótulo
  dinamicamente (`Próximos (Amanhã + Depois)`) e usa o range de 2 dias.
- Demais dias: o filtro **Próximos** vira **só amanhã** (start = end =
  amanhã). Antes, o range era `amanhã → depois de amanhã` em todos os
  dias, o que não batia com o documento.

---

## 2. Entrada de dados mais flexível

**Por quê:** você queria continuar colando, mas também ter detecção
automática do formato e poder carregar arquivo.

**O que foi feito:**

- Botão novo **Arquivo** ao lado de **Colar**. Aceita `.csv`, `.txt` e
  `.tsv`. O conteúdo é anexado ao final da textarea (não substitui o
  que já estava lá).
- Nova função `normalizeCsvIfNeeded()` em `utils/parser.ts`. Detecta
  CSV pelo número de separadores na primeira linha (`;` ou `,`) e
  converte para texto separado por espaço, reaproveitando o parser
  existente. Aplicada tanto no **Colar** quanto no **Arquivo**.
- `detectInputType()` ficou mais inteligente: além do cabeçalho
  `Clientes P2P`, agora considera P2P quando mais de 50% das primeiras
  linhas têm 2+ datas (padrão típico do Elite).

---

## 3. Validação de número e relatório de envio manual

**Por quê:** o documento descreve que para cada cliente com número
inválido você precisa **registrar nome + número** e mostrar um alerta
no final. Antes não havia nada disso na ferramenta.

**O que foi feito:**

- Novo módulo `utils/phone.ts` com `validatePhone()`. Checa:
  - Tamanho (10–11 dígitos sem DDI, 12–13 com 55).
  - DDDs brasileiros válidos (lista completa, 11 a 99 reais).
  - Celular precisa começar com 9 após o DDD.
  - Rejeita zeros repetidos e sequências do mesmo dígito.
- Nova função `extractPhoneValidated()` em `utils/helpers.ts` que une
  a extração de telefone existente com a validação.
- Quando você inicia o **Modo Foco** ou a **Fila**, a app pré-valida
  todos os números **antes de abrir qualquer aba**. Os inválidos vão
  para a lista `invalidClients`. Você é avisado por toast logo ao
  iniciar.
- Novo modal `Envio Manual Necessário` que aparece automaticamente:
  - Ao final da fila (quando você passa do último).
  - Ao sair do Modo Foco (botão de fechar).
  - Lista nome + telefone + motivo da invalidação (ex: “DDD 95
    inválido”, “celular sem 9”, “tamanho inválido”).
  - Botão **Copiar lista** que joga no clipboard no formato exato do
    exemplo do documento:
    ```
    ⚠️ ENVIO MANUAL NECESSÁRIO:
    - João Silva | (11) 99999-9999 (motivo)
    ```

---

## 4. Pequenos ajustes de UX consequentes

- O toast inicial no filtro **Próximos** agora informa o que está
  filtrando (ex: “Sexta-feira: filtrando amanhã + depois de amanhã.”).
- O toast inicial na **Fila** agora menciona quantos clientes terão
  envio manual, se houver.
- Tooltips explicam por que botões estão desabilitados aos sábados.

---

## Arquivos novos

- `utils/calendar.ts` — regras de dia da semana
- `utils/phone.ts` — validação BR

## Arquivos modificados

- `App.tsx` — imports, estado weekday/inválidos, handlers
  `handleFilterUpcoming`, `handlePasteInput`, `handleFileUpload`,
  `startFocusMode`, `handleFocusNext`, `stopFocusMode`. UI: banners de
  calendário, botão de upload, modal de relatório, disabled nos botões
  de disparo.
- `utils/parser.ts` — `detectInputType` mais robusta + nova
  `normalizeCsvIfNeeded`.
- `utils/helpers.ts` — re-export `validatePhone`, nova
  `extractPhoneValidated`.

## Como aplicar

1. Substitua os arquivos pelos desta versão (ou faça merge dos diffs).
2. `npm install` (sem dependências novas).
3. `npm run dev`.

Type-check (`npx tsc --noEmit`) está limpo.

---

## O que **não** foi feito (e por quê)

- **Login/exportação automática no AdminX** (Passo 1 do documento) — é
  automação de browser externo (Playwright/Selenium ou agente),
  fora do escopo desta SPA. A app passa a aceitar arquivo CSV/TXT
  exatamente para você plugar essa parte por fora se quiser.
- **Abrir o WhatsApp Web em sequência sem clicar** — bloqueado pelos
  navegadores: `window.open` em loop sem gesto do usuário é bloqueado
  por popup blocker. O Modo Fila atual (clicar uma vez por cliente,
  com auto-avanço entre eles) é o melhor que dá para fazer dentro de
  uma SPA.
- **Detecção real de “número não é WhatsApp”** — só o WhatsApp Web
  sabe disso depois que abre a conversa. A pré-validação cobre os
  casos óbvios; o resto continua dependendo da sua confirmação manual
  na tela do WhatsApp.
