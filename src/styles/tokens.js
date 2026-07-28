/* =========================================================================
   TOKENS VISUAIS — LOMUZ CONTROL
   Fonte única de verdade para cores, raios, sombras e tipografia.

   Os nomes oficiais da paleta (--primary, --text-primary, --success...) são
   os canônicos. Os nomes antigos (--brand, --ink, --positive...) continuam
   existindo como APELIDOS apontando para os novos, porque centenas de estilos
   inline no App.jsx já os usam — assim a nova paleta entra em vigor em todo o
   app sem reescrever o que já funciona.
   ========================================================================= */

export const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

.lomuz-app {
  /* --- paleta oficial --- */
  --sidebar:#18112B;
  --sidebar-hover:#241A3D;
  /* Dois roxos, de propósito: --primary é PREENCHIMENTO (precisa ser escuro o
     bastante para texto branco em cima) e --primary-text é o roxo usado COMO
     TEXTO/ícone (precisa contrastar com a superfície). No tema claro os dois
     coincidem; no escuro eles se separam, senão um dos dois falha no contraste. */
  --primary:#6D28D9;
  --primary-text:#6D28D9;
  --primary-hover:#5B21B6;
  --primary-light:#EDE9FE;
  --indigo:#4338CA;
  --chart-in:#6D28D9;
  --chart-out:#2563EB;
  --background:#F7F7FB;
  --surface:#FFFFFF;
  --surface-2:#F2F1F7;
  --text-primary:#17151F;
  --text-secondary:#667085;
  --text-on-dark:#FFFFFF;
  --text-on-dark-soft:#A7A3B5;
  --border:#EAECF0;
  --border-strong:#DDE1E7;
  --success:#15803D; --success-light:#DCFCE7;
  --warning:#D97706; --warning-light:#FEF3C7; --warning-strong:#92400E;
  --danger:#DC2626;  --danger-light:#FEE2E2;
  --info:#2563EB;    --info-light:#DBEAFE;
  --on-primary:#FFFFFF;
  --category-fallback:#7A6A58;
  --overlay-scrim:rgba(23,21,31,0.38);

  /* --- medidas --- */
  --radius-sm:10px; --radius:12px; --radius-lg:16px; --radius-pill:999px;
  --shadow-sm:0 1px 2px rgba(23,21,31,0.03);
  --shadow:0 1px 2px rgba(23,21,31,0.04);
  --shadow-lg:0 12px 32px -12px rgba(23,21,31,0.10);
  --gradient-brand:linear-gradient(135deg, #8B5CF6 0%, #6D28D9 50%, #4338CA 100%);

  /* --- escala de texto: uma família de tamanhos, em vez de meio-passos
     espalhados (11,5 / 12,5 / 13,5...) que vinham de ajustes pontuais --- */
  --fs-micro:11px; --fs-small:12px; --fs-body:13px;
  --fs-base:14px; --fs-title:15px; --fs-lg:17px;

  /* --- apelidos usados pelo código existente --- */
  --bg:var(--background);
  --ink:var(--text-primary);
  --ink-soft:var(--text-secondary);
  --brand:var(--primary);
  --brand-soft:var(--primary-light);
  --positive:var(--success);      --positive-soft:var(--success-light);
  --negative:var(--danger);       --negative-soft:var(--danger-light);
  --gold:var(--warning);          --gold-soft:var(--warning-light);
  --gold-strong:var(--warning-strong);

  font-family:'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
  color:var(--text-primary);
  background:var(--background);
  -webkit-font-smoothing:antialiased;
}

/* Tema escuro — a área principal escurece, mantendo a identidade roxa.
   O menu lateral já é escuro nos dois temas, por isso não muda aqui. */
.lomuz-app.lomuz-dark {
  /* #7C3AED como preenchimento: branco em cima dá 5,7:1.
     #A78BFA como texto: sobre a superfície escura dá 6,2:1. */
  --primary:#7C3AED;
  --primary-text:#A78BFA;
  --primary-hover:#8B5CF6;
  --primary-light:#2E2547;
  --indigo:#818CF8;
  --chart-in:#A78BFA;
  --chart-out:#60A5FA;
  --background:#14121C;
  --surface:#1E1B29;
  --surface-2:#292435;
  --text-primary:#F2F0F7;
  --text-secondary:#A7A3B5;
  --border:#2E2840;
  --border-strong:#3A3350;
  --success:#4ADE80; --success-light:#14321F;
  --warning:#FBBF24; --warning-light:#3A2C0C; --warning-strong:#FBBF24;
  --danger:#F87171;  --danger-light:#3B1D1D;
  --info:#60A5FA;    --info-light:#152744;
  --overlay-scrim:rgba(0,0,0,0.55);
  --shadow-sm:0 1px 2px rgba(0,0,0,0.22);
  --shadow:0 1px 2px rgba(0,0,0,0.26);
  --shadow-lg:0 12px 32px -12px rgba(0,0,0,0.45);
}

/* Números grandes: Inter apertada e alinhada em colunas, em vez de serifada
   decorativa — mais adequado a quem passa o dia lendo valores. */
.lomuz-app .lomuz-display {
  font-weight:800;
  letter-spacing:-0.02em;
  font-variant-numeric:tabular-nums;
}
.lomuz-app .lomuz-num { font-variant-numeric:tabular-nums; }

.lomuz-app * { box-sizing:border-box; }

/* Texto só para leitor de tela (resumo de gráfico, rótulos auxiliares). */
.lomuz-sr-only {
  position:absolute; width:1px; height:1px; padding:0; margin:-1px;
  overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0;
}
.lomuz-app ::-webkit-scrollbar { height:8px; width:8px; }
.lomuz-app ::-webkit-scrollbar-thumb { background:var(--border); border-radius:var(--radius-pill); }
.lomuz-app input, .lomuz-app select, .lomuz-app textarea, .lomuz-app button { outline:none; }
.lomuz-app input:focus, .lomuz-app select:focus, .lomuz-app textarea:focus {
  border-color:var(--primary); box-shadow:0 0 0 3px var(--primary-light);
}
.lomuz-app button { font-family:inherit; }
.lomuz-app button:focus-visible, .lomuz-app a:focus-visible, .lomuz-app [tabindex]:focus-visible {
  outline:2px solid var(--primary); outline-offset:2px; border-radius:4px;
}
/* Foco visível também sobre o menu escuro, onde o roxo tem pouco contraste. */
.lomuz-sidebar button:focus-visible, .lomuz-sidebar a:focus-visible {
  outline:2px solid #C4B5FD; outline-offset:2px;
}

@keyframes lomuzSlideUp { from { transform:translateY(24px); opacity:0; } to { transform:translateY(0); opacity:1; } }
@keyframes lomuzFadeIn { from { opacity:0; } to { opacity:1; } }
@keyframes lomuzPulse { 0%,100% { opacity:1; } 50% { opacity:0.45; } }
.lomuz-skeleton {
  background:var(--surface-2); border-radius:var(--radius-sm);
  animation:lomuzPulse 1.4s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .lomuz-app *, .lomuz-app *::before, .lomuz-app *::after {
    animation-duration:0.001ms !important;
    animation-iteration-count:1 !important;
    transition-duration:0.001ms !important;
  }
}

/* Coluna central usada pelo layout mobile (mantida para telas pequenas). */
.lomuz-shell { max-width:480px; }
@media (min-width: 640px) { .lomuz-shell { max-width:600px; } }

/* --- cabeçalho com navegação horizontal --- */
.lomuz-topbar {
  display:flex; align-items:center; gap:20px;
  width:100%; max-width:1440px; margin:0 auto; padding:12px 28px;
}
.lomuz-topnav { display:flex; align-items:center; gap:4px; flex-wrap:nowrap; overflow-x:auto; }
.lomuz-topnav::-webkit-scrollbar { height:0; }

/* No celular a navegação horizontal sai e quem navega é a barra inferior. */
@media (max-width: 900px) {
  .lomuz-topbar { padding:10px 16px; gap:12px; }
  .lomuz-topnav { display:none; }
  .lomuz-bottomnav { display:block; }
}
@media (min-width: 901px) {
  /* No desktop a barra inferior sai de cena: navegação fica no topo. */
  .lomuz-bottomnav { display:none; }
}
@media (max-width: 420px) {
  /* Em telas bem estreitas o nome do usuário some e fica só o avatar. */
  .lomuz-user-text { display:none !important; }
}

/* Área de conteúdo do layout desktop: usa a largura disponível, com um teto
   confortável para leitura de tabelas e gráficos. */
.lomuz-content { width:100%; max-width:1440px; margin:0 auto; padding:24px 28px 40px; }
@media (max-width: 900px) { .lomuz-content { padding:16px 16px 96px; } }

/* Grade dos cards: 4 colunas no desktop, 2 no tablet, 1 no celular. */
.lomuz-kpi-grid { display:grid; gap:16px; grid-template-columns:repeat(4, minmax(0,1fr)); }
@media (max-width: 1180px) { .lomuz-kpi-grid { grid-template-columns:repeat(2, minmax(0,1fr)); } }
@media (max-width: 560px)  { .lomuz-kpi-grid { grid-template-columns:1fr; } }

/* Gráfico + coluna lateral de vencimentos. */
.lomuz-main-grid { display:grid; gap:16px; grid-template-columns:minmax(0,2fr) minmax(0,1fr); margin-top:16px; }
@media (max-width: 1180px) { .lomuz-main-grid { grid-template-columns:1fr; } }

/* Tabelas nunca quebram a página: rolam dentro do próprio container. */
.lomuz-table-wrap { width:100%; overflow-x:auto; }
.lomuz-table { width:100%; border-collapse:collapse; font-size:13px; min-width:640px; }
.lomuz-table th {
  text-align:left; font-size:11px; font-weight:700; text-transform:uppercase;
  letter-spacing:0.04em; color:var(--text-secondary);
  padding:10px 14px; border-bottom:1px solid var(--border); white-space:nowrap;
}
.lomuz-table td {
  padding:12px 14px; border-bottom:1px solid var(--border);
  color:var(--text-primary); vertical-align:middle;
}
.lomuz-table tbody tr:last-child td { border-bottom:none; }
.lomuz-table tbody tr:hover td { background:var(--surface-2); }
`;
