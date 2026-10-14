# Idle Tabs

App desktop para Windows que exibe uma grade de **4 painéis**, cada um carregando a página web de um jogo idle de navegador. Cada painel tem **sessão isolada** (cookies, localStorage, cache), permitindo logar em 4 contas diferentes ao mesmo tempo.

## Recursos
- Grade 2x2, redimensionável, tema escuro, interface em português.
- Campo para colar o link do jogo + botão "Recarregar" em cada painel.
- Links e nomes salvos localmente entre sessões (`config.json` em `%APPDATA%/idle-tabs/`).
- Botão "Limpar sessão" por painel (apaga cookies/dados da conta).
- Ganchos para automação futura (desativados por padrão).

## Pré-requisitos
- Windows 10/11 (64-bit).
- Node.js LTS (recomendado 18 ou superior): https://nodejs.org
- Internet para o primeiro `npm install`.

## Como rodar em desenvolvimento
```bash
cd idle-tabs
npm install
npm start
```

O app abre a janela principal. Cole o link de um jogo idle em cada painel e clique em "Recarregar".

## Como compilar (.exe para Windows)
```bash
npm run build
```
Gera em `./dist/`:
- `Idle Tabs Setup x.x.x.exe` (instalador NSIS)
- `Idle Tabs x.x.x.exe` (portable)

Variantes:
```bash
npm run build:nsis       # apenas instalador
npm run build:portable   # apenas portable
```

### Observações sobre o build
- O build não é assinado. O Windows SmartScreen pode exibir aviso na primeira execução — clique em "Mais informações" → "Executar mesmo assim".
- Ícone customizado: coloque `build/icon.ico` e referencie em `package.json` se desejar.

## Sessões isoladas
Cada painel usa uma partição persistente própria:
- Painel 1 → `persist:panel0`
- Painel 2 → `persist:panel1`
- Painel 3 → `persist:panel2`
- Painel 4 → `persist:panel3`

Isso garante cookies e armazenamento separados, permitindo 4 logins do mesmo site simultaneamente.

## Segurança
- `contextIsolation` ativado, `nodeIntegration` desativado, `sandbox` ativado.
- Links externos (pop-ups) abrem no navegador padrão do sistema.
- Somente URLs `http/https` são carregadas.

## Automação futura (desativada por padrão)
Por padrão não há automação. Para habilitar:
1. Marque "Permitir scripts de automação" no app.
2. Crie arquivos em `%APPDATA%/idle-tabs/scripts/`:
   - `global.js` → injetado em todos os painéis.
   - `panel-0.js` … `panel-3.js` → injetado no painel correspondente (0 a 3).
3. Um `exemplo.js` é criado automaticamente na primeira execução.
4. Também é possível chamar `window.api.executeScript(panelIndex, codigo)` pelo próprio app (ganchos para futuras versões).

Scripts rodam no contexto da página do painel (DOM daquela conta) e não são compartilhados entre contas.

## Estrutura de arquivos
```
idle-tabs/
├─ package.json
├─ main.js
├─ preload.js
├─ renderer/
│  ├─ index.html
│  ├─ styles.css
│  └─ app.js
├─ scripts/
│  └─ exemplo.js
└─ README.md
```

## Solução de problemas
- **Site não carrega / tela em branco**: pode ser bloqueio por X-Frame? Webview não usa iframe; geralmente funciona. Tente "Recarregar".
- **Login não persiste**: verifique se clicou em "Limpar sessão" por engano; as sessões são persistentes por partição.
- **SmartScreen**: veja seção de build.
- **Erro de módulo ao rodar**: execute `npm install` novamente.


## Maximizar, ocultar e layout (Fase 2)
- Barra superior: seletor de layout (2×2, 1×4, 4×1), quantidade de painéis exibidos (4/2/1) e botão Restaurar grade.
- Cada painel tem botões Maximizar e Ocultar. Painéis ocultos/maximizados continuam funcionando (background throttling desativado).
- Clique no painel o marca como foco (usado no modo 1 painel).
- O preset de layout é salvo entre sessões; maximização/ocultação voltam ao padrão ao abrir.


## Janelas auxiliares
- Ative 'Abrir links em nova janela' para que cliques em links abram uma janela interna do app, compartilhando a conta do painel de origem.
- Janelas auxiliares podem ser fechadas livremente; os painéis principais permanecem intactos.


## Janelas auxiliares (botão/menu)
- Cada painel possui botão 'Nova janela' que abre a página atual em uma janela auxiliar com a mesma conta.
- Clique com o botão direito em um link/página para abrir em nova janela, copiar link ou recarregar.
- Pop-ups (window.open/	arget=_blank) abrem internamente com a mesma sessão.
