import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  Home, Receipt, TrendingUp, Tag, Plus, X, Calendar, ChevronRight, Repeat, Check,
  ArrowUpCircle, ArrowDownCircle, Users, Trash2, Edit2, Clock, Target, Upload,
  Utensils, Car, Film, HeartPulse, ShoppingBag, Briefcase, GraduationCap, Wallet,
  Gift, Smartphone, PawPrint, MoreHorizontal
} from 'lucide-react';
import Papa from 'papaparse';
import { supabase } from './supabaseClient';

/* =========================================================================
   UTILITÁRIOS DE DATA E FORMATAÇÃO
   ========================================================================= */

const pad2 = (n) => String(n).padStart(2, '0');

function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function parseISODate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}
function startOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function endOfMonth(date) { return new Date(date.getFullYear(), date.getMonth() + 1, 0); }

const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function monthLabel(date) { return `${MONTH_ABBR[date.getMonth()]}/${String(date.getFullYear()).slice(-2)}`; }
function monthKey(date) { return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`; }

function formatCurrency(v) {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function formatDateBR(iso) {
  if (!iso) return '';
  return parseISODate(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function daysUntil(iso) {
  const target = parseISODate(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((target - today) / 86400000));
}
function round2(v) { return Math.round((v + Number.EPSILON) * 100) / 100; }
function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); }

// ---- Utilitários de importação de CSV (Asaas ou qualquer extrato) ----
function parseNumberBR(raw) {
  if (raw == null) return NaN;
  let s = String(raw).trim();
  if (!s) return NaN;
  s = s.replace(/[^0-9,.\-]/g, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isNaN(n) ? NaN : n;
}
function parseDateFlexible(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}
function guessColumn(fields, keywords) {
  const found = fields.find((f) => keywords.some((k) => f.toLowerCase().includes(k)));
  return found || fields[0] || '';
}

// ---- Conversão entre o formato do app (camelCase) e as colunas do Supabase (snake_case) ----
function txToRow(tx, userId) {
  return {
    id: tx.id,
    tipo: tx.tipo,
    valor: tx.valor,
    categoria_id: tx.categoriaId || null,
    descricao: tx.descricao || '',
    data: tx.data,
    recorrente: !!tx.recorrente,
    frequencia: tx.frequencia || null,
    repeticoes: tx.repeticoes || null,
    ativacao: tx.ativacao || 'imediata',
    data_ativacao: tx.dataAtivacao || null,
    dias_teste: tx.diasTeste || null,
    vendedor_id: tx.vendedorId || null,
    data_cancelamento: tx.dataCancelamento || null,
    created_by: userId,
  };
}
function rowToTx(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    valor: Number(row.valor),
    categoriaId: row.categoria_id,
    descricao: row.descricao || '',
    data: row.data,
    recorrente: !!row.recorrente,
    frequencia: row.frequencia,
    repeticoes: row.repeticoes,
    ativacao: row.ativacao,
    dataAtivacao: row.data_ativacao,
    diasTeste: row.dias_teste,
    vendedorId: row.vendedor_id,
    dataCancelamento: row.data_cancelamento,
  };
}
function vendedorToRow(v) {
  return {
    id: v.id,
    nome: v.nome,
    comissao_percentual: v.comissaoPercentual,
    meta_padrao: v.metaPadrao,
    metas: v.metas || {},
    convite_email: v.conviteEmail || null,
  };
}
function rowToVendedor(row) {
  return {
    id: row.id,
    nome: row.nome,
    comissaoPercentual: Number(row.comissao_percentual),
    metaPadrao: Number(row.meta_padrao),
    metas: row.metas || {},
    conviteEmail: row.convite_email,
    profileId: row.profile_id,
  };
}

/* =========================================================================
   REGRAS DE NEGÓCIO: RECORRÊNCIA E PROJEÇÕES
   ========================================================================= */

// A partir de quando as ocorrências de uma recorrência começam a contar de fato.
function getEffectiveStart(tx) {
  if (!tx.recorrente) return parseISODate(tx.data);
  if (tx.ativacao === 'agendada' && tx.dataAtivacao) return parseISODate(tx.dataAtivacao);
  return parseISODate(tx.data);
}

// Retorna as datas de ocorrência de um lançamento dentro de [rangeStart, rangeEnd].
function expandOccurrences(tx, rangeStart, rangeEnd) {
  if (!tx.recorrente) {
    const d = parseISODate(tx.data);
    return (d >= rangeStart && d <= rangeEnd) ? [d] : [];
  }
  const start = getEffectiveStart(tx);
  const effectiveEnd = tx.dataCancelamento
    ? new Date(Math.min(rangeEnd.getTime(), parseISODate(tx.dataCancelamento).getTime()))
    : rangeEnd;
  const maxCount = tx.repeticoes ? Number(tx.repeticoes) : Infinity;
  const occurrences = [];
  let current = new Date(start);
  let count = 0;
  let safety = 0;
  while (current <= effectiveEnd && count < maxCount && safety < 1200) {
    if (current >= rangeStart) occurrences.push(new Date(current));
    count += 1;
    safety += 1;
    if (tx.frequencia === 'semanal') current = addDays(current, 7);
    else if (tx.frequencia === 'anual') current = addMonths(current, 12);
    else current = addMonths(current, 1);
  }
  return occurrences;
}

function getRecurrenceStatus(tx) {
  if (!tx.recorrente) return 'unico';
  if (tx.dataCancelamento) return 'cancelado';
  if (tx.ativacao === 'imediata') return 'ativo';
  const today = new Date();
  return today >= parseISODate(tx.dataAtivacao) ? 'ativo' : 'pendente';
}

function scopedTransactions(data, role, currentVendedorId) {
  if (role === 'vendedor') return data.transactions.filter((t) => t.vendedorId === currentVendedorId);
  return data.transactions;
}

function sumByPeriod(transactions, tipo, rangeStart, rangeEnd) {
  let total = 0;
  let count = 0;
  const byCategory = {};
  transactions.forEach((tx) => {
    if (tx.tipo !== tipo) return;
    const occ = expandOccurrences(tx, rangeStart, rangeEnd);
    if (occ.length === 0) return;
    const value = tx.valor * occ.length;
    total += value;
    count += occ.length;
    byCategory[tx.categoriaId] = (byCategory[tx.categoriaId] || 0) + value;
  });
  return { total: round2(total), count, byCategory };
}

function getPeriodRange(period) {
  const today = new Date();
  switch (period.type) {
    case 'mes_passado': {
      const m = addMonths(today, -1);
      return { start: startOfMonth(m), end: endOfMonth(m) };
    }
    case 'ultimos_3':
      return { start: startOfMonth(addMonths(today, -2)), end: endOfMonth(today) };
    case 'ano_atual':
      return { start: new Date(today.getFullYear(), 0, 1), end: new Date(today.getFullYear(), 11, 31) };
    case 'custom':
      return {
        start: period.start ? parseISODate(period.start) : startOfMonth(today),
        end: period.end ? parseISODate(period.end) : endOfMonth(today),
      };
    default:
      return { start: startOfMonth(today), end: endOfMonth(today) };
  }
}

function buildCategoryForecastRows(transactions, categoryIds, monthsCount) {
  const today = new Date();
  const rows = [];
  for (let i = 0; i < monthsCount; i += 1) {
    const m = addMonths(startOfMonth(today), i);
    const rs = startOfMonth(m);
    const re = endOfMonth(m);
    const row = { key: monthKey(m), label: monthLabel(m) };
    categoryIds.forEach((catId) => {
      let val = 0;
      transactions.filter((t) => t.categoriaId === catId).forEach((tx) => {
        val += tx.valor * expandOccurrences(tx, rs, re).length;
      });
      row[catId] = round2(val);
    });
    rows.push(row);
  }
  return rows;
}

function buildVendedorForecastRows(transactions, vendedor, monthsCount) {
  const today = new Date();
  const rows = [];
  for (let i = 0; i < monthsCount; i += 1) {
    const m = addMonths(startOfMonth(today), i);
    const rs = startOfMonth(m);
    const re = endOfMonth(m);
    let vendas = 0;
    transactions
      .filter((t) => t.vendedorId === vendedor.id && t.tipo === 'receita')
      .forEach((tx) => { vendas += tx.valor * expandOccurrences(tx, rs, re).length; });
    const key = monthKey(m);
    const meta = (vendedor.metas && vendedor.metas[key] != null) ? vendedor.metas[key] : (vendedor.metaPadrao || 0);
    rows.push({ key, label: monthLabel(m), vendas: round2(vendas), meta: round2(meta) });
  }
  return rows;
}

// Evolução da empresa: receita x despesa mês a mês, últimos N meses (incluindo o atual).
function buildCompanyEvolution(transactions, monthsBack) {
  const today = new Date();
  const rows = [];
  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const m = addMonths(startOfMonth(today), -i);
    const rs = startOfMonth(m);
    const re = endOfMonth(m);
    const receita = sumByPeriod(transactions, 'receita', rs, re).total;
    const despesa = sumByPeriod(transactions, 'despesa', rs, re).total;
    rows.push({ key: monthKey(m), label: monthLabel(m), receita, despesa, saldo: round2(receita - despesa) });
  }
  return rows;
}

// Cancelamentos de recorrências por mês, últimos N meses.
function buildCancelamentosPorMes(transactions, monthsBack) {
  const today = new Date();
  const rows = [];
  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const m = addMonths(startOfMonth(today), -i);
    const rs = startOfMonth(m);
    const re = endOfMonth(m);
    const count = transactions.filter((t) => {
      if (!t.dataCancelamento) return false;
      const d = parseISODate(t.dataCancelamento);
      return d >= rs && d <= re;
    }).length;
    rows.push({ key: monthKey(m), label: monthLabel(m), count });
  }
  return rows;
}

// Ranking de vendedores por vendas dentro de um período (respeita o seletor de período do painel).
function buildVendedorRanking(transactions, vendedores, rangeStart, rangeEnd) {
  return vendedores
    .map((v) => {
      let vendas = 0;
      transactions
        .filter((t) => t.tipo === 'receita' && t.vendedorId === v.id)
        .forEach((tx) => { vendas += tx.valor * expandOccurrences(tx, rangeStart, rangeEnd).length; });
      return { id: v.id, nome: v.nome, vendas: round2(vendas), comissao: round2(vendas * (v.comissaoPercentual / 100)) };
    })
    .sort((a, b) => b.vendas - a.vendas);
}

function txToDraft(tx) {
  return {
    tipo: tx.tipo,
    valor: String(tx.valor),
    categoriaId: tx.categoriaId,
    descricao: tx.descricao || '',
    data: tx.data,
    recorrente: !!tx.recorrente,
    frequencia: tx.frequencia || 'mensal',
    semTermino: tx.repeticoes == null,
    repeticoes: tx.repeticoes != null ? String(tx.repeticoes) : '',
    vendedorId: tx.vendedorId || '',
  };
}

/* =========================================================================
   ÍCONES E DADOS DE EXEMPLO
   ========================================================================= */

const ICON_MAP = {
  utensils: Utensils, car: Car, home: Home, film: Film, heart: HeartPulse,
  shopping: ShoppingBag, briefcase: Briefcase, grad: GraduationCap, wallet: Wallet,
  trending: TrendingUp, gift: Gift, phone: Smartphone, paw: PawPrint, more: MoreHorizontal,
};
const ICON_CHOICES = ['utensils', 'car', 'home', 'film', 'heart', 'shopping', 'briefcase', 'grad', 'wallet', 'trending', 'gift', 'phone', 'paw', 'more'];
const COLOR_CHOICES = ['#0E6B52', '#2F9E6E', '#A8404A', '#B5652E', '#8B4A6B', '#6B5B95', '#2E6B8B', '#C89B3C', '#4A6B8B', '#7A6A58'];

// Gráficos opcionais do painel (Admin) — todos ligados por padrão, o usuário pode desligar.
const DEFAULT_DASHBOARD_WIDGETS = {
  categorias: true,
  ticketMedio: true,
  receitaDespesa: true,
  rankingVendedores: true,
  cancelamentos: true,
};

function buildSeedData() {
  const today = new Date();
  const cat = (nome, tipo, icone, cor) => ({ id: uid(), nome, tipo, icone, cor });

  const categories = [
    cat('Alimentação', 'despesa', 'utensils', '#A8404A'),
    cat('Transporte', 'despesa', 'car', '#B5652E'),
    cat('Moradia', 'despesa', 'home', '#8B4A6B'),
    cat('Lazer', 'despesa', 'film', '#6B5B95'),
    cat('Saúde', 'despesa', 'heart', '#8B3A4A'),
    cat('Outras despesas', 'despesa', 'more', '#7A6A58'),
    cat('Vendas', 'receita', 'shopping', '#0E6B52'),
    cat('Serviços', 'receita', 'briefcase', '#2E8B6E'),
    cat('Salário', 'receita', 'wallet', '#3FA66C'),
    cat('Outras receitas', 'receita', 'more', '#5FA37E'),
  ];
  const byName = (n) => categories.find((c) => c.nome === n).id;

  const vendedores = [
    { id: uid(), nome: 'Ana Souza', comissaoPercentual: 5, metaPadrao: 15000, metas: {} },
    { id: uid(), nome: 'Carlos Lima', comissaoPercentual: 8, metaPadrao: 20000, metas: {} },
  ];

  const d = (offsetDays) => toISODate(addDays(today, offsetDays));
  const tx = (over) => ({
    id: uid(), tipo: 'despesa', descricao: '', data: toISODate(today), recorrente: false,
    frequencia: null, repeticoes: null, ativacao: 'imediata', dataAtivacao: null, diasTeste: null, vendedorId: null,
    ...over,
  });

  const transactions = [
    tx({ tipo: 'despesa', valor: 1450, categoriaId: byName('Moradia'), descricao: 'Aluguel', data: d(-3), recorrente: true, frequencia: 'mensal', ativacao: 'imediata' }),
    tx({ tipo: 'despesa', valor: 89.9, categoriaId: byName('Lazer'), descricao: 'Streaming', data: d(-20), recorrente: true, frequencia: 'mensal', ativacao: 'imediata' }),
    tx({ tipo: 'despesa', valor: 620, categoriaId: byName('Alimentação'), descricao: 'Supermercado', data: d(-5) }),
    tx({ tipo: 'despesa', valor: 180, categoriaId: byName('Transporte'), descricao: 'Combustível', data: d(-8) }),
    tx({ tipo: 'despesa', valor: 250, categoriaId: byName('Saúde'), descricao: 'Farmácia', data: d(-12) }),
    tx({ tipo: 'receita', valor: 6200, categoriaId: byName('Salário'), descricao: 'Salário', data: d(-4), recorrente: true, frequencia: 'mensal', ativacao: 'imediata' }),
    tx({ tipo: 'receita', valor: 3200, categoriaId: byName('Vendas'), descricao: 'Venda cliente A', data: d(-6), vendedorId: vendedores[0].id }),
    tx({ tipo: 'receita', valor: 5100, categoriaId: byName('Vendas'), descricao: 'Venda cliente B', data: d(-15), vendedorId: vendedores[1].id }),
    tx({ tipo: 'receita', valor: 2800, categoriaId: byName('Serviços'), descricao: 'Consultoria', data: d(-2), vendedorId: vendedores[0].id }),
    tx({ tipo: 'despesa', valor: 59.9, categoriaId: byName('Lazer'), descricao: 'Academia (teste grátis)', data: d(1), recorrente: true, frequencia: 'mensal', ativacao: 'agendada', dataAtivacao: d(6), diasTeste: 7 }),
  ];

  return { categories, transactions, vendedores, uiPrefs: { role: 'admin', currentVendedorId: vendedores[0].id, dashboardWidgets: { ...DEFAULT_DASHBOARD_WIDGETS } } };
}

/* =========================================================================
   ESTILOS COMPARTILHADOS
   ========================================================================= */

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)',
  fontSize: 14, fontFamily: 'inherit', background: 'var(--surface)', color: 'var(--ink)', boxSizing: 'border-box',
};
const iconBtnStyle = {
  width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink-soft)', flexShrink: 0,
};
const thStyle = { textAlign: 'left', padding: '8px 10px', fontWeight: 700, color: 'var(--ink-soft)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', fontSize: 11.5 };
const tdStyle = { padding: '8px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };

const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
.lomuz-app { --bg:#F4F6F2; --surface:#FFFFFF; --surface-2:#EEF1EC; --ink:#13251F; --ink-soft:#5B6B64;
  --brand:#0E6B52; --brand-soft:#E4F0EA; --positive:#2F9E6E; --positive-soft:#E3F5EC;
  --negative:#A8404A; --negative-soft:#FBEAEB; --gold:#C89B3C; --gold-soft:#FBF3E1; --border:#E3E7E1;
  font-family:'Inter', system-ui, -apple-system, sans-serif; color:var(--ink); background:var(--bg); }
.lomuz-app .lomuz-display { font-family:'Fraunces', Georgia, serif; }
.lomuz-app * { box-sizing:border-box; }
.lomuz-app ::-webkit-scrollbar { height:6px; width:6px; }
.lomuz-app ::-webkit-scrollbar-thumb { background:var(--border); border-radius:99px; }
.lomuz-app input, .lomuz-app select, .lomuz-app button { outline:none; }
.lomuz-app input:focus, .lomuz-app select:focus { border-color:var(--brand); box-shadow:0 0 0 3px var(--brand-soft); }
.lomuz-app button:focus-visible { outline:2px solid var(--brand); outline-offset:2px; }
.lomuz-app button { font-family:inherit; }
@keyframes lomuzSlideUp { from { transform:translateY(24px); opacity:0; } to { transform:translateY(0); opacity:1; } }
@media (prefers-reduced-motion: reduce) { .lomuz-app * { animation:none !important; transition:none !important; } }
.lomuz-shell { max-width: 480px; }
@media (min-width: 640px) { .lomuz-shell { max-width: 600px; } }
@media (min-width: 1024px) { .lomuz-shell { max-width: 760px; } }
@media (min-width: 1440px) { .lomuz-shell { max-width: 900px; } }
`;

/* =========================================================================
   COMPONENTES BÁSICOS (ÁTOMOS)
   ========================================================================= */

function Card({ children, style }) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 16, boxShadow: '0 1px 2px rgba(19,37,31,0.06)', border: '1px solid var(--border)', ...style }}>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, flexShrink: 0,
        border: active ? '1px solid var(--brand)' : '1px solid var(--border)',
        background: active ? 'var(--brand)' : 'var(--surface)',
        color: active ? '#fff' : 'var(--ink-soft)', cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

function Button({ variant = 'primary', children, style, ...props }) {
  const base = { padding: '12px 16px', borderRadius: 12, fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 };
  const variants = {
    primary: { background: 'var(--brand)', color: '#fff' },
    secondary: { background: 'var(--surface-2)', color: 'var(--ink)' },
    danger: { background: 'var(--negative)', color: '#fff' },
    ghost: { background: 'transparent', color: 'var(--ink-soft)' },
  };
  return <button style={{ ...base, ...variants[variant], ...style }} {...props}>{children}</button>;
}

function Field({ label, children, hint }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-soft)', marginTop: 5 }}>{hint}</span>}
    </label>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{ width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', position: 'relative', background: checked ? 'var(--brand)' : 'var(--border)', transition: 'background .15s', flexShrink: 0 }}
    >
      <div style={{ position: 'absolute', top: 3, left: checked ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
    </button>
  );
}

function ProgressBar({ pct }) {
  const color = pct >= 100 ? 'var(--positive)' : pct >= 70 ? 'var(--gold)' : 'var(--negative)';
  return (
    <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: color, borderRadius: 999, transition: 'width .3s' }} />
    </div>
  );
}

function EmptyState({ icon: Icon, title, desc, actionLabel, onAction }) {
  return (
    <Card style={{ marginTop: 16, textAlign: 'center', padding: '32px 20px' }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
        <Icon size={22} color="var(--brand)" />
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: actionLabel ? 18 : 0, lineHeight: 1.5 }}>{desc}</div>
      {actionLabel && <Button variant="primary" onClick={onAction} style={{ display: 'inline-flex' }}>{actionLabel}</Button>}
    </Card>
  );
}

function SectionTitle({ icon: Icon, children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '22px 0 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 13.5, color: 'var(--ink-soft)' }}>
        {Icon && <Icon size={15} />} {children}
      </div>
      {action && (
        <button onClick={action.onClick} style={{ background: 'none', border: 'none', color: 'var(--brand)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
          {action.label} <ChevronRight size={13} />
        </button>
      )}
    </div>
  );
}

function OptionCard({ active, title, desc, onClick, children }) {
  return (
    <div onClick={onClick} style={{ border: active ? '2px solid var(--brand)' : '1px solid var(--border)', background: active ? 'var(--brand-soft)' : 'var(--surface)', borderRadius: 14, padding: 14, cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${active ? 'var(--brand)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {active && <div style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--brand)' }} />}
        </div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginLeft: 28, marginTop: 4, lineHeight: 1.4 }}>{desc}</div>
      {children}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(19,37,31,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--surface)', width: '100%', maxWidth: 480, borderRadius: '20px 20px 0 0', maxHeight: '88vh', overflowY: 'auto', padding: 20, animation: 'lomuzSlideUp .22s ease-out' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 className="lomuz-display" style={{ fontSize: 19, margin: 0, fontWeight: 600 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'var(--surface-2)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <X size={17} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ConfirmDialog({ message, onCancel, onConfirm }) {
  return (
    <Modal title="Confirmar" onClose={onCancel}>
      <p style={{ fontSize: 14, lineHeight: 1.55, marginTop: 0, marginBottom: 20 }}>{message}</p>
      <div style={{ display: 'flex', gap: 10 }}>
        <Button variant="secondary" onClick={onCancel} style={{ flex: 1 }}>Cancelar</Button>
        <Button variant="danger" onClick={onConfirm} style={{ flex: 1 }}>Confirmar</Button>
      </div>
    </Modal>
  );
}

/* =========================================================================
   LISTAS: LANÇAMENTO E CATEGORIA
   ========================================================================= */

function TransactionRow({ tx, category, last, onClick }) {
  const Icon = ICON_MAP[category?.icone] || MoreHorizontal;
  const status = getRecurrenceStatus(tx);
  const color = category?.cor || '#7A6A58';
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: last ? 'none' : '1px solid var(--border)', cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={18} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.descricao || category?.nome || 'Sem categoria'}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{formatDateBR(tx.data)}</span>
          {tx.recorrente && <Repeat size={11} />}
          {status === 'pendente' && <span style={{ color: '#8A6A1F', fontWeight: 700 }}>· Pendente</span>}
          {status === 'cancelado' && <span style={{ color: 'var(--negative)', fontWeight: 700 }}>· Cancelado</span>}
        </div>
      </div>
      <div style={{ fontWeight: 700, fontSize: 14, color: tx.tipo === 'receita' ? 'var(--positive)' : 'var(--negative)', whiteSpace: 'nowrap' }}>
        {tx.tipo === 'receita' ? '+ ' : '- '}{formatCurrency(tx.valor)}
      </div>
    </div>
  );
}

function CategoryRow({ cat, last, onEdit, onDelete }) {
  const Icon = ICON_MAP[cat.icone] || MoreHorizontal;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: `${cat.cor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={16} color={cat.cor} />
      </div>
      <div style={{ flex: 1, fontWeight: 600, fontSize: 14, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.nome}</div>
      <button onClick={onEdit} style={iconBtnStyle}><Edit2 size={14} /></button>
      <button onClick={onDelete} style={iconBtnStyle}><Trash2 size={14} /></button>
    </div>
  );
}

/* =========================================================================
   SELETORES DE PERÍODO
   ========================================================================= */

function PeriodSelector({ value, onChange }) {
  const presets = [
    { key: 'mes_atual', label: 'Este mês' },
    { key: 'mes_passado', label: 'Mês passado' },
    { key: 'ultimos_3', label: 'Últimos 3 meses' },
    { key: 'ano_atual', label: 'Este ano' },
    { key: 'custom', label: 'Personalizado' },
  ];
  function selectPreset(key) {
    if (key === 'custom') {
      onChange({
        ...value,
        type: 'custom',
        start: value.start || toISODate(startOfMonth(addMonths(new Date(), -1))),
        end: value.end || toISODate(new Date()),
      });
    } else {
      onChange({ ...value, type: key });
    }
  }
  function changeStart(newStart) {
    const newEnd = value.end && newStart > value.end ? newStart : value.end;
    onChange({ ...value, start: newStart, end: newEnd });
  }
  function changeEnd(newEnd) {
    const newStart = value.start && newEnd < value.start ? newEnd : value.start;
    onChange({ ...value, start: newStart, end: newEnd });
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {presets.map((p) => (
          <Chip key={p.key} active={value.type === p.key} onClick={() => selectPreset(p.key)}>{p.label}</Chip>
        ))}
      </div>
      {value.type === 'custom' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
          <input type="date" value={value.start} onChange={(e) => changeStart(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>até</span>
          <input type="date" value={value.end} onChange={(e) => changeEnd(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
        </div>
      )}
    </div>
  );
}

function MonthsPeriodSelector({ mode, setMode, custom, setCustom }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Chip active={mode === '6'} onClick={() => setMode('6')}>6 meses</Chip>
        <Chip active={mode === '12'} onClick={() => setMode('12')}>12 meses</Chip>
        <Chip active={mode === 'custom'} onClick={() => setMode('custom')}>Personalizado</Chip>
      </div>
      {mode === 'custom' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Quantidade de meses:</span>
          <input type="number" min="1" max="36" value={custom} onChange={(e) => setCustom(e.target.value)} style={{ ...inputStyle, width: 80 }} />
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   FORMULÁRIO DE LANÇAMENTO + FLUXO DE RECORRÊNCIA
   ========================================================================= */

function TransactionForm({ draft, categories, role, vendedores, onSubmit, onCancel, onDelete, onCancelRecurrence }) {
  const [local, setLocal] = useState(draft);
  const [error, setError] = useState('');
  const cats = categories.filter((c) => c.tipo === local.tipo);

  useEffect(() => {
    if (!cats.some((c) => c.id === local.categoriaId)) {
      setLocal((l) => ({ ...l, categoriaId: cats[0]?.id || '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local.tipo]);

  function set(field, value) { setLocal((l) => ({ ...l, [field]: value })); }

  function submit() {
    if (!local.valor || parseFloat(local.valor) <= 0) { setError('Informe um valor válido.'); return; }
    if (!local.categoriaId) { setError('Escolha uma categoria.'); return; }
    setError('');
    onSubmit(local);
  }

  return (
    <div>
      {role !== 'vendedor' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            onClick={() => set('tipo', 'despesa')}
            style={{ flex: 1, padding: 10, borderRadius: 12, border: local.tipo === 'despesa' ? '2px solid var(--negative)' : '1px solid var(--border)', background: local.tipo === 'despesa' ? 'var(--negative-soft)' : 'var(--surface)', color: local.tipo === 'despesa' ? 'var(--negative)' : 'var(--ink-soft)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <ArrowDownCircle size={16} /> Despesa
          </button>
          <button
            onClick={() => set('tipo', 'receita')}
            style={{ flex: 1, padding: 10, borderRadius: 12, border: local.tipo === 'receita' ? '2px solid var(--positive)' : '1px solid var(--border)', background: local.tipo === 'receita' ? 'var(--positive-soft)' : 'var(--surface)', color: local.tipo === 'receita' ? 'var(--positive)' : 'var(--ink-soft)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <ArrowUpCircle size={16} /> Receita
          </button>
        </div>
      )}

      <Field label="Valor">
        <input type="number" min="0" step="0.01" placeholder="0,00" value={local.valor} onChange={(e) => set('valor', e.target.value)} style={inputStyle} />
      </Field>

      <Field label="Categoria">
        <select value={local.categoriaId} onChange={(e) => set('categoriaId', e.target.value)} style={inputStyle}>
          {cats.length === 0 && <option value="">Crie uma categoria primeiro</option>}
          {cats.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </Field>

      <Field label="Descrição (opcional)">
        <input type="text" placeholder="Ex.: Supermercado do mês" value={local.descricao} onChange={(e) => set('descricao', e.target.value)} style={inputStyle} />
      </Field>

      <Field label="Data">
        <input type="date" value={local.data} onChange={(e) => set('data', e.target.value)} style={inputStyle} />
      </Field>

      {local.tipo === 'receita' && role === 'admin' && vendedores.length > 0 && (
        <Field label="Vendedor (opcional)" hint="Atribua esta venda a um vendedor para contar na previsão dele.">
          <select value={local.vendedorId || ''} onChange={(e) => set('vendedorId', e.target.value)} style={inputStyle}>
            <option value="">Nenhum</option>
            {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>
        </Field>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--border)', marginTop: 6 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}><Repeat size={15} /> Recorrente</div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Repete automaticamente (assinatura, salário, aluguel...)</div>
        </div>
        <Toggle checked={local.recorrente} onChange={(v) => set('recorrente', v)} />
      </div>

      {local.recorrente && (
        <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: 12, marginTop: 10 }}>
          <Field label="Repetir">
            <select value={local.frequencia} onChange={(e) => set('frequencia', e.target.value)} style={inputStyle}>
              <option value="mensal">Todo mês</option>
              <option value="semanal">Toda semana</option>
              <option value="anual">Todo ano</option>
            </select>
          </Field>
          <div style={{ display: 'flex', gap: 8, marginBottom: local.semTermino ? 0 : 10, flexWrap: 'wrap' }}>
            <Chip active={local.semTermino} onClick={() => set('semTermino', true)}>Sem data para terminar</Chip>
            <Chip active={!local.semTermino} onClick={() => set('semTermino', false)}>Definir quantidade</Chip>
          </div>
          {!local.semTermino && (
            <input type="number" min="1" placeholder="Nº de repetições" value={local.repeticoes} onChange={(e) => set('repeticoes', e.target.value)} style={inputStyle} />
          )}
        </div>
      )}

      {error && <div style={{ color: 'var(--negative)', fontSize: 12.5, marginTop: 12, fontWeight: 600 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <Button variant="secondary" onClick={onCancel} style={{ flex: 1 }}>Cancelar</Button>
        <Button variant="primary" onClick={submit} style={{ flex: 2 }}>{local.recorrente ? 'Continuar' : 'Salvar lançamento'}</Button>
      </div>

      {onDelete && (
        <button
          onClick={onDelete}
          style={{ width: '100%', marginTop: 14, background: 'none', border: 'none', color: 'var(--negative)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8 }}
        >
          <Trash2 size={14} /> Excluir lançamento
        </button>
      )}

      {onCancelRecurrence && (
        <button
          onClick={onCancelRecurrence}
          style={{ width: '100%', marginTop: 4, background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8 }}
        >
          <X size={13} /> Cancelar recorrência (mantém histórico)
        </button>
      )}
    </div>
  );
}

function ConfirmRecurrenceStep({ draft, category, onBack, onConfirm }) {
  const freqLabel = { mensal: 'todo mês', semanal: 'toda semana', anual: 'todo ano' }[draft.frequencia];
  return (
    <div>
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <Repeat size={18} color="var(--brand)" />
          <span style={{ fontWeight: 700 }}>Lançamento recorrente</span>
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          <strong>{formatCurrency(parseFloat(draft.valor) || 0)}</strong> em <strong>{category?.nome}</strong>, repetindo <strong>{freqLabel}</strong>, a partir de {formatDateBR(draft.data)}
          {draft.semTermino ? ', sem data para terminar.' : `, por ${draft.repeticoes || 1} repetições.`}
        </p>
      </Card>
      <div style={{ display: 'flex', gap: 10 }}>
        <Button variant="secondary" onClick={onBack} style={{ flex: 1 }}>Ajustar</Button>
        <Button variant="primary" onClick={onConfirm} style={{ flex: 2 }}>Confirmar recorrência</Button>
      </div>
    </div>
  );
}

function ActivationStep({ draft, onBack, onConfirm }) {
  const [mode, setMode] = useState('imediata');
  const [dias, setDias] = useState(7);
  const previewDate = mode === 'agendada' ? toISODate(addDays(parseISODate(draft.data), Number(dias) || 0)) : null;

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: -8, marginBottom: 16, lineHeight: 1.5 }}>
        Quando esse lançamento recorrente deve começar a valer?
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        <OptionCard active={mode === 'imediata'} title="Ativar agora" desc="A recorrência já entra em vigor a partir da data informada." onClick={() => setMode('imediata')} />
        <OptionCard
          active={mode === 'agendada'}
          title="Ativar após período de teste"
          desc="Ideal para vendas com teste grátis: a recorrência só passa a valer quando o teste termina."
          onClick={() => setMode('agendada')}
        >
          {mode === 'agendada' && (
            <div style={{ marginTop: 12 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                {[7, 14, 30].map((dOpt) => (
                  <Chip key={dOpt} active={Number(dias) === dOpt} onClick={() => setDias(dOpt)}>{dOpt} dias</Chip>
                ))}
              </div>
              <input type="number" min="1" value={dias} onChange={(e) => setDias(e.target.value)} style={inputStyle} />
              {previewDate && (
                <p style={{ fontSize: 12, color: 'var(--brand)', marginTop: 8, fontWeight: 700 }}>
                  Começa a valer em {formatDateBR(previewDate)} · fica pendente até lá
                </p>
              )}
            </div>
          )}
        </OptionCard>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <Button variant="secondary" onClick={onBack} style={{ flex: 1 }}>Voltar</Button>
        <Button variant="primary" onClick={() => onConfirm({ mode, dias: Number(dias) || 1 })} style={{ flex: 2 }}>
          <Check size={16} /> Salvar lançamento
        </Button>
      </div>
    </div>
  );
}

/* =========================================================================
   FORMULÁRIOS: CATEGORIA E VENDEDOR
   ========================================================================= */

function CategoryForm({ cat, onSubmit, onCancel }) {
  const [nome, setNome] = useState(cat?.nome || '');
  const [tipo, setTipo] = useState(cat?.tipo || 'despesa');
  const [icone, setIcone] = useState(cat?.icone || ICON_CHOICES[0]);
  const [cor, setCor] = useState(cat?.cor || COLOR_CHOICES[0]);
  const [error, setError] = useState('');

  function submit() {
    if (!nome.trim()) { setError('Dê um nome para a categoria.'); return; }
    onSubmit({ id: cat?.id || uid(), nome: nome.trim(), tipo, icone, cor });
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTipo('despesa')} style={{ flex: 1, padding: 10, borderRadius: 12, border: tipo === 'despesa' ? '2px solid var(--negative)' : '1px solid var(--border)', background: tipo === 'despesa' ? 'var(--negative-soft)' : 'var(--surface)', fontWeight: 700, cursor: 'pointer', color: tipo === 'despesa' ? 'var(--negative)' : 'var(--ink-soft)' }}>Despesa</button>
        <button onClick={() => setTipo('receita')} style={{ flex: 1, padding: 10, borderRadius: 12, border: tipo === 'receita' ? '2px solid var(--positive)' : '1px solid var(--border)', background: tipo === 'receita' ? 'var(--positive-soft)' : 'var(--surface)', fontWeight: 700, cursor: 'pointer', color: tipo === 'receita' ? 'var(--positive)' : 'var(--ink-soft)' }}>Receita</button>
      </div>
      <Field label="Nome">
        <input type="text" style={inputStyle} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Assinaturas" />
      </Field>
      <Field label="Ícone">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {ICON_CHOICES.map((key) => {
            const Icon = ICON_MAP[key];
            const active = icone === key;
            return (
              <button key={key} onClick={() => setIcone(key)} style={{ width: 38, height: 38, borderRadius: 10, border: active ? `2px solid ${cor}` : '1px solid var(--border)', background: active ? `${cor}22` : 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <Icon size={16} color={active ? cor : 'var(--ink-soft)'} />
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Cor">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {COLOR_CHOICES.map((c) => (
            <button key={c} onClick={() => setCor(c)} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: cor === c ? '2px solid var(--ink)' : '2px solid transparent', cursor: 'pointer' }} />
          ))}
        </div>
      </Field>
      {error && <div style={{ color: 'var(--negative)', fontSize: 12.5, marginBottom: 10, fontWeight: 600 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
        <Button variant="secondary" onClick={onCancel} style={{ flex: 1 }}>Cancelar</Button>
        <Button variant="primary" onClick={submit} style={{ flex: 2 }}>Salvar categoria</Button>
      </div>
    </div>
  );
}

function VendedorForm({ vendedor, onSubmit, onCancel }) {
  const [nome, setNome] = useState(vendedor?.nome || '');
  const [email, setEmail] = useState(vendedor?.conviteEmail || '');
  const [comissao, setComissao] = useState(vendedor?.comissaoPercentual ?? 5);
  const [meta, setMeta] = useState(vendedor?.metaPadrao ?? 10000);
  const [error, setError] = useState('');

  function submit() {
    if (!nome.trim()) { setError('Informe o nome do vendedor.'); return; }
    if (!vendedor?.profileId && !email.trim()) { setError('Informe o e-mail que essa pessoa vai usar para criar a conta.'); return; }
    onSubmit({
      id: vendedor?.id || uid(),
      nome: nome.trim(),
      conviteEmail: vendedor?.profileId ? vendedor.conviteEmail : email.trim(),
      profileId: vendedor?.profileId || null,
      comissaoPercentual: Number(comissao) || 0,
      metaPadrao: Number(meta) || 0,
      metas: vendedor?.metas || {},
    });
  }

  return (
    <div>
      <Field label="Nome"><input type="text" style={inputStyle} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Ana Souza" /></Field>
      {vendedor?.profileId ? (
        <Field label="E-mail" hint="Já vinculado à conta desta pessoa.">
          <input type="email" style={{ ...inputStyle, opacity: 0.6 }} value={vendedor.conviteEmail || ''} disabled />
        </Field>
      ) : (
        <Field label="E-mail para convite" hint="A pessoa deve criar a conta no app usando exatamente este e-mail.">
          <input type="email" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@email.com" />
        </Field>
      )}
      <Field label="Comissão (%)"><input type="number" min="0" max="100" step="0.5" style={inputStyle} value={comissao} onChange={(e) => setComissao(e.target.value)} /></Field>
      <Field label="Meta mensal padrão" hint="Você pode ajustar mês a mês depois, na tela de Previsão.">
        <input type="number" min="0" style={inputStyle} value={meta} onChange={(e) => setMeta(e.target.value)} />
      </Field>
      {error && <div style={{ color: 'var(--negative)', fontSize: 12.5, marginBottom: 10, fontWeight: 600 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
        <Button variant="secondary" onClick={onCancel} style={{ flex: 1 }}>Cancelar</Button>
        <Button variant="primary" onClick={submit} style={{ flex: 2 }}>Salvar</Button>
      </div>
    </div>
  );
}

/* =========================================================================
   PÁGINA: INÍCIO (DASHBOARD)
   ========================================================================= */

function CategoryPieCard({ pieData }) {
  if (pieData.length === 0) {
    return <Card><p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>Nenhuma despesa neste período.</p></Card>;
  }
  return (
    <Card>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={3}>
            {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Pie>
          <Tooltip formatter={(v) => formatCurrency(v)} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
        {pieData.map((entry, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: entry.color, flexShrink: 0 }} />
            {entry.name} · {formatCurrency(entry.value)}
          </div>
        ))}
      </div>
    </Card>
  );
}

function DashboardCustomizeModal({ widgets, onToggle, onClose }) {
  const items = [
    { key: 'categorias', label: 'Gastos por categoria', icon: Tag },
    { key: 'ticketMedio', label: 'Ticket médio', icon: Receipt },
    { key: 'receitaDespesa', label: 'Evolução (receita x despesa)', icon: TrendingUp },
    { key: 'rankingVendedores', label: 'Ranking de vendedores', icon: Users },
    { key: 'cancelamentos', label: 'Cancelamentos', icon: X },
  ];
  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>Escolha quais gráficos aparecem no seu painel.</p>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.map((it, i) => {
          const Icon = it.icon;
          return (
            <div key={it.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 2px', borderBottom: i === items.length - 1 ? 'none' : '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600 }}>
                <Icon size={16} color="var(--ink-soft)" /> {it.label}
              </div>
              <Toggle checked={!!widgets[it.key]} onChange={() => onToggle(it.key)} />
            </div>
          );
        })}
      </div>
      <Button variant="primary" onClick={onClose} style={{ width: '100%', marginTop: 20 }}>Concluir</Button>
    </div>
  );
}

function Dashboard({ data, role, currentVendedorId, period, setPeriod, onAddClick, onGoTo, onActivateNow, onCustomizeClick }) {
  const txs = scopedTransactions(data, role, currentVendedorId);
  const range = getPeriodRange(period);
  const despesas = sumByPeriod(txs, 'despesa', range.start, range.end);
  const receitas = sumByPeriod(txs, 'receita', range.start, range.end);
  const saldo = round2(receitas.total - despesas.total);
  const pendentes = txs.filter((t) => t.recorrente && getRecurrenceStatus(t) === 'pendente');
  const widgets = { ...DEFAULT_DASHBOARD_WIDGETS, ...(data.uiPrefs?.dashboardWidgets || {}) };

  const pieData = Object.entries(despesas.byCategory)
    .map(([catId, val]) => {
      const c = data.categories.find((cc) => cc.id === catId);
      return { name: c?.nome || 'Outros', value: val, color: c?.cor || '#7A6A58' };
    })
    .sort((a, b) => b.value - a.value);

  const recentTx = [...txs]
    .filter((t) => !t.recorrente || getRecurrenceStatus(t) !== 'pendente')
    .sort((a, b) => new Date(b.data) - new Date(a.data))
    .slice(0, 5);

  const ticketMedioReceita = receitas.count > 0 ? round2(receitas.total / receitas.count) : 0;
  const ticketMedioDespesa = despesas.count > 0 ? round2(despesas.total / despesas.count) : 0;

  // Visão geral da empresa (somente admin): evolução, crescimento, cancelamentos e ranking.
  const evolution = buildCompanyEvolution(txs, 6);
  const lastM = evolution[evolution.length - 1];
  const prevM = evolution[evolution.length - 2];
  const growthPct = (prevM && prevM.receita > 0) ? round2(((lastM.receita - prevM.receita) / prevM.receita) * 100) : null;
  const cancelamentos = buildCancelamentosPorMes(txs, 6);
  const totalCancelamentos6m = cancelamentos.reduce((s, c) => s + c.count, 0);
  const ranking = buildVendedorRanking(txs, data.vendedores, range.start, range.end);
  const nenhumWidgetAtivo = role === 'admin' && !widgets.categorias && !widgets.ticketMedio && !widgets.receitaDespesa && !widgets.rankingVendedores && !widgets.cancelamentos;

  return (
    <div style={{ paddingTop: 12 }}>
      <PeriodSelector value={period} onChange={setPeriod} />

      <Card style={{ marginTop: 14, background: 'var(--ink)', color: '#fff', border: 'none' }}>
        <div style={{ fontSize: 11.5, opacity: 0.7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Saldo do período</div>
        <div className="lomuz-display" style={{ fontSize: 34, margin: '6px 0 14px', color: saldo >= 0 ? '#8FE3B8' : '#F3A6AC' }}>
          {formatCurrency(saldo)}
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.65 }}>Receitas</div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{formatCurrency(receitas.total)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, opacity: 0.65 }}>Despesas</div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{formatCurrency(despesas.total)}</div>
          </div>
        </div>
      </Card>

      {pendentes.length > 0 && (
        <Card style={{ marginTop: 14, borderColor: 'var(--gold)', background: 'var(--gold-soft)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: '#8A6A1F' }}>
            <Clock size={16} /> {pendentes.length} lançamento(s) aguardando ativação
          </div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendentes.slice(0, 4).map((t) => {
              const c = data.categories.find((cc) => cc.id === t.categoriaId);
              return (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, color: '#6B5216', gap: 8 }}>
                  <span>{c?.nome} · {formatCurrency(t.valor)} · ativa em {daysUntil(t.dataAtivacao)} dia(s)</span>
                  <button onClick={() => onActivateNow(t)} style={{ background: 'none', border: 'none', color: 'var(--brand)', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline', flexShrink: 0 }}>
                    Ativar agora
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {txs.length === 0 ? (
        <EmptyState icon={Receipt} title="Comece por aqui" desc="Registre sua primeira receita ou despesa para ver seu saldo e gráficos." actionLabel="+ Novo lançamento" onAction={onAddClick} />
      ) : (
        <>
          {role !== 'admin' && (
            <>
              <SectionTitle icon={Tag}>Gastos por categoria</SectionTitle>
              <CategoryPieCard pieData={pieData} />
            </>
          )}

          <SectionTitle icon={Receipt} action={{ label: 'Ver todos', onClick: () => onGoTo('lancamentos') }}>Últimos lançamentos</SectionTitle>
          <Card style={{ padding: 0 }}>
            {recentTx.length === 0 && <div style={{ padding: 16, fontSize: 13, color: 'var(--ink-soft)' }}>Nada por aqui neste período.</div>}
            {recentTx.map((t, i) => <TransactionRow key={t.id} tx={t} category={data.categories.find((c) => c.id === t.categoriaId)} last={i === recentTx.length - 1} />)}
          </Card>

          {role === 'admin' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '14px 0 -6px' }}>
                <button onClick={onCustomizeClick} style={{ background: 'none', border: 'none', color: 'var(--brand)', fontWeight: 700, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
                  Personalizar gráficos
                </button>
              </div>

              {widgets.categorias && (
                <>
                  <SectionTitle icon={Tag}>Gastos por categoria</SectionTitle>
                  <CategoryPieCard pieData={pieData} />
                </>
              )}

              {widgets.ticketMedio && (
                <>
                  <SectionTitle icon={Receipt}>Ticket médio</SectionTitle>
                  <Card>
                    <div style={{ display: 'flex', gap: 28 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--ink-soft)' }}>Receita</div>
                        <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--positive)', margin: '4px 0 2px' }}>{formatCurrency(ticketMedioReceita)}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{receitas.count} lançamento(s)</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--ink-soft)' }}>Despesa</div>
                        <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--negative)', margin: '4px 0 2px' }}>{formatCurrency(ticketMedioDespesa)}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{despesas.count} lançamento(s)</div>
                      </div>
                    </div>
                  </Card>
                </>
              )}

              {widgets.receitaDespesa && (
                <>
                  <SectionTitle icon={TrendingUp}>Evolução da empresa</SectionTitle>
                  <Card>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--ink-soft)' }}>Receita x despesa · 6 meses</div>
                      {growthPct !== null && (
                        <div style={{ fontSize: 12, fontWeight: 700, color: growthPct >= 0 ? 'var(--positive)' : 'var(--negative)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          {growthPct >= 0 ? '↑' : '↓'} {Math.abs(growthPct)}% vs mês passado
                        </div>
                      )}
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={evolution} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} width={44} />
                        <Tooltip formatter={(v) => formatCurrency(v)} />
                        <Line type="monotone" dataKey="receita" name="Receita" stroke="var(--positive)" strokeWidth={2.5} dot={false} />
                        <Line type="monotone" dataKey="despesa" name="Despesa" stroke="var(--negative)" strokeWidth={2.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                    <div style={{ display: 'flex', gap: 14, marginTop: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--positive)' }} /> Receita</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--negative)' }} /> Despesa</div>
                    </div>
                  </Card>
                </>
              )}

              {widgets.rankingVendedores && (
                <>
                  <SectionTitle icon={Users}>Ranking de vendedores</SectionTitle>
                  {ranking.length === 0 ? (
                    <Card><p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>Nenhum vendedor cadastrado ainda.</p></Card>
                  ) : (
                    <Card style={{ padding: 0 }}>
                      {ranking.map((r, i) => (
                        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i === ranking.length - 1 ? 'none' : '1px solid var(--border)' }}>
                          <div style={{ width: 26, height: 26, borderRadius: '50%', background: i === 0 ? 'var(--gold-soft)' : 'var(--surface-2)', color: i === 0 ? '#8A6A1F' : 'var(--ink-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                            {i + 1}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.nome}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>Comissão {formatCurrency(r.comissao)}</div>
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--positive)', whiteSpace: 'nowrap' }}>{formatCurrency(r.vendas)}</div>
                        </div>
                      ))}
                    </Card>
                  )}
                </>
              )}

              {widgets.cancelamentos && (
                <>
                  <SectionTitle icon={X}>Cancelamentos de recorrência</SectionTitle>
                  <Card>
                    {totalCancelamentos6m === 0 ? (
                      <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>Nenhuma recorrência cancelada nos últimos 6 meses.</p>
                    ) : (
                      <>
                        <div style={{ fontSize: 13, marginBottom: 8 }}><strong>{totalCancelamentos6m}</strong> cancelamento(s) nos últimos 6 meses</div>
                        <ResponsiveContainer width="100%" height={90}>
                          <BarChart data={cancelamentos} margin={{ top: 0, right: 8, left: -30, bottom: 0 }}>
                            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} width={30} allowDecimals={false} />
                            <Tooltip />
                            <Bar dataKey="count" name="Cancelamentos" fill="var(--negative)" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </>
                    )}
                  </Card>
                </>
              )}

              {nenhumWidgetAtivo && (
                <Card><p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>Nenhum gráfico selecionado. Toque em "Personalizar gráficos" para escolher o que aparece aqui.</p></Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

/* =========================================================================
   PÁGINA: LANÇAMENTOS
   ========================================================================= */

function LancamentosPage({ data, role, currentVendedorId, onEdit, onImportClick }) {
  const [filterTipo, setFilterTipo] = useState('todos');
  const [filterCat, setFilterCat] = useState('todas');

  let list = scopedTransactions(data, role, currentVendedorId);
  if (filterTipo !== 'todos') list = list.filter((t) => t.tipo === filterTipo);
  if (filterCat !== 'todas') list = list.filter((t) => t.categoriaId === filterCat);
  list = [...list].sort((a, b) => new Date(b.data) - new Date(a.data));

  return (
    <div style={{ paddingTop: 12 }}>
      {role === 'admin' && (
        <button
          onClick={onImportClick}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--brand)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', padding: '0 0 10px' }}
        >
          <Upload size={14} /> Importar CSV (Asaas ou outro)
        </button>
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <Chip active={filterTipo === 'todos'} onClick={() => setFilterTipo('todos')}>Todos</Chip>
        <Chip active={filterTipo === 'receita'} onClick={() => setFilterTipo('receita')}>Receitas</Chip>
        <Chip active={filterTipo === 'despesa'} onClick={() => setFilterTipo('despesa')}>Despesas</Chip>
      </div>
      <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }}>
        <option value="todas">Todas as categorias</option>
        {data.categories.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>

      {list.length === 0 ? (
        <EmptyState icon={Receipt} title="Nada por aqui ainda" desc="Toque no botão + para registrar sua primeira receita ou despesa." />
      ) : (
        <Card style={{ padding: 0 }}>
          {list.map((tx, i) => (
            <TransactionRow key={tx.id} tx={tx} category={data.categories.find((c) => c.id === tx.categoriaId)} last={i === list.length - 1} onClick={() => onEdit(tx)} />
          ))}
        </Card>
      )}
    </div>
  );
}

/* =========================================================================
   IMPORTAÇÃO DE CSV (ASAAS OU OUTRO EXTRATO)
   ========================================================================= */

function ImportCsvModal({ categories, onImport, onClose }) {
  const [step, setStep] = useState('upload');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [fields, setFields] = useState([]);
  const [colData, setColData] = useState('');
  const [colValor, setColValor] = useState('');
  const [colDescricao, setColDescricao] = useState('');
  const [tipo, setTipo] = useState('receita');
  const [categoriaId, setCategoriaId] = useState('');
  const [error, setError] = useState('');
  const [importedCount, setImportedCount] = useState(0);

  const catsForTipo = categories.filter((c) => c.tipo === tipo);

  function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setError('');
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const flds = results.meta.fields || [];
        if (flds.length === 0 || results.data.length === 0) {
          setError('Não consegui ler nenhuma linha desse arquivo. Verifique se é um CSV válido.');
          return;
        }
        setFields(flds);
        setRows(results.data);
        setColData(guessColumn(flds, ['data', 'vencimento', 'pagamento', 'date']));
        setColValor(guessColumn(flds, ['valor', 'amount', 'preco', 'preço', 'value']));
        setColDescricao(guessColumn(flds, ['descri', 'cliente', 'nome', 'observ']) || '');
        setStep('mapping');
      },
      error: () => setError('Não consegui ler esse arquivo. Tente exportar novamente do Asaas.'),
    });
  }

  const parsed = rows.map((r) => ({
    data: parseDateFlexible(r[colData]),
    valor: parseNumberBR(r[colValor]),
    descricao: colDescricao ? (r[colDescricao] || '') : '',
  }));
  const validRows = parsed.filter((r) => r.data && !Number.isNaN(r.valor) && r.valor > 0);
  const invalidCount = parsed.length - validRows.length;

  function confirmImport() {
    if (!categoriaId) { setError('Escolha uma categoria para os lançamentos importados.'); return; }
    setError('');
    onImport(validRows.map((r) => ({ ...r, tipo, categoriaId })));
    setImportedCount(validRows.length);
    setStep('done');
  }

  return (
    <div>
      {step === 'upload' && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
            Selecione o arquivo .csv exportado do Asaas (extrato/relatório) ou de outro sistema. Você revisa tudo antes de confirmar.
          </p>
          <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, border: '2px dashed var(--border)', borderRadius: 14, padding: 28, cursor: 'pointer', color: 'var(--ink-soft)' }}>
            <Upload size={22} />
            <span style={{ fontSize: 13, fontWeight: 700 }}>Escolher arquivo CSV</span>
            <input type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: 'none' }} />
          </label>
          {error && <div style={{ color: 'var(--negative)', fontSize: 12.5, marginTop: 12, fontWeight: 600 }}>{error}</div>}
          <Button variant="secondary" onClick={onClose} style={{ width: '100%', marginTop: 20 }}>Cancelar</Button>
        </div>
      )}

      {step === 'mapping' && (
        <div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 12 }}>{fileName} · {rows.length} linha(s) encontrada(s)</div>

          <Field label="Coluna de data">
            <select value={colData} onChange={(e) => setColData(e.target.value)} style={inputStyle}>
              {fields.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Coluna de valor">
            <select value={colValor} onChange={(e) => setColValor(e.target.value)} style={inputStyle}>
              {fields.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Coluna de descrição (opcional)">
            <select value={colDescricao} onChange={(e) => setColDescricao(e.target.value)} style={inputStyle}>
              <option value="">Nenhuma</option>
              {fields.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button
              onClick={() => { setTipo('despesa'); setCategoriaId(''); }}
              style={{ flex: 1, padding: 10, borderRadius: 12, border: tipo === 'despesa' ? '2px solid var(--negative)' : '1px solid var(--border)', background: tipo === 'despesa' ? 'var(--negative-soft)' : 'var(--surface)', color: tipo === 'despesa' ? 'var(--negative)' : 'var(--ink-soft)', fontWeight: 700, cursor: 'pointer' }}
            >
              Despesa
            </button>
            <button
              onClick={() => { setTipo('receita'); setCategoriaId(''); }}
              style={{ flex: 1, padding: 10, borderRadius: 12, border: tipo === 'receita' ? '2px solid var(--positive)' : '1px solid var(--border)', background: tipo === 'receita' ? 'var(--positive-soft)' : 'var(--surface)', color: tipo === 'receita' ? 'var(--positive)' : 'var(--ink-soft)', fontWeight: 700, cursor: 'pointer' }}
            >
              Receita
            </button>
          </div>

          <Field label="Categoria para estes lançamentos" hint="Todos os itens importados entram nessa categoria; você pode mudar depois.">
            <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} style={inputStyle}>
              <option value="">Escolha uma categoria</option>
              {catsForTipo.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Field>

          <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: 12, marginBottom: 4 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>
              {validRows.length} lançamento(s) prontos para importar
              {invalidCount > 0 && <span style={{ color: 'var(--negative)', fontWeight: 600 }}> · {invalidCount} ignorado(s) (data ou valor inválido)</span>}
            </div>
            {validRows.slice(0, 4).map((r, i) => (
              <div key={i} style={{ fontSize: 12, color: 'var(--ink-soft)', display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span>{formatDateBR(r.data)} · {r.descricao || '(sem descrição)'}</span>
                <span>{formatCurrency(r.valor)}</span>
              </div>
            ))}
            {validRows.length > 4 && <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>+ {validRows.length - 4} outro(s)…</div>}
          </div>

          {error && <div style={{ color: 'var(--negative)', fontSize: 12.5, marginTop: 12, fontWeight: 600 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <Button variant="secondary" onClick={onClose} style={{ flex: 1 }}>Cancelar</Button>
            <Button variant="primary" onClick={confirmImport} style={{ flex: 2 }}>Importar {validRows.length} lançamento(s)</Button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Check size={40} color="var(--positive)" />
          <div style={{ fontWeight: 700, fontSize: 16, marginTop: 12 }}>{importedCount} lançamento(s) importado(s)!</div>
          <Button variant="primary" onClick={onClose} style={{ width: '100%', marginTop: 20 }}>Concluir</Button>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   PÁGINA: PREVISÃO
   ========================================================================= */

function CategoryForecast({ data, selectedCats, setSelectedCats, periodMode, setPeriodMode, customMonths, setCustomMonths, monthsCount }) {
  function toggleCat(id) {
    setSelectedCats((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));
  }
  const rows = useMemo(() => buildCategoryForecastRows(data.transactions, selectedCats, monthsCount), [data.transactions, selectedCats, monthsCount]);

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 14, lineHeight: 1.5 }}>
        Escolha as categorias para comparar a evolução mês a mês. A projeção considera lançamentos recorrentes ativos e lançamentos futuros já cadastrados.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {data.categories.map((c) => (
          <Chip key={c.id} active={selectedCats.includes(c.id)} onClick={() => toggleCat(c.id)}>{c.nome}</Chip>
        ))}
      </div>
      <MonthsPeriodSelector mode={periodMode} setMode={setPeriodMode} custom={customMonths} setCustom={setCustomMonths} />

      {selectedCats.length === 0 ? (
        <Card><p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>Selecione ao menos uma categoria para ver a projeção.</p></Card>
      ) : (
        <>
          <Card>
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={42} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                {selectedCats.map((catId) => {
                  const c = data.categories.find((cc) => cc.id === catId);
                  return <Line key={catId} type="monotone" dataKey={catId} name={c?.nome} stroke={c?.cor || '#7A6A58'} strokeWidth={2.5} dot={{ r: 3 }} />;
                })}
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <SectionTitle icon={Calendar}>Detalhe mês a mês</SectionTitle>
          <Card style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Mês</th>
                  {selectedCats.map((catId) => {
                    const c = data.categories.find((cc) => cc.id === catId);
                    return <th key={catId} style={thStyle}>{c?.nome}</th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td style={tdStyle}>{row.label}</td>
                    {selectedCats.map((catId) => <td key={catId} style={tdStyle}>{formatCurrency(row[catId] || 0)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

function EquipeForecast({ data, persist, monthsCount, periodMode, setPeriodMode, customMonths, setCustomMonths, askConfirm }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  function saveVendedor(v) {
    const list = editing ? data.vendedores.map((x) => (x.id === v.id ? v : x)) : [...data.vendedores, v];
    persist({ ...data, vendedores: list });
    setShowForm(false);
    setEditing(null);
  }
  function removeVendedor(id) {
    askConfirm('Remover este vendedor? As vendas já registradas continuam no histórico, mas deixam de contar para ele.', () => {
      persist({
        ...data,
        vendedores: data.vendedores.filter((v) => v.id !== id),
        transactions: data.transactions.map((t) => (t.vendedorId === id ? { ...t, vendedorId: null } : t)),
      });
    });
  }
  function updateMeta(vendedorId, monthKeyStr, value) {
    const v = data.vendedores.find((x) => x.id === vendedorId);
    const metas = { ...(v.metas || {}), [monthKeyStr]: Number(value) || 0 };
    persist({ ...data, vendedores: data.vendedores.map((x) => (x.id === vendedorId ? { ...x, metas } : x)) });
  }

  return (
    <div>
      <MonthsPeriodSelector mode={periodMode} setMode={setPeriodMode} custom={customMonths} setCustom={setCustomMonths} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button variant="secondary" onClick={() => { setEditing(null); setShowForm(true); }} style={{ fontSize: 13, padding: '8px 12px' }}>
          <Plus size={14} /> Vendedor
        </Button>
      </div>

      {data.vendedores.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum vendedor cadastrado" desc="Adicione vendedores para acompanhar vendas, comissão e metas." actionLabel="+ Adicionar vendedor" onAction={() => setShowForm(true)} />
      ) : (
        data.vendedores.map((v) => {
          const rows = buildVendedorForecastRows(data.transactions, v, monthsCount);
          return (
            <Card key={v.id} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{v.nome}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Comissão {v.comissaoPercentual}% · Meta padrão {formatCurrency(v.metaPadrao || 0)}</div>
                  <div style={{ fontSize: 11.5, marginTop: 2, color: v.profileId ? 'var(--positive)' : '#8A6A1F', fontWeight: 600 }}>
                    {v.profileId ? '✓ Conta vinculada' : `Aguardando cadastro (${v.conviteEmail})`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => { setEditing(v); setShowForm(true); }} style={iconBtnStyle}><Edit2 size={15} /></button>
                  <button onClick={() => removeVendedor(v.id)} style={iconBtnStyle}><Trash2 size={15} /></button>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={rows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={36} tickFormatter={(val) => `${Math.round(val / 1000)}k`} />
                  <Tooltip formatter={(val) => formatCurrency(val)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="vendas" name="Vendido" fill="var(--positive)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="meta" name="Meta" fill="var(--gold)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 10 }}>
                  <thead>
                    <tr><th style={thStyle}>Mês</th><th style={thStyle}>Vendido</th><th style={thStyle}>Meta</th><th style={thStyle}>Comissão</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key}>
                        <td style={tdStyle}>{r.label}</td>
                        <td style={tdStyle}>{formatCurrency(r.vendas)}</td>
                        <td style={tdStyle}>
                          <input type="number" defaultValue={r.meta} onBlur={(e) => updateMeta(v.id, r.key, e.target.value)} style={{ ...inputStyle, padding: '4px 6px', fontSize: 12, width: 90 }} />
                        </td>
                        <td style={tdStyle}>{formatCurrency(r.vendas * (v.comissaoPercentual / 100))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })
      )}

      {showForm && (
        <Modal title={editing ? 'Editar vendedor' : 'Novo vendedor'} onClose={() => { setShowForm(false); setEditing(null); }}>
          <VendedorForm vendedor={editing} onSubmit={saveVendedor} onCancel={() => { setShowForm(false); setEditing(null); }} />
        </Modal>
      )}
    </div>
  );
}

function VendedorForecast({ data, vendedorId, monthsCount, periodMode, setPeriodMode, customMonths, setCustomMonths }) {
  const v = data.vendedores.find((x) => x.id === vendedorId);
  if (!v) {
    return <EmptyState icon={Users} title="Nenhum vendedor selecionado" desc="Peça ao administrador para cadastrar seu perfil de vendedor." />;
  }
  const rows = buildVendedorForecastRows(data.transactions, v, monthsCount);
  const totalVendas = rows.reduce((s, r) => s + r.vendas, 0);
  const totalComissao = rows.reduce((s, r) => s + r.vendas * (v.comissaoPercentual / 100), 0);

  return (
    <div>
      <MonthsPeriodSelector mode={periodMode} setMode={setPeriodMode} custom={customMonths} setCustom={setCustomMonths} />
      <Card style={{ background: 'var(--ink)', color: '#fff', border: 'none', marginBottom: 16 }}>
        <div style={{ fontSize: 11.5, opacity: 0.7, textTransform: 'uppercase', fontWeight: 700 }}>{v.nome} · comissão {v.comissaoPercentual}%</div>
        <div style={{ display: 'flex', gap: 24, marginTop: 10 }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.65 }}>Vendas no período</div>
            <div className="lomuz-display" style={{ fontSize: 22 }}>{formatCurrency(totalVendas)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, opacity: 0.65 }}>Comissão a receber</div>
            <div className="lomuz-display" style={{ fontSize: 22, color: '#8FE3B8' }}>{formatCurrency(totalComissao)}</div>
          </div>
        </div>
      </Card>

      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} width={36} tickFormatter={(val) => `${Math.round(val / 1000)}k`} />
          <Tooltip formatter={(val) => formatCurrency(val)} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="vendas" name="Vendido" fill="var(--positive)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="meta" name="Meta" fill="var(--gold)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      <SectionTitle icon={Target}>Meta x realizado</SectionTitle>
      {rows.map((r) => {
        const pct = r.meta > 0 ? Math.min(150, Math.round((r.vendas / r.meta) * 100)) : 0;
        return (
          <Card key={r.key} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              <span>{r.label}</span><span>{pct}%</span>
            </div>
            <ProgressBar pct={pct} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 6, flexWrap: 'wrap', gap: 4 }}>
              <span>Vendido: {formatCurrency(r.vendas)}</span>
              <span>Meta: {formatCurrency(r.meta)}</span>
              <span>Comissão: {formatCurrency(r.vendas * (v.comissaoPercentual / 100))}</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function PrevisaoPage({ data, role, currentVendedorId, persist, askConfirm }) {
  const [subTab, setSubTab] = useState('financeiro');
  const [selectedCats, setSelectedCats] = useState(() => data.categories.slice(0, 3).map((c) => c.id));
  const [periodMode, setPeriodMode] = useState('6');
  const [customMonths, setCustomMonths] = useState(6);

  const monthsCount = periodMode === '6' ? 6 : periodMode === '12' ? 12 : Math.max(1, Math.min(36, Number(customMonths) || 1));

  if (role === 'vendedor') {
    return (
      <div style={{ paddingTop: 12 }}>
        <VendedorForecast data={data} vendedorId={currentVendedorId} monthsCount={monthsCount} periodMode={periodMode} setPeriodMode={setPeriodMode} customMonths={customMonths} setCustomMonths={setCustomMonths} />
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 12 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Chip active={subTab === 'financeiro'} onClick={() => setSubTab('financeiro')}>Financeiro</Chip>
        <Chip active={subTab === 'equipe'} onClick={() => setSubTab('equipe')}>Equipe de vendas</Chip>
      </div>
      {subTab === 'financeiro' ? (
        <CategoryForecast data={data} selectedCats={selectedCats} setSelectedCats={setSelectedCats} periodMode={periodMode} setPeriodMode={setPeriodMode} customMonths={customMonths} setCustomMonths={setCustomMonths} monthsCount={monthsCount} />
      ) : (
        <EquipeForecast data={data} persist={persist} monthsCount={monthsCount} periodMode={periodMode} setPeriodMode={setPeriodMode} customMonths={customMonths} setCustomMonths={setCustomMonths} askConfirm={askConfirm} />
      )}
    </div>
  );
}

/* =========================================================================
   PÁGINA: CATEGORIAS
   ========================================================================= */

function CategoriasPage({ data, persist, askConfirm }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const receitaCats = data.categories.filter((c) => c.tipo === 'receita');
  const despesaCats = data.categories.filter((c) => c.tipo === 'despesa');

  function save(cat) {
    const list = editing ? data.categories.map((c) => (c.id === cat.id ? cat : c)) : [...data.categories, cat];
    persist({ ...data, categories: list });
    setShowForm(false);
    setEditing(null);
  }
  function remove(id) {
    const inUse = data.transactions.some((t) => t.categoriaId === id);
    const msg = inUse
      ? 'Essa categoria tem lançamentos vinculados. Remover mesmo assim?'
      : 'Remover esta categoria?';
    askConfirm(msg, () => persist({ ...data, categories: data.categories.filter((c) => c.id !== id) }));
  }

  return (
    <div style={{ paddingTop: 12 }}>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 14, lineHeight: 1.5 }}>
        Organize suas receitas e despesas em categorias para os gráficos e a previsão ficarem certinhos.
      </p>

      <SectionTitle icon={ArrowUpCircle}>Receitas</SectionTitle>
      <Card style={{ padding: 0 }}>
        {receitaCats.length === 0 && <div style={{ padding: 16, fontSize: 13, color: 'var(--ink-soft)' }}>Nenhuma categoria de receita.</div>}
        {receitaCats.map((c, i) => <CategoryRow key={c.id} cat={c} last={i === receitaCats.length - 1} onEdit={() => { setEditing(c); setShowForm(true); }} onDelete={() => remove(c.id)} />)}
      </Card>

      <SectionTitle icon={ArrowDownCircle}>Despesas</SectionTitle>
      <Card style={{ padding: 0 }}>
        {despesaCats.length === 0 && <div style={{ padding: 16, fontSize: 13, color: 'var(--ink-soft)' }}>Nenhuma categoria de despesa.</div>}
        {despesaCats.map((c, i) => <CategoryRow key={c.id} cat={c} last={i === despesaCats.length - 1} onEdit={() => { setEditing(c); setShowForm(true); }} onDelete={() => remove(c.id)} />)}
      </Card>

      <Button variant="primary" onClick={() => { setEditing(null); setShowForm(true); }} style={{ width: '100%', marginTop: 16 }}>
        <Plus size={16} /> Nova categoria
      </Button>

      {showForm && (
        <Modal title={editing ? 'Editar categoria' : 'Nova categoria'} onClose={() => { setShowForm(false); setEditing(null); }}>
          <CategoryForm cat={editing} onSubmit={save} onCancel={() => { setShowForm(false); setEditing(null); }} />
        </Modal>
      )}
    </div>
  );
}

/* =========================================================================
   NAVEGAÇÃO
   ========================================================================= */

function TopBar({ role, nome, onLogout, pageTitle }) {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg)', paddingTop: 18, paddingBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '0 16px', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div className="lomuz-display" style={{ fontSize: 21, fontWeight: 600, color: 'var(--brand)' }}>Lomuz Control</div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>{pageTitle}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome}</div>
          <div style={{ fontSize: 10.5, color: 'var(--ink-soft)', marginTop: 2 }}>{role === 'admin' ? 'Administrador' : 'Vendedor'}</div>
          <button onClick={onLogout} style={{ background: 'none', border: 'none', color: 'var(--negative)', fontSize: 11, fontWeight: 700, cursor: 'pointer', marginTop: 4, padding: 0 }}>Sair</button>
        </div>
      </div>
    </div>
  );
}

function BottomNav({ page, setPage, onAdd, role }) {
  const items = role === 'vendedor'
    ? [{ key: 'inicio', label: 'Início', icon: Home }, { key: 'lancamentos', label: 'Vendas', icon: Receipt }, { key: 'previsao', label: 'Previsão', icon: TrendingUp }]
    : [{ key: 'inicio', label: 'Início', icon: Home }, { key: 'lancamentos', label: 'Lançamentos', icon: Receipt }, { key: 'previsao', label: 'Previsão', icon: TrendingUp }, { key: 'categorias', label: 'Categorias', icon: Tag }];
  const mid = Math.ceil(items.length / 2);
  const left = items.slice(0, mid);
  const right = items.slice(mid);

  function renderItem(it) {
    const Icon = it.icon;
    const active = page === it.key;
    return (
      <button key={it.key} onClick={() => setPage(it.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, color: active ? 'var(--brand)' : 'var(--ink-soft)', padding: '4px 8px', flex: 1 }}>
        <Icon size={20} strokeWidth={active ? 2.4 : 2} />
        <span style={{ fontSize: 10.5, fontWeight: active ? 700 : 500 }}>{it.label}</span>
      </button>
    );
  }

  return (
    <div className="lomuz-shell" style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%' }}>
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-around', alignItems: 'center', background: 'var(--surface)', borderTop: '1px solid var(--border)', padding: '8px 4px 10px' }}>
        {left.map(renderItem)}
        <div style={{ width: 58, flexShrink: 0 }} />
        {right.map(renderItem)}
        <button
          onClick={onAdd}
          aria-label="Novo lançamento"
          style={{ position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)', width: 56, height: 56, borderRadius: '50%', background: 'var(--brand)', color: '#fff', border: '4px solid var(--bg)', boxShadow: '0 8px 18px rgba(14,107,82,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          <Plus size={26} />
        </button>
      </div>
    </div>
  );
}

/* =========================================================================
   APP RAIZ
   ========================================================================= */

function LoginScreen() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError('');
    setInfo('');
    if (!email.trim() || !senha) { setError('Preencha e-mail e senha.'); return; }
    setLoading(true);
    if (mode === 'login') {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
      if (err) setError('E-mail ou senha incorretos.');
    } else {
      const { error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password: senha,
        options: { data: { nome: nome.trim() || email.trim() } },
      });
      if (err) setError(err.message || 'Não foi possível criar a conta.');
      else setInfo('Conta criada! Se pedir confirmação por e-mail, confirme e depois entre.');
    }
    setLoading(false);
  }

  return (
    <div className="lomuz-app" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <style>{GLOBAL_CSS}</style>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div className="lomuz-display" style={{ fontSize: 26, fontWeight: 600, color: 'var(--brand)', textAlign: 'center', marginBottom: 4 }}>Lomuz Control</div>
        <p style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13, marginBottom: 24 }}>
          {mode === 'login' ? 'Entre com sua conta' : 'Crie sua conta'}
        </p>
        <Card>
          {mode === 'signup' && (
            <Field label="Seu nome">
              <input type="text" style={inputStyle} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Ana Souza" />
            </Field>
          )}
          <Field label="E-mail">
            <input type="email" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
          </Field>
          <Field label="Senha">
            <input type="password" style={inputStyle} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••••" />
          </Field>
          {error && <div style={{ color: 'var(--negative)', fontSize: 12.5, marginBottom: 10, fontWeight: 600 }}>{error}</div>}
          {info && <div style={{ color: 'var(--positive)', fontSize: 12.5, marginBottom: 10, fontWeight: 600 }}>{info}</div>}
          <Button variant="primary" onClick={submit} style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Aguarde…' : (mode === 'login' ? 'Entrar' : 'Criar conta')}
          </Button>
        </Card>
        <button
          onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setInfo(''); }}
          style={{ display: 'block', margin: '16px auto 0', background: 'none', border: 'none', color: 'var(--brand)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        >
          {mode === 'login' ? 'Não tem conta? Criar uma' : 'Já tem conta? Entrar'}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = carregando, null = deslogado
  const [data, setData] = useState(null);
  const [nome, setNome] = useState('');
  const [page, setPage] = useState('inicio');
  const [role, setRole] = useState('vendedor');
  const [currentVendedorId, setCurrentVendedorId] = useState(null);
  const [period, setPeriod] = useState({ type: 'mes_atual', start: '', end: '' });

  const [showAddTx, setShowAddTx] = useState(false);
  const [showImportCsv, setShowImportCsv] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [txDraft, setTxDraft] = useState(null);
  const [txStep, setTxStep] = useState('form');

  const [confirmDialog, setConfirmDialog] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) loadData(session);
    else setData(null);
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (role === 'vendedor' && page === 'categorias') setPage('inicio'); }, [role]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData(s) {
    const userId = s.user.id;
    try {
      const [profileRes, catRes, vendRes, txRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('categories').select('*').order('nome'),
        supabase.from('vendedores').select('*'),
        supabase.from('transactions').select('*'),
      ]);
      const profile = profileRes.data;
      const vendedores = (vendRes.data || []).map(rowToVendedor);
      const r = profile?.role || 'vendedor';
      const myVendedor = vendedores.find((v) => v.profileId === userId);
      setData({
        categories: catRes.data || [],
        transactions: (txRes.data || []).map(rowToTx),
        vendedores,
        uiPrefs: {
          dashboardWidgets: (profile?.dashboard_widgets && Object.keys(profile.dashboard_widgets).length)
            ? profile.dashboard_widgets
            : { ...DEFAULT_DASHBOARD_WIDGETS },
        },
      });
      setRole(r);
      setCurrentVendedorId(r === 'vendedor' ? (myVendedor?.id || null) : null);
      setNome(profile?.nome || s.user.email);
    } catch (e) {
      console.error('Erro ao carregar dados do Supabase', e);
    }
  }

  // Compara o estado novo com o atual e envia ao Supabase só o que mudou
  // (inserções, atualizações e remoções), mantendo todos os componentes
  // que já chamam persist({ ...data, algumaCoisa: novoValor }) sem alterações.
  async function persist(newData) {
    const prev = data;
    setData(newData);
    const userId = session?.user?.id;

    try {
      // categorias
      const prevCats = prev?.categories || [];
      const newCats = newData.categories || [];
      const prevCatIds = new Set(prevCats.map((c) => c.id));
      for (const c of newCats) {
        const before = prevCats.find((x) => x.id === c.id);
        if (!before) await supabase.from('categories').insert(c);
        else if (JSON.stringify(before) !== JSON.stringify(c)) await supabase.from('categories').update(c).eq('id', c.id);
      }
      for (const c of prevCats) {
        if (!newCats.find((x) => x.id === c.id)) await supabase.from('categories').delete().eq('id', c.id);
      }

      // vendedores
      const prevVends = prev?.vendedores || [];
      const newVends = newData.vendedores || [];
      for (const v of newVends) {
        const before = prevVends.find((x) => x.id === v.id);
        if (!before) await supabase.from('vendedores').insert(vendedorToRow(v));
        else if (JSON.stringify(before) !== JSON.stringify(v)) await supabase.from('vendedores').update(vendedorToRow(v)).eq('id', v.id);
      }
      for (const v of prevVends) {
        if (!newVends.find((x) => x.id === v.id)) await supabase.from('vendedores').delete().eq('id', v.id);
      }

      // lançamentos
      const prevTxs = prev?.transactions || [];
      const newTxs = newData.transactions || [];
      for (const t of newTxs) {
        const before = prevTxs.find((x) => x.id === t.id);
        if (!before) await supabase.from('transactions').insert(txToRow(t, userId));
        else if (JSON.stringify(before) !== JSON.stringify(t)) await supabase.from('transactions').update(txToRow(t, userId)).eq('id', t.id);
      }
      for (const t of prevTxs) {
        if (!newTxs.find((x) => x.id === t.id)) await supabase.from('transactions').delete().eq('id', t.id);
      }

      // preferências do painel (fica no perfil de cada pessoa)
      const prevWidgets = prev?.uiPrefs?.dashboardWidgets;
      const newWidgets = newData?.uiPrefs?.dashboardWidgets;
      if (JSON.stringify(prevWidgets) !== JSON.stringify(newWidgets) && userId) {
        await supabase.from('profiles').update({ dashboard_widgets: newWidgets }).eq('id', userId);
      }
    } catch (e) {
      console.error('Erro ao salvar no Supabase', e);
    }
  }

  function askConfirm(message, onConfirm) { setConfirmDialog({ message, onConfirm }); }

  function handleToggleWidget(key) {
    const current = { ...DEFAULT_DASHBOARD_WIDGETS, ...(data.uiPrefs?.dashboardWidgets || {}) };
    const updated = { ...current, [key]: !current[key] };
    persist({ ...data, uiPrefs: { ...data.uiPrefs, dashboardWidgets: updated } });
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  function openAddTransaction() {
    setEditingTx(null);
    setTxDraft({
      tipo: role === 'vendedor' ? 'receita' : 'despesa',
      valor: '',
      categoriaId: '',
      descricao: '',
      data: toISODate(new Date()),
      recorrente: false,
      frequencia: 'mensal',
      semTermino: true,
      repeticoes: '',
      vendedorId: role === 'vendedor' ? (currentVendedorId || '') : '',
    });
    setTxStep('form');
    setShowAddTx(true);
  }
  function openEditTransaction(tx) {
    setEditingTx(tx);
    setTxDraft(txToDraft(tx));
    setTxStep('form');
    setShowAddTx(true);
  }
  function closeTxModal() {
    setShowAddTx(false);
    setEditingTx(null);
    setTxDraft(null);
    setTxStep('form');
  }

  function handleFormSubmit(draft) {
    setTxDraft(draft);
    const becomingRecurrent = draft.recorrente && !(editingTx && editingTx.recorrente);
    if (draft.recorrente && becomingRecurrent) {
      setTxStep('confirmRecurrence');
    } else {
      const activation = (editingTx && editingTx.recorrente)
        ? { mode: editingTx.ativacao, dias: editingTx.diasTeste || 7 }
        : { mode: 'imediata', dias: 7 };
      commitTransaction(draft, activation);
      closeTxModal();
    }
  }
  function handleActivationChoice(choice) {
    commitTransaction(txDraft, choice);
    closeTxModal();
  }
  function commitTransaction(draft, activation) {
    const tx = {
      id: editingTx?.id || uid(),
      tipo: draft.tipo,
      valor: parseFloat(draft.valor) || 0,
      categoriaId: draft.categoriaId,
      descricao: draft.descricao || '',
      data: draft.data,
      recorrente: !!draft.recorrente,
      frequencia: draft.recorrente ? draft.frequencia : null,
      repeticoes: (draft.recorrente && !draft.semTermino) ? (parseInt(draft.repeticoes, 10) || 1) : null,
      ativacao: draft.recorrente ? activation.mode : 'imediata',
      dataAtivacao: (draft.recorrente && activation.mode === 'agendada') ? toISODate(addDays(parseISODate(draft.data), Number(activation.dias) || 0)) : null,
      diasTeste: (draft.recorrente && activation.mode === 'agendada') ? (Number(activation.dias) || 0) : null,
      vendedorId: draft.vendedorId || null,
      dataCancelamento: editingTx?.dataCancelamento || null,
    };
    const list = editingTx ? data.transactions.map((t) => (t.id === tx.id ? tx : t)) : [...data.transactions, tx];
    persist({ ...data, transactions: list });
  }
  function requestDeleteTransaction(tx) {
    askConfirm('Excluir este lançamento?', () => {
      persist({ ...data, transactions: data.transactions.filter((t) => t.id !== tx.id) });
      closeTxModal();
    });
  }
  function requestCancelRecurrence(tx) {
    askConfirm('Cancelar esta recorrência? Os lançamentos futuros param, mas o histórico continua no seu painel.', () => {
      const updated = { ...tx, dataCancelamento: toISODate(new Date()) };
      persist({ ...data, transactions: data.transactions.map((t) => (t.id === tx.id ? updated : t)) });
      closeTxModal();
    });
  }
  function activateNow(tx) {
    const updated = { ...tx, ativacao: 'imediata', dataAtivacao: null, diasTeste: null };
    persist({ ...data, transactions: data.transactions.map((t) => (t.id === tx.id ? updated : t)) });
  }
  function handleImportCsv(newRows) {
    const novas = newRows.map((r) => ({
      id: uid(),
      tipo: r.tipo,
      valor: round2(r.valor),
      categoriaId: r.categoriaId,
      descricao: r.descricao || '',
      data: r.data,
      recorrente: false,
      frequencia: null,
      repeticoes: null,
      ativacao: 'imediata',
      dataAtivacao: null,
      diasTeste: null,
      vendedorId: null,
      dataCancelamento: null,
    }));
    persist({ ...data, transactions: [...data.transactions, ...novas] });
  }

  if (session === undefined) {
    return (
      <div className="lomuz-app" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{GLOBAL_CSS}</style>
        <span style={{ fontSize: 14, color: 'var(--ink-soft)' }}>Carregando…</span>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  if (!data) {
    return (
      <div className="lomuz-app" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{GLOBAL_CSS}</style>
        <span style={{ fontSize: 14, color: 'var(--ink-soft)' }}>Carregando Lomuz Control…</span>
      </div>
    );
  }

  const pageTitles = {
    inicio: 'Visão geral',
    lancamentos: role === 'vendedor' ? 'Suas vendas' : 'Lançamentos',
    previsao: role === 'vendedor' ? 'Sua previsão' : 'Previsão',
    categorias: 'Categorias',
  };

  return (
    <div className="lomuz-app" style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center' }}>
      <style>{GLOBAL_CSS}</style>
      <div className="lomuz-shell" style={{ width: '100%', minHeight: '100vh', position: 'relative', paddingBottom: 104 }}>
        <TopBar role={role} nome={nome} onLogout={handleLogout} pageTitle={pageTitles[page]} />
        <main style={{ padding: '0 16px' }}>
          {page === 'inicio' && (
            <Dashboard data={data} role={role} currentVendedorId={currentVendedorId} period={period} setPeriod={setPeriod} onAddClick={openAddTransaction} onGoTo={setPage} onActivateNow={activateNow} onCustomizeClick={() => setShowCustomize(true)} />
          )}
          {page === 'lancamentos' && (
            <LancamentosPage data={data} role={role} currentVendedorId={currentVendedorId} onEdit={openEditTransaction} onImportClick={() => setShowImportCsv(true)} />
          )}
          {page === 'previsao' && (
            <PrevisaoPage data={data} role={role} currentVendedorId={currentVendedorId} persist={persist} askConfirm={askConfirm} />
          )}
          {page === 'categorias' && role !== 'vendedor' && (
            <CategoriasPage data={data} persist={persist} askConfirm={askConfirm} />
          )}
        </main>
        <BottomNav page={page} setPage={setPage} onAdd={openAddTransaction} role={role} />

        {showAddTx && (
          <Modal
            title={editingTx ? 'Editar lançamento' : txStep === 'form' ? 'Novo lançamento' : txStep === 'confirmRecurrence' ? 'Confirmar recorrência' : 'Ativação da recorrência'}
            onClose={closeTxModal}
          >
            {txStep === 'form' && (
              <TransactionForm
                draft={txDraft}
                categories={data.categories}
                role={role}
                vendedores={data.vendedores}
                onSubmit={handleFormSubmit}
                onCancel={closeTxModal}
                onDelete={editingTx ? () => requestDeleteTransaction(editingTx) : null}
                onCancelRecurrence={(editingTx && editingTx.recorrente && getRecurrenceStatus(editingTx) === 'ativo') ? () => requestCancelRecurrence(editingTx) : null}
              />
            )}
            {txStep === 'confirmRecurrence' && (
              <ConfirmRecurrenceStep draft={txDraft} category={data.categories.find((c) => c.id === txDraft.categoriaId)} onBack={() => setTxStep('form')} onConfirm={() => setTxStep('activation')} />
            )}
            {txStep === 'activation' && (
              <ActivationStep draft={txDraft} onBack={() => setTxStep('confirmRecurrence')} onConfirm={handleActivationChoice} />
            )}
          </Modal>
        )}

        {showImportCsv && (
          <Modal title="Importar CSV" onClose={() => setShowImportCsv(false)}>
            <ImportCsvModal categories={data.categories} onImport={handleImportCsv} onClose={() => setShowImportCsv(false)} />
          </Modal>
        )}

        {showCustomize && (
          <Modal title="Personalizar painel" onClose={() => setShowCustomize(false)}>
            <DashboardCustomizeModal
              widgets={{ ...DEFAULT_DASHBOARD_WIDGETS, ...(data.uiPrefs?.dashboardWidgets || {}) }}
              onToggle={handleToggleWidget}
              onClose={() => setShowCustomize(false)}
            />
          </Modal>
        )}

        {confirmDialog && (
          <ConfirmDialog
            message={confirmDialog.message}
            onCancel={() => setConfirmDialog(null)}
            onConfirm={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}
          />
        )}
      </div>
    </div>
  );
}
