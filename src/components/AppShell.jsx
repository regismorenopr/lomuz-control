import React, { useState, useEffect, useRef } from 'react';
import { Home, Receipt, TrendingUp, Tag, Settings, Bell, LogOut, ChevronDown } from 'lucide-react';
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
  const base = [
    { key: 'inicio', label: 'Visão geral', icon: Home },
    { key: 'lancamentos', label: role === 'vendedor' ? 'Vendas' : 'Lançamentos', icon: Receipt },
    { key: 'previsao', label: 'Previsão', icon: TrendingUp },
  ];
  if (role !== 'vendedor') base.push({ key: 'categorias', label: 'Categorias', icon: Tag });
  base.push({ key: 'config', label: 'Configurações', icon: Settings });
  return base;
}

function TopNavItem({ item, active, onClick }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px',
        borderRadius: 'var(--radius-pill)', border: 'none', cursor: 'pointer',
        background: active ? 'var(--primary)' : 'transparent',
        color: active ? '#fff' : 'var(--text-secondary)',
        fontSize: 13.5, fontWeight: active ? 700 : 600, whiteSpace: 'nowrap',
        transition: 'background .15s, color .15s',
      }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; } }}
    >
      <Icon size={17} strokeWidth={active ? 2.3 : 1.9} style={{ flexShrink: 0 }} />
      {item.label}
    </button>
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
              <TopNavItem key={it.key} item={it} active={page === it.key} onClick={() => setPage(it.key)} />
            ))}
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto', flexShrink: 0 }}>
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
