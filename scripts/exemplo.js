// Exemplo de script de automacao para um painel.
// Copie/renomeie para global.js ou panel-0.js .. panel-3.js para ativar
// (com "Permitir scripts de automacao" ligado no app).
// Executa no contexto da pagina do painel (DOM disponivel).

(function () {
  console.log('[idle-tabs] script carregado em', location.href);

  // Exemplo (descomente para usar):
  // setInterval(() => {
  //   const btn = document.querySelector('button.claim');
  //   if (btn) btn.click();
  // }, 60000);
})();
