import React, { useState, useEffect, useRef } from 'react';
import { Home, Receipt, TrendingUp, Settings, Bell, LogOut, ChevronDown, Users, BarChart3, HelpCircle, ArrowUpCircle, ArrowDownCircle, Layers } from 'lucide-react';
import { LogoHorizontal } from '../brand/Logo.jsx';

/* =========================================================================
   APP SHELL — cabeçalho com navegação horizontal

   Decisão de layout (analisada, não copiada da referência):
   a referência usava menu lateral, mas numa tela financeira a largura é o
   recurso escasso — tabelas e gráficos é que precisam dela. Uma lateral de
   ~248px consome 18% de um notebook de 1366px. Por isso a navegação vai na
   horizontal dentro do cabeçalho no desktop, devolvendo a largura inteira ao
   conteúdo, e no celular continua a navegação inferior que já existia
   (alcançável com o polegar e já testada).
   ========================================================================= */

// Só entram itens que levam a uma página real — nada de item decorativo.
export function navItemsFor(role) {
  // Vendedor só lança venda, então pra ele a seção é uma só e se chama "Vendas".
  if (role === 'vendedor') {
    return [
      { key: 'inicio', label: 'Visão geral', icon: Home },
      { key: 'receitas', label: 'Vendas', icon: Receipt },
      { key: 'previsao', label: 'Previsão', icon: TrendingUp },
      { key: 'clientes', label: 'Clientes', icon: Users },
      { key: 'config', label: 'Configurações', icon: Settings },
    ];
  }
  // "Receitas" e "Despesas" em vez de um "Lançamentos" com filtro de tipo: são
  // as duas perguntas que se faz na prática ("quanto entrou", "quanto saiu") e
  // são as palavras que o resto do app já usa — categoria é do tipo receita ou
  // despesa, o formulário diz Receita/Despesa. "Entradas/Saídas" seria um
  // segundo vocabulário pra mesma coisa, e impreciso: a lista mostra o
  // lançamento mesmo antes de o dinheiro entrar ou sair.
  //
  // São 7 seções, o teto desta barra (no celular são 7 ícones dividindo ~317px).
  //
  // A ordem segue o caminho de uso: onde estou (Início), o que aconteceu
  // (Receitas, Despesas), com quem (Clientes), o que isso quer dizer
  // (Relatórios) e só então o que sustenta tudo (Cadastros, Configurações).
  //
  // "Cadastros" existe como seção própria porque os seis cadastros de apoio
  // moravam dentro de "Clientes" — ninguém procura Categorias ou Índice de
  // reajuste clicando em Clientes. Pra abrir espaço, Previsão virou aba de
  // Relatórios: projeção é análise, não operação do dia.
  return [
    { key: 'inicio', label: 'Início', icon: Home },
    { key: 'receitas', label: 'Receitas', icon: ArrowUpCircle, tint: 'var(--success)' },
    { key: 'despesas', label: 'Despesas', icon: ArrowDownCircle, tint: 'var(--danger)' },
    { key: 'clientes', label: 'Clientes', icon: Users },
    { key: 'relatorios', label: 'Relatórios', icon: BarChart3 },
    { key: 'cadastros', label: 'Cadastros', icon: Layers },
    { key: 'config', label: 'Configurações', icon: Settings },
  ];
}

const navBtnStyle = (active) => ({
  display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px',
  borderRadius: 'var(--radius-pill)', border: 'none', cursor: 'pointer',
  background: active ? 'var(--primary)' : 'transparent',
  color: active ? 'var(--on-primary)' : 'var(--text-secondary)',
  fontSize: 'var(--fs-body)', fontWeight: active ? 700 : 600, whiteSpace: 'nowrap',
  transition: 'background .15s, color .15s',
});
const navHoverIn = (active) => (e) => {
  if (active) return;
  e.currentTarget.style.background = 'var(--surface-2)';
  e.currentTarget.style.color = 'var(--text-primary)';
};
const navHoverOut = (active) => (e) => {
  if (active) return;
  e.currentTarget.style.background = 'transparent';
  e.currentTarget.style.color = 'var(--text-secondary)';
};

function TopNavItem({ item, active, onClick }) {
  const Icon = item.icon;
  // Receitas e Despesas carregam a cor do que significam (verde entra, vermelho
  // sai) enquanto estão inativas — é a leitura mais rápida da barra inteira.
  // Ativo não recebe tinta: ali o fundo já é roxo e o ícone precisa de branco.
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      style={navBtnStyle(active)}
      onMouseEnter={navHoverIn(active)}
      onMouseLeave={navHoverOut(active)}
    >
      <Icon
        size={17}
        strokeWidth={active ? 2.3 : 1.9}
        style={{ flexShrink: 0, color: active ? undefined : item.tint }}
      />
      {item.label}
    </button>
  );
}

// Item de menu que abre uma lista — usado por "Cadastros", que reúne 5
// cadastros diferentes. Sem custo de largura: a lista só existe ao abrir,
// então a decisão de não ter menu lateral (ver topo do arquivo) segue valendo.
function TopNavMenuItem({ item, active, subItems, activeSubKey, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const Icon = item.icon;

  useEffect(() => {
    if (!open) return;
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    function onEsc(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-current={active ? 'page' : undefined}
        style={navBtnStyle(active)}
        onMouseEnter={navHoverIn(active)}
        onMouseLeave={navHoverOut(active)}
      >
        <Icon size={17} strokeWidth={active ? 2.3 : 1.9} style={{ flexShrink: 0 }} />
        {item.label}
        <ChevronDown size={15} style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', left: 0, top: 'calc(100% + 6px)', minWidth: 210, zIndex: 60,
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-lg)', padding: 6, animation: 'lomuzFadeIn .12s ease-out',
          }}
        >
          {subItems.map((sub) => {
            const subAtivo = active && activeSubKey === sub.key;
            return (
              <button
                key={sub.key}
                role="menuitem"
                onClick={() => { setOpen(false); onSelect(sub.key); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px',
                  background: subAtivo ? 'var(--surface-2)' : 'transparent', border: 'none',
                  borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  color: subAtivo ? 'var(--primary-text)' : 'var(--text-primary)',
                  fontSize: 'var(--fs-body)', fontWeight: subAtivo ? 700 : 600,
                }}
                onMouseEnter={(e) => { if (!subAtivo) e.currentTarget.style.background = 'var(--surface-2)'; }}
                onMouseLeave={(e) => { if (!subAtivo) e.currentTarget.style.background = 'transparent'; }}
              >
                {sub.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UserMenu({ nome, role, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const inicial = (nome || '?').trim().charAt(0).toUpperCase();

  useEffect(() => {
    if (!open) return;
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    function onEsc(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Conta de ${nome}`}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, background: 'transparent',
          border: 'none', cursor: 'pointer', padding: 4, borderRadius: 'var(--radius)', color: 'var(--text-primary)',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 34, height: 34, borderRadius: '50%', background: 'var(--gradient-brand)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 14, flexShrink: 0,
          }}
        >
          {inicial}
        </span>
        <span className="lomuz-user-text" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.2, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome}</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{role === 'admin' ? 'Administrador' : 'Vendedor'}</span>
        </span>
        <ChevronDown size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)', minWidth: 200, zIndex: 60,
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-lg)', padding: 6, animation: 'lomuzFadeIn .12s ease-out',
          }}
        >
          <div style={{ padding: '8px 12px 10px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{nome}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{role === 'admin' ? 'Administrador' : 'Vendedor'}</div>
          </div>
          <button
            role="menuitem"
            onClick={() => { setOpen(false); onLogout(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 12px',
              background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)',
              color: 'var(--danger)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', textAlign: 'left',
            }}
          >
            <LogOut size={15} /> Sair da conta
          </button>
        </div>
      )}
    </div>
  );
}

function AlertsBell({ alerts, onAlertClick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    function onEsc(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={alerts.length > 0 ? `Avisos: ${alerts.length} pendente(s)` : 'Avisos: nenhum'}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          position: 'relative', background: 'transparent', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', width: 38, height: 38, cursor: 'pointer',
          color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Bell size={18} />
        {alerts.length > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, padding: '0 4px',
              borderRadius: 999, background: 'var(--danger)', color: '#fff',
              fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid var(--surface)',
            }}
          >
            {alerts.length}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 290, maxWidth: 'calc(100vw - 32px)', zIndex: 60,
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-lg)', padding: 6, animation: 'lomuzFadeIn .12s ease-out',
          }}
        >
          {alerts.length === 0 ? (
            <p style={{ margin: 0, padding: '14px 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
              Nenhum aviso no momento.
            </p>
          ) : (
            alerts.map((a, i) => (
              <button
                key={i}
                role="menuitem"
                onClick={() => { setOpen(false); if (onAlertClick) onAlertClick(a); }}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', textAlign: 'left',
                  padding: '10px 12px', background: 'transparent', border: 'none',
                  borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-primary)',
                  fontSize: 13, lineHeight: 1.45,
                }}
              >
                <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: a.tone === 'danger' ? 'var(--danger)' : 'var(--warning)', marginTop: 5, flexShrink: 0 }} />
                <span>{a.text}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function AppShell({
  role, nome, page, setPage, onLogout,
  pageTitle, pageSubtitle,
  alerts = [], onAlertClick,
  // activeSubKey é um mapa { chaveDaSeção: subAbaAtiva } porque hoje duas
  // seções têm submenu (Cadastros e Relatórios) e cada uma guarda a sua.
  submenus = {}, activeSubKey = {}, onSubSelect,
  children,
}) {
  const items = navItemsFor(role);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)' }}>
      <header
        style={{
          position: 'sticky', top: 0, zIndex: 50, background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="lomuz-topbar">
          <LogoHorizontal tone="light" size={32} />

          <nav aria-label="Navegação principal" className="lomuz-topnav">
            {items.map((it) => (
              submenus[it.key] ? (
                <TopNavMenuItem
                  key={it.key}
                  item={it}
                  active={page === it.key}
                  subItems={submenus[it.key]}
                  activeSubKey={activeSubKey?.[it.key]}
                  onSelect={(subKey) => { onSubSelect(it.key, subKey); setPage(it.key); }}
                />
              ) : (
                <TopNavItem key={it.key} item={it} active={page === it.key} onClick={() => setPage(it.key)} />
              )
            ))}
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto', flexShrink: 0 }}>
            {/* Fica no cabeçalho, não no menu: a barra de navegação some no
                celular, e a ajuda precisa estar sempre a um toque. */}
            <button
              onClick={() => setPage('ajuda')}
              aria-label="Ajuda"
              aria-current={page === 'ajuda' ? 'page' : undefined}
              title="Ajuda"
              style={{
                background: page === 'ajuda' ? 'var(--primary)' : 'transparent',
                border: page === 'ajuda' ? '1px solid var(--primary)' : '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', width: 38, height: 38, cursor: 'pointer',
                color: page === 'ajuda' ? '#fff' : 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}
            >
              <HelpCircle size={18} />
            </button>
            <AlertsBell alerts={alerts} onAlertClick={onAlertClick} />
            <UserMenu nome={nome} role={role} onLogout={onLogout} />
          </div>
        </div>
      </header>

      <main>
        <div className="lomuz-content">
          <div style={{ marginBottom: 20 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
              {pageTitle}
            </h1>
            {pageSubtitle && (
              <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--text-secondary)' }}>{pageSubtitle}</p>
            )}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
