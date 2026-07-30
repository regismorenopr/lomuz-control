import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { ArrowUp, ArrowDown, Minus, Info, AlertCircle, Inbox } from 'lucide-react';

/* =========================================================================
   COMPONENTES DO DASHBOARD FINANCEIRO
   Cartão de indicador, indicador de variação, etiqueta de status,
   skeleton, estados vazio/erro/indisponível e o gráfico de fluxo de caixa.
   ========================================================================= */

export function formatBRL(v) {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Valores compactos para o eixo do gráfico (R$ 120 mil, R$ 1,2 mi).
export function formatCompactBRL(v) {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  if (abs >= 1e6) return `R$ ${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1000) return `R$ ${Math.round(n / 1000)} mil`;
  return `R$ ${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

/* ---------- indicador de variação ----------
   Nunca depende só de cor: sempre traz seta + sinal + texto do período. */
export function TrendIndicator({ pct, label = 'vs período anterior', goodWhenUp = true }) {
  if (pct == null || !isFinite(pct)) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-secondary)' }}>
        <Minus size={13} aria-hidden="true" /> sem base de comparação
      </span>
    );
  }
  const flat = Math.abs(pct) < 0.05;
  const up = pct > 0;
  const bom = flat ? null : (up === goodWhenUp);
  const cor = flat ? 'var(--text-secondary)' : bom ? 'var(--success)' : 'var(--danger)';
  const Icon = flat ? Minus : up ? ArrowUp : ArrowDown;
  const sinal = flat ? '' : up ? '+' : '−';
  const texto = `${sinal}${Math.abs(pct).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: cor, fontWeight: 700 }}>
        <Icon size={13} aria-hidden="true" />
        {texto}
      </span>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
    </span>
  );
}

/* ---------- etiqueta de status ---------- */
const TONES = {
  success: { bg: 'var(--success-light)', fg: 'var(--success)' },
  warning: { bg: 'var(--warning-light)', fg: 'var(--warning-strong)' },
  danger: { bg: 'var(--danger-light)', fg: 'var(--danger)' },
  info: { bg: 'var(--info-light)', fg: 'var(--info)' },
  neutral: { bg: 'var(--surface-2)', fg: 'var(--text-secondary)' },
};

export function StatusBadge({ tone = 'neutral', icon: Icon, children }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px',
        borderRadius: 'var(--radius-pill)', background: t.bg, color: t.fg,
        fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
      }}
    >
      {Icon && <Icon size={12} aria-hidden="true" />}
      {children}
    </span>
  );
}

/* ---------- skeleton ---------- */
export function Skeleton({ width = '100%', height = 14, radius, style }) {
  return (
    <span
      className="lomuz-skeleton"
      aria-hidden="true"
      style={{ display: 'block', width, height, borderRadius: radius != null ? radius : 'var(--radius-sm)', ...style }}
    />
  );
}

export function StatCardSkeleton() {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 18 }}>
      <Skeleton width={40} height={40} radius="var(--radius)" />
      <Skeleton width="55%" height={12} style={{ marginTop: 14 }} />
      <Skeleton width="75%" height={26} style={{ marginTop: 10 }} />
      <Skeleton width="45%" height={11} style={{ marginTop: 12 }} />
    </div>
  );
}

/* ---------- estados: vazio, erro, indisponível ---------- */
export function EmptyBlock({ icon: Icon = Inbox, title, desc, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 20px' }}>
      <span
        aria-hidden="true"
        style={{
          width: 46, height: 46, borderRadius: '50%', background: 'var(--surface-2)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
        }}
      >
        <Icon size={20} style={{ color: 'var(--text-secondary)' }} />
      </span>
      <div style={{ fontWeight: 700, fontSize: 'var(--fs-title)', marginBottom: 5 }}>{title}</div>
      {desc && <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, maxWidth: 340, margin: '0 auto' }}>{desc}</div>}
      {action}
    </div>
  );
}

export function ErrorBlock({ title = 'Não foi possível carregar', desc, onRetry }) {
  return (
    <div role="alert" style={{ textAlign: 'center', padding: '28px 20px' }}>
      <span
        aria-hidden="true"
        style={{
          width: 46, height: 46, borderRadius: '50%', background: 'var(--danger-light)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
        }}
      >
        <AlertCircle size={20} style={{ color: 'var(--danger)' }} />
      </span>
      <div style={{ fontWeight: 700, fontSize: 'var(--fs-title)', marginBottom: 5 }}>{title}</div>
      {desc && <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, maxWidth: 340, margin: '0 auto' }}>{desc}</div>}
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            marginTop: 14, padding: '9px 16px', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          Tentar de novo
        </button>
      )}
    </div>
  );
}

/**
 * Bloco para recurso que ainda não existe no banco de dados.
 * Existe justamente para NÃO mostrar número inventado: deixa claro que o
 * dado não está disponível ainda, em vez de exibir exemplo como se fosse real.
 */
export function NotAvailableBlock({ title, desc }) {
  return (
    <div style={{ padding: '26px 20px', textAlign: 'center' }}>
      <StatusBadge tone="info" icon={Info}>Ainda não disponível</StatusBadge>
      <div style={{ fontWeight: 700, fontSize: 'var(--fs-title)', margin: '12px 0 5px' }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, maxWidth: 380, margin: '0 auto' }}>{desc}</div>
    </div>
  );
}

/* ---------- cartão de indicador ---------- */
export function StatCard({
  title, value, icon: Icon, tone = 'neutral',
  trendPct, trendLabel, goodWhenUp = true, hint, footer, loading, onClick, active,
}) {
  if (loading) return <StatCardSkeleton />;

  const t = TONES[tone] || TONES.neutral;
  const valorCor = tone === 'success' ? 'var(--success)'
    : tone === 'danger' ? 'var(--danger)'
      : tone === 'info' ? 'var(--primary-text)'
        : 'var(--text-primary)';
  const clickable = !!onClick;

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      aria-pressed={clickable ? !!active : undefined}
      style={{
        background: 'var(--surface)',
        border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: 18,
        boxShadow: active ? '0 0 0 3px var(--primary-light)' : 'var(--shadow-sm)',
        display: 'flex', flexDirection: 'column', minWidth: 0,
        cursor: clickable ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {Icon && (
            <span
              aria-hidden="true"
              style={{
                width: 38, height: 38, borderRadius: 'var(--radius)', background: t.bg,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}
            >
              <Icon size={19} style={{ color: t.fg }} />
            </span>
          )}
          <span style={{ fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </span>
        </div>
        {hint && (
          <span title={hint} aria-label={hint} tabIndex={0} style={{ flexShrink: 0, color: 'var(--text-secondary)', display: 'inline-flex', cursor: 'help' }}>
            <Info size={15} />
          </span>
        )}
      </div>

      <div
        className="lomuz-display"
        style={{ fontSize: 27, color: valorCor, margin: '14px 0 0', overflowWrap: 'anywhere' }}
      >
        {value}
      </div>

      <div style={{ marginTop: 10 }}>
        {trendPct !== undefined
          ? <TrendIndicator pct={trendPct} label={trendLabel} goodWhenUp={goodWhenUp} />
          : footer && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{footer}</span>}
      </div>
    </div>
  );
}

/* ---------- gráfico de fluxo de caixa ---------- */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-lg)', padding: '10px 12px', fontSize: 12.5,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3 }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: p.stroke, flexShrink: 0 }} />
          <span style={{ color: 'var(--text-secondary)' }}>{p.name}:</span>
          <span className="lomuz-num" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{formatBRL(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function LegendDot({ color, children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 600 }}>
      <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: color }} />
      {children}
    </span>
  );
}

/**
 * Fluxo de caixa: entradas (roxo da marca) x saídas (azul), ou uma única
 * série em destaque (`mode="saldo"` / `mode="resultado"`) quando o usuário
 * clica num cartão de indicador específico.
 * `rows` = [{ label, entradas, saidas }] no modo padrão, ou [{ label, saldo }]
 * nos modos de série única. Inclui resumo em texto para leitor de tela.
 */
export function CashFlowChart({ rows, loading, periodSelector, title = 'Fluxo de caixa', mode = 'fluxo', emphasize }) {
  const single = mode !== 'fluxo';
  const singleLabel = 'Resultado mensal';
  const temDado = single
    ? rows?.some((r) => r.saldo !== 0)
    : rows?.some((r) => r.entradas > 0 || r.saidas > 0);
  const totalEnt = (rows || []).reduce((s, r) => s + (r.entradas || 0), 0);
  const totalSai = (rows || []).reduce((s, r) => s + (r.saidas || 0), 0);
  const ultimoSaldo = (rows && rows.length) ? rows[rows.length - 1].saldo : 0;

  return (
    <section
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: 18, boxShadow: 'var(--shadow-sm)', minWidth: 0,
      }}
      aria-labelledby="titulo-fluxo-caixa"
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <h2 id="titulo-fluxo-caixa" style={{ margin: 0, fontSize: 'var(--fs-title)', fontWeight: 700 }}>{title}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {single ? (
            <LegendDot color="var(--primary)">{singleLabel}</LegendDot>
          ) : (
            <>
              <LegendDot color="var(--chart-in)">Entradas</LegendDot>
              <LegendDot color="var(--chart-out)">Saídas</LegendDot>
            </>
          )}
          {periodSelector}
        </div>
      </div>

      {loading ? (
        <Skeleton height={248} />
      ) : !temDado ? (
        <EmptyBlock
          title="Sem movimentação no período"
          desc="Quando houver receitas ou despesas aprovadas neste intervalo, o gráfico aparece aqui."
        />
      ) : (
        <>
          {/* Resumo textual: um gráfico não é lido por leitor de tela. */}
          <p className="lomuz-sr-only">
            {single
              ? `Gráfico de ${singleLabel.toLowerCase()} mês a mês. Valor mais recente: ${formatBRL(ultimoSaldo)}.`
              : `Gráfico de linhas comparando entradas e saídas mês a mês. Total de entradas no período: ${formatBRL(totalEnt)}. Total de saídas: ${formatBRL(totalSai)}. Resultado: ${formatBRL(totalEnt - totalSai)}.`}
          </p>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="lomuzFillEnt" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-in)" stopOpacity={0.16} />
                    <stop offset="100%" stopColor="var(--chart-in)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                  width={78} axisLine={false} tickLine={false}
                  tickFormatter={formatCompactBRL}
                />
                <Tooltip content={<ChartTooltip />} />
                {single ? (
                  <Line
                    type="monotone" dataKey="saldo" name={singleLabel} stroke="var(--primary)" strokeWidth={2.4}
                    dot={{ r: 3.5, strokeWidth: 2, fill: 'var(--surface)' }} activeDot={{ r: 5 }}
                    fill="url(#lomuzFillEnt)"
                  />
                ) : (
                  <>
                    <Line
                      type="monotone" dataKey="entradas" name="Entradas" stroke="var(--chart-in)" strokeWidth={2.4}
                      strokeOpacity={emphasize && emphasize !== 'entradas' ? 0.3 : 1}
                      dot={{ r: 3.5, strokeWidth: 2, fill: 'var(--surface)' }} activeDot={{ r: 5 }}
                      fill="url(#lomuzFillEnt)"
                    />
                    <Line
                      type="monotone" dataKey="saidas" name="Saídas" stroke="var(--chart-out)" strokeWidth={2.4}
                      strokeOpacity={emphasize && emphasize !== 'saidas' ? 0.3 : 1}
                      dot={{ r: 3.5, strokeWidth: 2, fill: 'var(--surface)' }} activeDot={{ r: 5 }}
                    />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  );
}

/* ---------- painel genérico com título e ação ---------- */
export function Panel({ title, action, children, style }) {
  return (
    <section
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', minWidth: 0, ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ margin: 0, fontSize: 'var(--fs-title)', fontWeight: 700 }}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PanelLink({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
        padding: '6px 12px', fontSize: 12.5, fontWeight: 700, color: 'var(--primary-text)', cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}
