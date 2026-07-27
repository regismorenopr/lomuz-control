import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  Home, Receipt, TrendingUp, Tag, Plus, X, Calendar, ChevronRight, Repeat, Check,
  ArrowUpCircle, ArrowDownCircle, Users, Trash2, Edit2, Clock, Target, Upload,
  Utensils, Car, Film, HeartPulse, ShoppingBag, Briefcase, GraduationCap, Wallet,
  Gift, Smartphone, PawPrint, MoreHorizontal, Sparkles, Megaphone, Pin, FileText, Palette, Award, Search,
} from 'lucide-react';
import Papa from 'papaparse';
import { supabase } from './supabaseClient';
import { GLOBAL_CSS } from './styles/tokens.js';
import { AppShell, navItemsFor } from './components/AppShell.jsx';
import { LogoHorizontal } from './brand/Logo.jsx';
import {
  StatCard, TrendIndicator, StatusBadge, CashFlowChart, Panel, PanelLink,
  EmptyBlock, NotAvailableBlock, StatCardSkeleton, Skeleton, formatBRL,
} from './components/dashboard.jsx';
import { CurrencyInput } from './components/CurrencyInput.jsx';

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
    status: tx.status || 'aprovado',
    cliente_nome: tx.clienteNome || null,
    contrato_meses: tx.contratoMeses || null,
    forma_pagamento: tx.formaPagamento || null,
    plano_id: tx.planoId || null,
    comissao_percentual: tx.comissaoPercentual != null ? tx.comissaoPercentual : null,
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
    status: row.status || 'aprovado',
    clienteNome: row.cliente_nome || '',
    contratoMeses: row.contrato_meses,
    formaPagamento: row.forma_pagamento || '',
    planoId: row.plano_id || null,
    comissaoPercentual: row.comissao_percentual != null ? Number(row.comissao_percentual) : null,
  };
}
function planoToRow(p) {
  return {
    id: p.id,
    nome: p.nome,
    valor: p.valor || 0,
    categoria_id: p.categoriaId || null,
    comissao_percentual: p.comissaoPercentual || 0,
    contrato_meses: p.contratoMeses || null,
    recorrente: !!p.recorrente,
    frequencia: p.frequencia || null,
    ativo: p.ativo !== false,
  };
}
function rowToPlano(row) {
  return {
    id: row.id,
    nome: row.nome,
    valor: Number(row.valor) || 0,
    categoriaId: row.categoria_id,
    comissaoPercentual: Number(row.comissao_percentual) || 0,
    contratoMeses: row.contrato_meses,
    recorrente: !!row.recorrente,
    frequencia: row.frequencia || 'mensal',
    ativo: row.ativo !== false,
  };
}

function orientacaoToRow(o) {
  return {
    id: o.id,
    titulo: o.titulo,
    conteudo: o.conteudo || '',
    anexos: o.anexos || [],
    fixado: !!o.fixado,
  };
}
function rowToOrientacao(row) {
  return {
    id: row.id,
    titulo: row.titulo,
    conteudo: row.conteudo || '',
    anexos: Array.isArray(row.anexos) ? row.anexos : [],
    fixado: !!row.fixado,
    createdAt: row.created_at,
  };
}

// Comissão que vale para uma venda: ajuste do admin > comissão do plano
// negociado > comissão padrão do vendedor.
function comissaoDaVenda(tx, vendedor, planos) {
  if (tx.comissaoPercentual != null) return tx.comissaoPercentual;
  const plano = tx.planoId ? (planos || []).find((p) => p.id === tx.planoId) : null;
  if (plano) return plano.comissaoPercentual || 0;
  return vendedor?.comissaoPercentual || 0;
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
// Vendas lançadas por vendedores só entram nos cálculos (saldo, metas, comissão,
// gráficos) depois que o admin aprova — enquanto estão "pendente" ou "rejeitado"
// elas aparecem na lista, mas não geram ocorrências financeiras.
function expandOccurrences(tx, rangeStart, rangeEnd) {
  if (tx.status && tx.status !== 'aprovado') return [];
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
    case 'proximos_3':
      return { start: startOfMonth(today), end: endOfMonth(addMonths(today, 2)) };
    case 'proximos_6':
      return { start: startOfMonth(today), end: endOfMonth(addMonths(today, 5)) };
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

// Janela imediatamente anterior, do mesmo tamanho — base da comparação "vs
// período anterior" nos cartões. Para mês/mês usa o mês calendário anterior;
// para intervalos livres, desloca a janela pela própria duração.
function getPreviousPeriodRange(period) {
  const today = new Date();
  switch (period.type) {
    case 'mes_atual': {
      const m = addMonths(today, -1);
      return { start: startOfMonth(m), end: endOfMonth(m) };
    }
    case 'mes_passado': {
      const m = addMonths(today, -2);
      return { start: startOfMonth(m), end: endOfMonth(m) };
    }
    case 'ultimos_3':
      return { start: startOfMonth(addMonths(today, -5)), end: endOfMonth(addMonths(today, -3)) };
    case 'proximos_3':
      return { start: startOfMonth(addMonths(today, -3)), end: endOfMonth(addMonths(today, -1)) };
    case 'proximos_6':
      return { start: startOfMonth(addMonths(today, -6)), end: endOfMonth(addMonths(today, -1)) };
    case 'ano_atual':
      return { start: new Date(today.getFullYear() - 1, 0, 1), end: new Date(today.getFullYear() - 1, 11, 31) };
    case 'custom': {
      const atual = getPeriodRange(period);
      const dias = Math.max(1, Math.round((atual.end - atual.start) / 86400000) + 1);
      return { start: addDays(atual.start, -dias), end: addDays(atual.start, -1) };
    }
    default: {
      const m = addMonths(today, -1);
      return { start: startOfMonth(m), end: endOfMonth(m) };
    }
  }
}

// Variação percentual entre dois valores. Retorna null quando não há base de
// comparação (anterior zerado), para o cartão dizer isso em vez de mostrar
// um "+100%" enganoso.
function variacaoPct(atual, anterior) {
  if (!anterior || anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

// Saldo acumulado: tudo que entrou menos tudo que saiu, desde sempre até hoje.
// Não é saldo bancário conciliado — o app não tem conta bancária integrada —
// e o cartão diz isso na dica de contexto.
function saldoAcumuladoAteHoje(transactions) {
  const inicio = new Date(2000, 0, 1);
  const hoje = new Date();
  const rec = sumByPeriod(transactions, 'receita', inicio, hoje).total;
  const desp = sumByPeriod(transactions, 'despesa', inicio, hoje).total;
  return round2(rec - desp);
}

// Entradas x saídas mês a mês, no formato que o gráfico de fluxo de caixa usa.
// monthsForward > 0 estende a série para meses futuros (períodos "Próx. N meses").
function buildCashFlowRows(transactions, monthsBack, monthsForward = 0) {
  return buildCompanyEvolution(transactions, monthsBack, monthsForward).map((r) => ({
    key: r.key, label: r.label, entradas: r.receita, saidas: r.despesa,
  }));
}

// Saldo acumulado (desde 2000) mês a mês — usado quando o usuário clica no
// cartão "Saldo acumulado" pra ver a evolução em vez do total fixo de hoje.
function buildAccumulatedBalanceRows(transactions, monthsBack, monthsForward = 0) {
  const today = new Date();
  const inicio = new Date(2000, 0, 1);
  const rows = [];
  for (let i = -(monthsBack - 1); i <= monthsForward; i += 1) {
    const m = addMonths(startOfMonth(today), i);
    const re = endOfMonth(m);
    const rec = sumByPeriod(transactions, 'receita', inicio, re).total;
    const desp = sumByPeriod(transactions, 'despesa', inicio, re).total;
    rows.push({ key: monthKey(m), label: monthLabel(m), saldo: round2(rec - desp) });
  }
  return rows;
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

/* =========================================================================
   PAINEL DE VENDEDORES (panorama de vendas, metas e comissão por período)
   ========================================================================= */

// Lista de meses (1º dia de cada mês) entre "start" e "end", nessa ordem cronológica,
// funcionando tanto pra intervalos futuros quanto passados.
function monthsBetween(start, end) {
  const s = startOfMonth(start);
  const e = startOfMonth(end);
  const months = [];
  const step = s <= e ? 1 : -1;
  let cursor = s;
  while (true) {
    months.push(cursor);
    if (monthKey(cursor) === monthKey(e)) break;
    cursor = addMonths(cursor, step);
  }
  if (step === -1) months.reverse();
  return months;
}

function monthInputValue(date) { return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`; }
function parseMonthInput(str) {
  const [y, m] = str.split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1);
}

function computeMonthsForRange(mode, customFrom, customTo) {
  const today = startOfMonth(new Date());
  if (mode === 'prox3') return monthsBetween(today, addMonths(today, 2));
  if (mode === 'prox6') return monthsBetween(today, addMonths(today, 5));
  if (mode === 'prox12') return monthsBetween(today, addMonths(today, 11));
  const from = customFrom ? parseMonthInput(customFrom) : today;
  const to = customTo ? parseMonthInput(customTo) : today;
  return monthsBetween(from, to);
}

// Vendido/meta/comissão de um vendedor mês a mês, numa lista arbitrária de meses
// (passados, futuros ou os dois), com filtro opcional de categorias (produtos/serviços).
function buildVendedorRangeRows(transactions, vendedor, months, categoryIds, planos) {
  return months.map((m) => {
    const rs = startOfMonth(m);
    const re = endOfMonth(m);
    let vendas = 0;
    let comissao = 0;
    transactions
      .filter((t) => t.vendedorId === vendedor.id && t.tipo === 'receita'
        && (!categoryIds || categoryIds.length === 0 || categoryIds.includes(t.categoriaId)))
      .forEach((tx) => {
        const valorNoMes = tx.valor * expandOccurrences(tx, rs, re).length;
        vendas += valorNoMes;
        comissao += valorNoMes * (comissaoDaVenda(tx, vendedor, planos) / 100);
      });
    const key = monthKey(m);
    const meta = (vendedor.metas && vendedor.metas[key] != null) ? vendedor.metas[key] : (vendedor.metaPadrao || 0);
    return { key, label: monthLabel(m), vendas: round2(vendas), meta: round2(meta), comissao: round2(comissao) };
  });
}

// Mesma coisa, somando a equipe inteira mês a mês.
// metasEquipe: mapa { 'YYYY-MM': valor } com a meta da empresa. Quando o mês tem
// meta própria definida pelo admin, ela vale; senão vale a soma das individuais.
function buildTeamRangeRows(transactions, vendedores, months, categoryIds, planos, metasEquipe) {
  const perVendedor = vendedores.map((v) => buildVendedorRangeRows(transactions, v, months, categoryIds, planos));
  return months.map((m, i) => {
    let vendas = 0, somaMetas = 0, comissao = 0;
    perVendedor.forEach((rows) => { vendas += rows[i].vendas; somaMetas += rows[i].meta; comissao += rows[i].comissao; });
    const key = monthKey(m);
    const metaEmpresa = metasEquipe ? metasEquipe[key] : undefined;
    const usaMetaEmpresa = metaEmpresa != null;
    return {
      key,
      label: monthLabel(m),
      vendas: round2(vendas),
      meta: round2(usaMetaEmpresa ? metaEmpresa : somaMetas),
      comissao: round2(comissao),
      usaMetaEmpresa,
      somaMetas: round2(somaMetas),
    };
  });
}

// Mensagem motivacional baseada no desempenho (meta batida, quase lá, ou abaixo) —
// o tom da sugestão é sempre construtivo, só a cor de destaque muda.
function buildMotivationalMessage(rows, nome) {
  const comMeta = rows.filter((r) => r.meta > 0);
  if (comMeta.length === 0) {
    return { tone: 'neutral', text: `Defina uma meta mensal para ${nome} pra acompanhar o progresso e receber sugestões automáticas.` };
  }
  const avgPct = Math.round((comMeta.reduce((s, r) => s + r.vendas / r.meta, 0) / comMeta.length) * 100);
  const last = comMeta[comMeta.length - 1];
  const prev = comMeta.length > 1 ? comMeta[comMeta.length - 2] : null;
  const melhorando = prev ? last.vendas > prev.vendas : false;

  if (avgPct >= 100) {
    return {
      tone: 'positive',
      text: `${nome} está batendo a meta — média de ${avgPct}% no período! Que tal propor uma meta 10% maior pro próximo mês, com algum incentivo extra pra manter o ritmo?`,
    };
  }
  if (avgPct >= 70) {
    return {
      tone: 'warning',
      text: `${nome} está em ${avgPct}% da meta, bem perto de bater. ${melhorando ? 'A tendência já é de melhora — ' : ''}vale focar nos produtos ou serviços com melhor conversão pra fechar o período com força.`,
    };
  }
  return {
    tone: 'negative',
    text: `${nome} está em ${avgPct}% da meta no período. Pode ser um bom momento pra conversar sobre os desafios e ajustar junto o foco — priorizar os contatos mais quentes e revisar uma meta mais realista de curto prazo costuma ajudar a retomar o ritmo.`,
  };
}

// Evolução da empresa: receita x despesa mês a mês, últimos N meses (incluindo
// o atual) e, opcionalmente, meses futuros (períodos "Próx. N meses" usam
// lançamentos recorrentes/futuros já cadastrados via expandOccurrences).
function buildCompanyEvolution(transactions, monthsBack, monthsForward = 0) {
  const today = new Date();
  const rows = [];
  for (let i = -(monthsBack - 1); i <= monthsForward; i += 1) {
    const m = addMonths(startOfMonth(today), i);
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
function buildVendedorRanking(transactions, vendedores, rangeStart, rangeEnd, planos) {
  return vendedores
    .map((v) => {
      let vendas = 0;
      let comissao = 0;
      transactions
        .filter((t) => t.tipo === 'receita' && t.vendedorId === v.id)
        .forEach((tx) => {
          const valor = tx.valor * expandOccurrences(tx, rangeStart, rangeEnd).length;
          vendas += valor;
          comissao += valor * (comissaoDaVenda(tx, v, planos) / 100);
        });
      return { id: v.id, nome: v.nome, vendas: round2(vendas), comissao: round2(comissao) };
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
    status: tx.status || 'aprovado',
    clienteNome: tx.clienteNome || '',
    contratoMeses: tx.contratoMeses != null ? String(tx.contratoMeses) : '',
    formaPagamento: tx.formaPagamento || '',
    planoId: tx.planoId || '',
    comissaoPercentual: tx.comissaoPercentual != null ? String(tx.comissaoPercentual) : '',
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
const COLOR_CHOICES = ['#6D28D9', '#8B5CF6', '#4338CA', '#2563EB', '#15803D', '#0D9488', '#D97706', '#DC2626', '#DB2777', '#667085'];

// Gráficos opcionais do painel (Admin) — todos ligados por padrão, o usuário pode desligar.
const DEFAULT_DASHBOARD_WIDGETS = {
  categorias: true,
  ticketMedio: true,
  receitaDespesa: true,
  rankingVendedores: true,
  cancelamentos: true,
};


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

// Os tokens visuais (cores, raios, sombras, grades e responsividade) ficam
// centralizados em src/styles/tokens.js.

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
        <Icon size={22} color="var(--primary-text)" />
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
        <button onClick={action.onClick} style={{ background: 'none', border: 'none', color: 'var(--primary-text)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
          {action.label} <ChevronRight size={13} />
        </button>
      )}
    </div>
  );
}

function OptionCard({ active, title, desc, onClick, children }) {
  return (
    <div onClick={onClick} style={{ border: active ? '2px solid var(--primary-text)' : '1px solid var(--border)', background: active ? 'var(--brand-soft)' : 'var(--surface)', borderRadius: 14, padding: 14, cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${active ? 'var(--primary-text)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {active && <div style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--primary-text)' }} />}
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
          {status === 'pendente' && <span style={{ color: 'var(--warning-strong)', fontWeight: 700 }}>· Pendente</span>}
          {status === 'cancelado' && <span style={{ color: 'var(--negative)', fontWeight: 700 }}>· Cancelado</span>}
          {tx.status === 'pendente' && <span style={{ color: 'var(--warning-strong)', fontWeight: 700 }}>· Aguardando aprovação</span>}
          {tx.status === 'rejeitado' && <span style={{ color: 'var(--negative)', fontWeight: 700 }}>· Rejeitada</span>}
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
  // Ordem cronológica: passado à esquerda, este mês pré-selecionado no meio,
  // futuro à direita — assim como pedido.
  const presets = [
    { key: 'ultimos_3', label: 'Últimos 3 meses' },
    { key: 'mes_atual', label: 'Este mês' },
    { key: 'proximos_3', label: 'Próx. 3 meses' },
    { key: 'proximos_6', label: 'Próx. 6 meses' },
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

// Seletor de período por mês/ano, com atalhos pros próximos 3/6/12 meses e um
// intervalo personalizado que pode ir tanto pro passado quanto pro futuro.
function RangePeriodSelector({ mode, setMode, customFrom, setCustomFrom, customTo, setCustomTo }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Chip active={mode === 'prox3'} onClick={() => setMode('prox3')}>Próx. 3 meses</Chip>
        <Chip active={mode === 'prox6'} onClick={() => setMode('prox6')}>Próx. 6 meses</Chip>
        <Chip active={mode === 'prox12'} onClick={() => setMode('prox12')}>Próx. 12 meses</Chip>
        <Chip active={mode === 'custom'} onClick={() => setMode('custom')}>Personalizado</Chip>
      </div>
      {mode === 'custom' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <label style={{ flex: 1, minWidth: 120 }}>
            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>De</span>
            <input type="month" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ flex: 1, minWidth: 120 }}>
            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>Até</span>
            <input type="month" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={inputStyle} />
          </label>
        </div>
      )}
    </div>
  );
}

// Campo de meta com máscara de reais que só avisa o pai (persist) ao sair do
// campo — evita gravar a cada tecla digitada, igual ao <input onBlur> antigo.
function MetaCurrencyField({ value, onCommit }) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <CurrencyInput
      value={local}
      onChange={setLocal}
      onBlur={() => onCommit(local)}
      style={{ ...inputStyle, padding: '3px 6px', fontSize: 11.5, width: 104 }}
    />
  );
}

// Cartão de resumo + mensagem motivacional + meta x realizado mês a mês,
// usado tanto pra um vendedor individual quanto pra soma da equipe toda.
function VendedorPanoramaView({ vendedor, rows, isTeam, vendedoresCount, onEditMeta }) {
  const totalVendas = rows.reduce((s, r) => s + r.vendas, 0);
  const totalComissao = rows.reduce((s, r) => s + r.comissao, 0);
  const msg = !isTeam && vendedor ? buildMotivationalMessage(rows, vendedor.nome) : null;
  const msgColors = {
    positive: { border: 'var(--positive)', bg: 'var(--positive-soft)' },
    warning: { border: 'var(--gold)', bg: 'var(--warning-light)' },
    negative: { border: 'var(--negative)', bg: 'var(--negative-soft)' },
    neutral: { border: 'var(--border)', bg: 'var(--surface-2)' },
  };

  return (
    <div>
      <Card style={{ background: 'var(--sidebar)', color: '#fff', border: 'none', marginBottom: 16 }}>
        <div style={{ fontSize: 11.5, opacity: 0.7, textTransform: 'uppercase', fontWeight: 700 }}>
          {isTeam ? `Equipe toda · ${vendedoresCount} vendedor(es)` : `${vendedor.nome} · comissão ${vendedor.comissaoPercentual}%`}
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.65 }}>Vendido no período</div>
            <div className="lomuz-display" style={{ fontSize: 22 }}>{formatCurrency(totalVendas)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, opacity: 0.65 }}>Comissão a receber</div>
            <div className="lomuz-display" style={{ fontSize: 22, color: '#C4B5FD' }}>{formatCurrency(totalComissao)}</div>
          </div>
        </div>
      </Card>

      {msg && (
        <Card style={{ marginBottom: 16, borderColor: msgColors[msg.tone].border, background: msgColors[msg.tone].bg }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Sparkles size={16} style={{ marginTop: 2, flexShrink: 0, color: msgColors[msg.tone].border }} />
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{msg.text}</p>
          </div>
        </Card>
      )}

      <SectionTitle icon={Target}>Meta x realizado por mês</SectionTitle>
      {rows.length === 0 ? (
        <Card><p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>Nenhum mês no período selecionado.</p></Card>
      ) : rows.map((r) => {
        const pct = r.meta > 0 ? Math.round((r.vendas / r.meta) * 100) : null;
        const accent = pct == null ? 'var(--border)' : pct >= 100 ? 'var(--positive)' : pct >= 70 ? 'var(--gold)' : 'var(--negative)';
        return (
          <Card key={r.key} style={{ marginBottom: 10, borderLeft: `4px solid ${accent}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              <span>{r.label}</span>
              <span style={{ color: pct == null ? 'var(--ink-soft)' : accent }}>{pct != null ? `${pct}%` : 'sem meta'}</span>
            </div>
            {pct != null && <ProgressBar pct={Math.min(150, pct)} />}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 6, flexWrap: 'wrap', gap: 8 }}>
              <span>Vendido: {formatCurrency(r.vendas)}</span>
              {onEditMeta ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Meta: <MetaCurrencyField value={r.meta} onCommit={(v) => onEditMeta(r.key, v)} />
                </span>
              ) : (
                <span>Meta: {formatCurrency(r.meta)}</span>
              )}
              <span>Comissão: {formatCurrency(r.comissao)}</span>
            </div>
            {isTeam && (
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 6, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span>{r.usaMetaEmpresa ? 'Meta da empresa (definida por você)' : 'Somando as metas dos vendedores'}</span>
                {r.usaMetaEmpresa && r.somaMetas !== r.meta && (
                  <span>Soma dos vendedores: {formatCurrency(r.somaMetas)}</span>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/* =========================================================================
   MURAL DE ORIENTAÇÃO (recados do admin + anexos em PDF)
   ========================================================================= */

// O bucket "documentos" é privado, então o link do PDF é gerado na hora do
// clique e vale por 1 hora — nada de guardar URL pública no banco.
async function abrirAnexo(anexo, onError) {
  const { data, error } = await supabase.storage.from('documentos').createSignedUrl(anexo.path, 3600);
  if (error || !data?.signedUrl) {
    onError('Não foi possível abrir o arquivo. Tente de novo em alguns instantes.');
    return;
  }
  window.open(data.signedUrl, '_blank', 'noopener');
}

function ordenarOrientacoes(list) {
  return [...(list || [])].sort((a, b) => {
    if (!!b.fixado !== !!a.fixado) return b.fixado ? 1 : -1;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
}

function AnexoLinks({ anexos, onError }) {
  if (!anexos || anexos.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
      {anexos.map((a) => (
        <button
          key={a.path}
          onClick={() => abrirAnexo(a, onError)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '6px 10px', fontSize: 12, fontWeight: 600, color: 'var(--primary-text)', cursor: 'pointer', maxWidth: '100%' }}
        >
          <FileText size={13} style={{ flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome}</span>
        </button>
      ))}
    </div>
  );
}

function MuralCard({ orientacoes, role, onEdit }) {
  const [erro, setErro] = useState('');
  const lista = ordenarOrientacoes(orientacoes);

  // Vendedor não vê um card vazio; admin vê, com o convite pra escrever o primeiro recado.
  if (lista.length === 0 && role !== 'admin') return null;

  return (
    <>
      <SectionTitle icon={Megaphone} action={role === 'admin' ? { label: 'Editar mural', onClick: onEdit } : null}>
        Mural de orientação
      </SectionTitle>
      {lista.length === 0 ? (
        <Card>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0, lineHeight: 1.5 }}>
            Nenhum recado ainda. Use o mural para passar orientações e materiais (PDF) para a equipe de vendas.
          </p>
        </Card>
      ) : (
        lista.map((o) => (
          <Card key={o.id} style={{ marginBottom: 10, borderLeft: o.fixado ? '4px solid var(--gold)' : undefined }}>
            <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              {o.fixado && <Pin size={13} style={{ color: 'var(--gold-strong)', flexShrink: 0 }} />}
              {o.titulo}
            </div>
            {o.conteudo && (
              <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.55, margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{o.conteudo}</p>
            )}
            <AnexoLinks anexos={o.anexos} onError={setErro} />
          </Card>
        ))
      )}
      {erro && <div style={{ color: 'var(--negative)', fontSize: 12.5, fontWeight: 600, marginTop: 8 }}>{erro}</div>}
    </>
  );
}

function MuralAdminModal({ orientacoes, persistOrientacoes, askConfirm }) {
  const [editando, setEditando] = useState(null); // null = lista, objeto = form
  const [titulo, setTitulo] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [fixado, setFixado] = useState(false);
  const [anexos, setAnexos] = useState([]);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const lista = ordenarOrientacoes(orientacoes);

  function abrirForm(o) {
    setEditando(o || { novo: true });
    setTitulo(o?.titulo || '');
    setConteudo(o?.conteudo || '');
    setFixado(!!o?.fixado);
    setAnexos(o?.anexos || []);
    setErro('');
  }

  async function enviarPdf(file) {
    if (!file) return;
    if (file.type !== 'application/pdf') { setErro('Só arquivos PDF são aceitos.'); return; }
    if (file.size > 10 * 1024 * 1024) { setErro('O arquivo passa de 10 MB. Escolha um PDF menor.'); return; }
    setErro('');
    setEnviando(true);
    const path = `orientacoes/${uid()}.pdf`;
    const { error } = await supabase.storage.from('documentos').upload(path, file, { contentType: 'application/pdf' });
    setEnviando(false);
    if (error) { setErro('Não foi possível enviar o PDF. Tente de novo.'); return; }
    setAnexos((list) => [...list, { nome: file.name, path }]);
  }

  async function removerAnexo(anexo) {
    setAnexos((list) => list.filter((a) => a.path !== anexo.path));
    await supabase.storage.from('documentos').remove([anexo.path]);
  }

  function salvar() {
    if (!titulo.trim()) { setErro('Escreva um título para o recado.'); return; }
    const registro = {
      id: editando?.novo ? uid() : editando.id,
      titulo: titulo.trim(),
      conteudo: conteudo.trim(),
      anexos,
      fixado,
      createdAt: editando?.novo ? new Date().toISOString() : editando.createdAt,
    };
    const nova = editando?.novo
      ? [...(orientacoes || []), registro]
      : (orientacoes || []).map((o) => (o.id === registro.id ? registro : o));
    persistOrientacoes(nova);
    setEditando(null);
  }

  function remover(o) {
    askConfirm('Remover este recado do mural? Os PDFs anexados também são apagados.', async () => {
      persistOrientacoes((orientacoes || []).filter((x) => x.id !== o.id));
      if (o.anexos?.length) await supabase.storage.from('documentos').remove(o.anexos.map((a) => a.path));
    });
  }

  if (editando) {
    return (
      <div>
        <Field label="Título"><input type="text" style={inputStyle} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Campanha de julho" /></Field>
        <Field label="Orientação">
          <textarea
            value={conteudo}
            onChange={(e) => setConteudo(e.target.value)}
            rows={5}
            placeholder="Escreva aqui a orientação para a equipe..."
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
          />
        </Field>

        <Field label="Anexos em PDF" hint="Até 10 MB por arquivo. Só PDF.">
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1px dashed var(--border)', borderRadius: 12, padding: 14, cursor: enviando ? 'default' : 'pointer', color: 'var(--primary-text)', fontSize: 13, fontWeight: 700 }}>
            <Upload size={15} />
            {enviando ? 'Enviando...' : 'Escolher PDF'}
            <input type="file" accept="application/pdf" disabled={enviando} onChange={(e) => { enviarPdf(e.target.files?.[0]); e.target.value = ''; }} style={{ display: 'none' }} />
          </label>
        </Field>

        {anexos.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {anexos.map((a) => (
              <div key={a.path} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'var(--surface-2)', borderRadius: 10, padding: '8px 10px' }}>
                <span style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <FileText size={13} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome}</span>
                </span>
                <button onClick={() => removerAnexo(a)} style={{ ...iconBtnStyle, flexShrink: 0 }}><X size={14} /></button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Fixar no topo</div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Recados fixados aparecem primeiro</div>
          </div>
          <Toggle checked={fixado} onChange={setFixado} />
        </div>

        {erro && <div style={{ color: 'var(--negative)', fontSize: 12.5, marginBottom: 10, fontWeight: 600 }}>{erro}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <Button variant="secondary" onClick={() => setEditando(null)} style={{ flex: 1 }}>Voltar</Button>
          <Button variant="primary" onClick={salvar} style={{ flex: 2 }} disabled={enviando}>Salvar recado</Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 14, lineHeight: 1.5 }}>
        Os recados aparecem na tela de Início de todos os vendedores, com os PDFs anexados.
      </p>
      {lista.length === 0 ? (
        <EmptyState icon={Megaphone} title="Mural vazio" desc="Escreva o primeiro recado para a equipe." actionLabel="+ Novo recado" onAction={() => abrirForm(null)} />
      ) : (
        <>
          <Card style={{ padding: 0 }}>
            {lista.map((o, i) => (
              <div key={o.id} style={{ padding: 14, borderBottom: i === lista.length - 1 ? 'none' : '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 5 }}>
                    {o.fixado && <Pin size={12} style={{ color: 'var(--gold-strong)', flexShrink: 0 }} />}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.titulo}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                    {o.anexos?.length ? `${o.anexos.length} anexo(s)` : 'sem anexo'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => abrirForm(o)} style={iconBtnStyle}><Edit2 size={15} /></button>
                  <button onClick={() => remover(o)} style={iconBtnStyle}><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </Card>
          <Button variant="primary" onClick={() => abrirForm(null)} style={{ width: '100%', marginTop: 14 }}>
            <Plus size={16} /> Novo recado
          </Button>
        </>
      )}
    </div>
  );
}

/* =========================================================================
   FORMULÁRIO DE LANÇAMENTO + FLUXO DE RECORRÊNCIA
   ========================================================================= */

function TransactionForm({ draft, categories, role, vendedores, planos, onSubmit, onCancel, onDelete, onCancelRecurrence, onApprove, onReject }) {
  const [local, setLocal] = useState(draft);
  const [error, setError] = useState('');
  const cats = categories.filter((c) => c.tipo === local.tipo);
  // Campos de contrato só fazem sentido em venda (receita atribuída a vendedor).
  const isVenda = local.tipo === 'receita';
  const emRevisao = role === 'admin' && local.status === 'pendente';
  const planosAtivos = (planos || []).filter((p) => p.ativo !== false);
  const planoEscolhido = local.planoId ? planosAtivos.find((p) => p.id === local.planoId) : null;

  // Ao escolher um plano negociado, os campos vêm preenchidos com o que o admin
  // cadastrou (preço, categoria, duração). O admin ainda pode ajustar tudo antes
  // de aprovar; a comissão do plano vale automaticamente se ninguém sobrescrever.
  function escolherPlano(planoId) {
    const p = planosAtivos.find((x) => x.id === planoId);
    if (!p) { setLocal((l) => ({ ...l, planoId: '' })); return; }
    setLocal((l) => ({
      ...l,
      planoId,
      valor: p.valor ? String(p.valor) : l.valor,
      categoriaId: p.categoriaId || l.categoriaId,
      contratoMeses: p.contratoMeses != null ? String(p.contratoMeses) : l.contratoMeses,
      recorrente: p.recorrente,
      frequencia: p.frequencia || l.frequencia,
    }));
  }

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
    if (role === 'vendedor' && !local.clienteNome?.trim()) { setError('Informe o nome do cliente.'); return; }
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

      {isVenda && planosAtivos.length > 0 && (
        <Field label="Plano negociado" hint={planoEscolhido ? `Comissão do plano: ${planoEscolhido.comissaoPercentual}%. Preencheu os campos abaixo — pode ajustar se precisar.` : 'Escolha um plano para preencher valor, categoria e duração automaticamente.'}>
          <select value={local.planoId || ''} onChange={(e) => escolherPlano(e.target.value)} style={inputStyle}>
            <option value="">Sem plano (preencher manualmente)</option>
            {planosAtivos.map((p) => (
              <option key={p.id} value={p.id}>{p.nome} · {formatCurrency(p.valor)} · {p.comissaoPercentual}%</option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Valor">
        <CurrencyInput value={local.valor} onChange={(v) => set('valor', v)} style={inputStyle} />
      </Field>

      <Field label="Categoria">
        <select value={local.categoriaId} onChange={(e) => set('categoriaId', e.target.value)} style={inputStyle}>
          {cats.length === 0 && <option value="">Crie uma categoria primeiro</option>}
          {cats.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </Field>

      {isVenda && (
        <>
          <Field label={role === 'vendedor' ? 'Cliente' : 'Cliente (opcional)'}>
            <input type="text" placeholder="Ex.: Padaria Central Ltda" value={local.clienteNome || ''} onChange={(e) => set('clienteNome', e.target.value)} style={inputStyle} />
          </Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <Field label="Contrato (meses)">
                <input type="number" min="0" placeholder="Ex.: 12" value={local.contratoMeses || ''} onChange={(e) => set('contratoMeses', e.target.value)} style={inputStyle} />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="Pagamento">
                <select value={local.formaPagamento || ''} onChange={(e) => set('formaPagamento', e.target.value)} style={inputStyle}>
                  <option value="">Não informado</option>
                  <option value="pix">Pix</option>
                  <option value="boleto">Boleto</option>
                  <option value="cartao">Cartão</option>
                  <option value="transferencia">Transferência</option>
                  <option value="dinheiro">Dinheiro</option>
                </select>
              </Field>
            </div>
          </div>
        </>
      )}

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

      {isVenda && role === 'admin' && local.vendedorId && (
        <Field
          label="Comissão desta venda (%)"
          hint={planoEscolhido
            ? `Em branco = usa os ${planoEscolhido.comissaoPercentual}% do plano "${planoEscolhido.nome}".`
            : 'Em branco = usa a comissão padrão do vendedor.'}
        >
          <input
            type="number" min="0" max="100" step="0.5"
            placeholder={planoEscolhido ? `${planoEscolhido.comissaoPercentual}% (do plano)` : 'Padrão do vendedor'}
            value={local.comissaoPercentual ?? ''}
            onChange={(e) => set('comissaoPercentual', e.target.value)}
            style={inputStyle}
          />
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

      {emRevisao ? (
        <>
          <Card style={{ marginTop: 16, borderColor: 'var(--warning)', background: 'var(--warning-light)' }}>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--warning-strong)' }}>
              Esta venda foi lançada por um vendedor e está aguardando sua revisão. Ajuste o que precisar acima e depois aprove — só assim ela passa a contar no saldo, nas metas e na comissão.
            </p>
          </Card>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <Button variant="secondary" onClick={() => onReject(local)} style={{ flex: 1 }}>Rejeitar</Button>
            <Button variant="primary" onClick={() => onApprove(local)} style={{ flex: 2 }}>
              <Check size={15} /> Aprovar venda
            </Button>
          </div>
          <button
            onClick={submit}
            style={{ width: '100%', marginTop: 10, background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 8 }}
          >
            Salvar alterações sem aprovar
          </button>
        </>
      ) : (
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <Button variant="secondary" onClick={onCancel} style={{ flex: 1 }}>Cancelar</Button>
          <Button variant="primary" onClick={submit} style={{ flex: 2 }}>{local.recorrente ? 'Continuar' : 'Salvar lançamento'}</Button>
        </div>
      )}

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
          <Repeat size={18} color="var(--primary-text)" />
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
                <p style={{ fontSize: 12, color: 'var(--primary-text)', marginTop: 8, fontWeight: 700 }}>
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
        <CurrencyInput value={meta} onChange={setMeta} style={inputStyle} />
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

function Dashboard({ data, role, currentVendedorId, period, setPeriod, onAddClick, onGoTo, onActivateNow, onCustomizeClick, onReviewSale, onEditMural }) {
  // Qual cartão de indicador está "em foco" — controla o que aparece no
  // gráfico de evolução logo abaixo (clique de novo no mesmo cartão desliga).
  const [focusMetric, setFocusMetric] = useState(null);
  function toggleFocus(key) {
    setFocusMetric((cur) => (cur === key ? null : key));
  }

  const txs = scopedTransactions(data, role, currentVendedorId);
  const range = getPeriodRange(period);
  const despesas = sumByPeriod(txs, 'despesa', range.start, range.end);
  const receitas = sumByPeriod(txs, 'receita', range.start, range.end);
  const saldo = round2(receitas.total - despesas.total);

  // Comparação com a janela anterior de mesmo tamanho (alimenta os cartões).
  const rangeAnterior = getPreviousPeriodRange(period);
  const receitasAnt = sumByPeriod(txs, 'receita', rangeAnterior.start, rangeAnterior.end);
  const despesasAnt = sumByPeriod(txs, 'despesa', rangeAnterior.start, rangeAnterior.end);
  const varReceitas = variacaoPct(receitas.total, receitasAnt.total);
  const varDespesas = variacaoPct(despesas.total, despesasAnt.total);
  const varSaldo = variacaoPct(saldo, round2(receitasAnt.total - despesasAnt.total));
  const saldoAcumulado = saldoAcumuladoAteHoje(txs);

  // A janela do gráfico de evolução acompanha o período escolhido no topo,
  // incluindo meses futuros quando o período escolhido é "Próx. N meses".
  const chartWindow = {
    ultimos_3: { back: 3, forward: 0 },
    proximos_3: { back: 1, forward: 3 },
    proximos_6: { back: 1, forward: 6 },
    ano_atual: { back: 12, forward: 0 },
  }[period.type] || { back: 6, forward: 0 };
  const cashFlowRows = buildCashFlowRows(txs, chartWindow.back, chartWindow.forward);
  const resultadoRows = buildCompanyEvolution(txs, chartWindow.back, chartWindow.forward);
  const acumuladoRows = buildAccumulatedBalanceRows(txs, chartWindow.back, chartWindow.forward);

  // Ranking de produtos/serviços mais vendidos no período (por categoria de receita).
  const topProdutos = Object.entries(receitas.byCategory)
    .map(([catId, val]) => {
      const c = data.categories.find((cc) => cc.id === catId);
      return { id: catId, nome: c?.nome || 'Outros', valor: val };
    })
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5);

  const pendentes = txs.filter((t) => t.recorrente && getRecurrenceStatus(t) === 'pendente');
  // Vendas lançadas por vendedores esperando o admin revisar e aprovar.
  const aguardandoRevisao = role === 'admin' ? data.transactions.filter((t) => t.status === 'pendente') : [];
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
  const ranking = buildVendedorRanking(txs, data.vendedores, range.start, range.end, data.planos);
  const nenhumWidgetAtivo = role === 'admin' && !widgets.categorias && !widgets.ticketMedio && !widgets.receitaDespesa && !widgets.rankingVendedores && !widgets.cancelamentos;

  return (
    <div style={{ paddingTop: 12 }}>
      {aguardandoRevisao.length > 0 && (
        <Card style={{ marginBottom: 14, borderColor: 'var(--warning)', background: 'var(--warning-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: 'var(--warning-strong)' }}>
            <Clock size={16} /> {aguardandoRevisao.length} venda(s) aguardando sua revisão
          </div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {aguardandoRevisao.slice(0, 5).map((t) => {
              const vend = data.vendedores.find((v) => v.id === t.vendedorId);
              return (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, color: 'var(--warning-strong)', gap: 8 }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {vend?.nome || 'Vendedor'} · {t.clienteNome || 'sem cliente'} · {formatCurrency(t.valor)}
                  </span>
                  <button onClick={() => onReviewSale(t)} style={{ background: 'none', border: 'none', color: 'var(--primary-text)', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline', flexShrink: 0 }}>
                    Revisar
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <PeriodSelector value={period} onChange={setPeriod} />

      <div className="lomuz-kpi-grid" style={{ marginTop: 14 }}>
        <StatCard
          title="Saldo acumulado"
          value={formatCurrency(saldoAcumulado)}
          icon={Wallet}
          tone={saldoAcumulado >= 0 ? 'neutral' : 'danger'}
          hint="Todas as receitas menos todas as despesas aprovadas, desde o início até hoje. Não é saldo de conta bancária — o app não tem conta bancária integrada. Toque para ver a evolução mês a mês."
          footer="Desde o início até hoje · toque para ver a evolução"
          onClick={() => toggleFocus('saldo')}
          active={focusMetric === 'saldo'}
        />
        <StatCard
          title="Receitas do período"
          value={formatCurrency(receitas.total)}
          icon={ArrowUpCircle}
          tone="success"
          trendPct={varReceitas}
          trendLabel="vs período anterior"
          goodWhenUp
          hint="Soma das receitas aprovadas dentro do período escolhido, incluindo as ocorrências de lançamentos recorrentes. Toque para ver a evolução mês a mês."
          onClick={() => toggleFocus('receitas')}
          active={focusMetric === 'receitas'}
        />
        <StatCard
          title="Despesas do período"
          value={formatCurrency(despesas.total)}
          icon={ArrowDownCircle}
          tone="danger"
          trendPct={varDespesas}
          trendLabel="vs período anterior"
          goodWhenUp={false}
          hint="Soma das despesas aprovadas dentro do período escolhido, incluindo as ocorrências de lançamentos recorrentes. Toque para ver a evolução mês a mês."
          onClick={() => toggleFocus('despesas')}
          active={focusMetric === 'despesas'}
        />
        <StatCard
          title="Resultado do período"
          value={formatCurrency(saldo)}
          icon={TrendingUp}
          tone="info"
          trendPct={varSaldo}
          trendLabel="vs período anterior"
          goodWhenUp
          hint="Receitas menos despesas do período. Vendas ainda pendentes de aprovação não entram nesta conta. Toque para ver a evolução mês a mês."
          onClick={() => toggleFocus('resultado')}
          active={focusMetric === 'resultado'}
        />
        <StatCard
          title="Produto mais vendido"
          value={topProdutos[0]?.nome || '—'}
          icon={Award}
          tone="neutral"
          footer={topProdutos[0] ? `${formatCurrency(topProdutos[0].valor)} no período · toque para ver o ranking` : 'Sem vendas categorizadas neste período'}
          onClick={() => toggleFocus('produtos')}
          active={focusMetric === 'produtos'}
        />
      </div>

      {pendentes.length > 0 && (
        <Card style={{ marginTop: 14, borderColor: 'var(--warning)', background: 'var(--warning-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: 'var(--warning-strong)' }}>
            <Clock size={16} /> {pendentes.length} lançamento(s) aguardando ativação
          </div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendentes.slice(0, 4).map((t) => {
              const c = data.categories.find((cc) => cc.id === t.categoriaId);
              return (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, color: 'var(--warning-strong)', gap: 8 }}>
                  <span>{c?.nome} · {formatCurrency(t.valor)} · ativa em {daysUntil(t.dataAtivacao)} dia(s)</span>
                  {/* Só admin ativa antes do prazo — muitos produtos têm período de
                      teste e o vendedor não deve poder pular essa validação. */}
                  {role === 'admin' && (
                    <button onClick={() => onActivateNow(t)} style={{ background: 'none', border: 'none', color: 'var(--primary-text)', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline', flexShrink: 0 }}>
                      Ativar agora
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="lomuz-main-grid">
        {focusMetric === 'produtos' ? (
          <Panel title="Ranking de produtos mais vendidos">
            {topProdutos.length === 0 ? (
              <div style={{ padding: '10px 4px' }}>
                <EmptyBlock icon={Tag} title="Nenhuma receita categorizada" desc="Quando houver vendas aprovadas com categoria neste período, o ranking aparece aqui." />
              </div>
            ) : (
              <div style={{ padding: '6px 4px' }}>
                {topProdutos.map((p, i) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: i === topProdutos.length - 1 ? 'none' : '1px solid var(--border)' }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: i === 0 ? 'var(--warning-light)' : 'var(--surface-2)', color: i === 0 ? 'var(--warning-strong)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--success)', whiteSpace: 'nowrap' }}>{formatCurrency(p.valor)}</div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        ) : (
          <CashFlowChart
            rows={focusMetric === 'saldo' ? acumuladoRows : focusMetric === 'resultado' ? resultadoRows : cashFlowRows}
            mode={focusMetric === 'saldo' ? 'saldo' : focusMetric === 'resultado' ? 'resultado' : 'fluxo'}
            emphasize={focusMetric === 'receitas' ? 'entradas' : focusMetric === 'despesas' ? 'saidas' : null}
            title={
              focusMetric === 'saldo' ? 'Evolução do saldo acumulado'
                : focusMetric === 'resultado' ? 'Evolução do resultado mensal'
                  : focusMetric === 'receitas' ? 'Fluxo de caixa — receitas em destaque'
                    : focusMetric === 'despesas' ? 'Fluxo de caixa — despesas em destaque'
                      : 'Fluxo de caixa'
            }
          />
        )}

        <Panel title="Próximos vencimentos">
          {/* Este bloco NÃO mostra exemplo inventado: hoje um lançamento tem só
              uma data, sem campo de vencimento, sem "pago/em aberto" e sem
              fornecedor/cliente. Enquanto esses campos não existirem no banco,
              o painel diz o que falta em vez de exibir número falso. */}
          <NotAvailableBlock
            title="Depende de campos que ainda não existem"
            desc="Para listar vencimentos é preciso separar a data de vencimento da data do lançamento e marcar o que já foi pago ou recebido. Hoje cada lançamento tem apenas uma data. Me avise que eu incluo esses campos."
          />
        </Panel>
      </div>

      <Panel
        title="Movimentações recentes"
        style={{ marginTop: 16 }}
        action={<PanelLink onClick={() => onGoTo('lancamentos')}>Ver todas</PanelLink>}
      >
          {recentTx.length === 0 ? (
            <EmptyBlock
              icon={Receipt}
              title="Nenhuma movimentação"
              desc="Os lançamentos deste período aparecem aqui em ordem de data."
            />
          ) : (
            <div className="lomuz-table-wrap">
              <table className="lomuz-table">
                <caption className="lomuz-sr-only">
                  Últimas movimentações do período, com data, descrição, categoria, tipo e valor.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Data</th>
                    <th scope="col">Descrição</th>
                    <th scope="col">Categoria</th>
                    <th scope="col">Tipo</th>
                    <th scope="col" style={{ textAlign: 'right' }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTx.map((t) => {
                    const c = data.categories.find((cc) => cc.id === t.categoriaId);
                    const entrada = t.tipo === 'receita';
                    return (
                      <tr key={t.id}>
                        <td className="lomuz-num" style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{formatDateBR(t.data)}</td>
                        <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.descricao || t.clienteNome || c?.nome || 'Sem descrição'}
                        </td>
                        <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{c?.nome || '—'}</td>
                        <td>
                          <StatusBadge tone={entrada ? 'success' : 'danger'} icon={entrada ? ArrowUpCircle : ArrowDownCircle}>
                            {entrada ? 'Entrada' : 'Saída'}
                          </StatusBadge>
                        </td>
                        <td
                          className="lomuz-num"
                          style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', color: entrada ? 'var(--success)' : 'var(--danger)' }}
                        >
                          {entrada ? '' : '− '}{formatCurrency(t.valor)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </Panel>

      <MuralCard orientacoes={data.orientacoes} role={role} onEdit={onEditMural} />

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
                <button onClick={onCustomizeClick} style={{ background: 'none', border: 'none', color: 'var(--primary-text)', fontWeight: 700, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
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
                          <div style={{ width: 26, height: 26, borderRadius: '50%', background: i === 0 ? 'var(--gold-soft)' : 'var(--surface-2)', color: i === 0 ? 'var(--warning-strong)' : 'var(--ink-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
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
  const [filterPeriodo, setFilterPeriodo] = useState('todos');
  const [busca, setBusca] = useState('');
  const [totalsMode, setTotalsMode] = useState('geral');

  let list = scopedTransactions(data, role, currentVendedorId);
  if (filterTipo !== 'todos') list = list.filter((t) => t.tipo === filterTipo);
  if (filterCat !== 'todas') list = list.filter((t) => t.categoriaId === filterCat);
  if (filterPeriodo !== 'todos') {
    const r = getPeriodRange({ type: filterPeriodo });
    list = list.filter((t) => {
      const d = parseISODate(t.data);
      return d >= r.start && d <= r.end;
    });
  }
  const termo = busca.trim().toLowerCase();
  if (termo) {
    list = list.filter((t) => {
      const cat = data.categories.find((c) => c.id === t.categoriaId);
      return (t.descricao || '').toLowerCase().includes(termo)
        || (t.clienteNome || '').toLowerCase().includes(termo)
        || (cat?.nome || '').toLowerCase().includes(termo);
    });
  }
  list = [...list].sort((a, b) => new Date(b.data) - new Date(a.data));

  // Totais do filtro atual — sempre visíveis ao final da lista, no modo
  // "geral" (soma tudo) ou "mensal" (agrupado por mês).
  const totalReceitas = round2(list.filter((t) => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0));
  const totalDespesas = round2(list.filter((t) => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0));
  const totalGeral = round2(totalReceitas - totalDespesas);

  const porMes = {};
  list.forEach((t) => {
    const key = (t.data || '').slice(0, 7);
    if (!porMes[key]) porMes[key] = { receitas: 0, despesas: 0 };
    if (t.tipo === 'receita') porMes[key].receitas += t.valor; else porMes[key].despesas += t.valor;
  });
  const mensalRows = Object.entries(porMes)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, v]) => ({ key, label: monthLabel(parseISODate(`${key}-01`)), receitas: round2(v.receitas), despesas: round2(v.despesas), saldo: round2(v.receitas - v.despesas) }));

  return (
    <div style={{ paddingTop: 12 }}>
      {role === 'admin' && (
        <button
          onClick={onImportClick}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--primary-text)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', padding: '0 0 10px' }}
        >
          <Upload size={14} /> Importar CSV (Asaas ou outro)
        </button>
      )}

      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)', pointerEvents: 'none' }} />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por cliente, descrição ou categoria…"
          style={{ ...inputStyle, paddingLeft: 34 }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <Chip active={filterTipo === 'todos'} onClick={() => setFilterTipo('todos')}>Todos</Chip>
        <Chip active={filterTipo === 'receita'} onClick={() => setFilterTipo('receita')}>Receitas</Chip>
        <Chip active={filterTipo === 'despesa'} onClick={() => setFilterTipo('despesa')}>Despesas</Chip>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <Chip active={filterPeriodo === 'todos'} onClick={() => setFilterPeriodo('todos')}>Todo o período</Chip>
        <Chip active={filterPeriodo === 'mes_atual'} onClick={() => setFilterPeriodo('mes_atual')}>Este mês</Chip>
        <Chip active={filterPeriodo === 'ultimos_3'} onClick={() => setFilterPeriodo('ultimos_3')}>Últimos 3 meses</Chip>
        <Chip active={filterPeriodo === 'ano_atual'} onClick={() => setFilterPeriodo('ano_atual')}>Este ano</Chip>
      </div>

      <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }}>
        <option value="todas">Todas as categorias</option>
        {data.categories.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>

      {list.length === 0 ? (
        <EmptyState icon={Receipt} title="Nada por aqui ainda" desc="Toque no botão + para registrar sua primeira receita ou despesa, ou ajuste os filtros acima." />
      ) : (
        <>
          <Card style={{ padding: 0 }}>
            {list.map((tx, i) => (
              <TransactionRow key={tx.id} tx={tx} category={data.categories.find((c) => c.id === tx.categoriaId)} last={i === list.length - 1} onClick={() => onEdit(tx)} />
            ))}
          </Card>

          <div style={{ marginTop: 14, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Total do filtro</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <Chip active={totalsMode === 'geral'} onClick={() => setTotalsMode('geral')}>Total geral</Chip>
                <Chip active={totalsMode === 'mensal'} onClick={() => setTotalsMode('mensal')}>Por mês</Chip>
              </div>
            </div>

            {totalsMode === 'geral' ? (
              <Card>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Receitas</div>
                    <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--positive)' }}>{formatCurrency(totalReceitas)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Despesas</div>
                    <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--negative)' }}>{formatCurrency(totalDespesas)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Resultado</div>
                    <div style={{ fontWeight: 800, fontSize: 18, color: totalGeral >= 0 ? 'var(--primary-text)' : 'var(--negative)' }}>{formatCurrency(totalGeral)}</div>
                  </div>
                </div>
              </Card>
            ) : (
              <Card style={{ padding: 0 }}>
                <div className="lomuz-table-wrap">
                  <table className="lomuz-table">
                    <caption className="lomuz-sr-only">Totais mensais do filtro aplicado.</caption>
                    <thead>
                      <tr>
                        <th scope="col">Mês</th>
                        <th scope="col" style={{ textAlign: 'right' }}>Receitas</th>
                        <th scope="col" style={{ textAlign: 'right' }}>Despesas</th>
                        <th scope="col" style={{ textAlign: 'right' }}>Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mensalRows.map((r) => (
                        <tr key={r.key}>
                          <td style={{ whiteSpace: 'nowrap' }}>{r.label}</td>
                          <td className="lomuz-num" style={{ textAlign: 'right', color: 'var(--positive)' }}>{formatCurrency(r.receitas)}</td>
                          <td className="lomuz-num" style={{ textAlign: 'right', color: 'var(--negative)' }}>{formatCurrency(r.despesas)}</td>
                          <td className="lomuz-num" style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(r.saldo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        </>
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

function EquipeForecast({ data, persist, askConfirm }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [rangeMode, setRangeMode] = useState('prox3');
  const [customFrom, setCustomFrom] = useState(() => monthInputValue(new Date()));
  const [customTo, setCustomTo] = useState(() => monthInputValue(addMonths(new Date(), 2)));
  const [selectedCats, setSelectedCats] = useState([]);
  const [selectedId, setSelectedId] = useState('equipe');
  const [inviteStatus, setInviteStatus] = useState('');
  const [showMetaTodos, setShowMetaTodos] = useState(false);
  const [metaTodosValor, setMetaTodosValor] = useState('');

  const months = useMemo(() => computeMonthsForRange(rangeMode, customFrom, customTo), [rangeMode, customFrom, customTo]);
  const receitaCats = data.categories.filter((c) => c.tipo === 'receita');

  function toggleCat(id) {
    setSelectedCats((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));
  }
  async function saveVendedor(v) {
    const isNovo = !editing;
    const list = editing ? data.vendedores.map((x) => (x.id === v.id ? v : x)) : [...data.vendedores, v];
    persist({ ...data, vendedores: list });
    setShowForm(false);
    setEditing(null);

    if (isNovo && v.conviteEmail && !v.profileId) {
      setInviteStatus('Enviando convite por e-mail...');
      const { data: res, error } = await supabase.functions.invoke('invite-vendedor', {
        body: { email: v.conviteEmail, nome: v.nome },
      });
      if (error || res?.error) setInviteStatus(`Não foi possível enviar o convite por e-mail (${v.conviteEmail}). A pessoa ainda pode criar a conta manualmente na tela de login.`);
      else setInviteStatus(`Convite enviado por e-mail para ${v.conviteEmail}.`);
      setTimeout(() => setInviteStatus(''), 6000);
    }
  }
  function removeVendedor(id) {
    askConfirm('Remover este vendedor? As vendas já registradas continuam no histórico, mas deixam de contar para ele.', () => {
      persist({
        ...data,
        vendedores: data.vendedores.filter((v) => v.id !== id),
        transactions: data.transactions.map((t) => (t.vendedorId === id ? { ...t, vendedorId: null } : t)),
      });
      if (selectedId === id) setSelectedId('equipe');
    });
  }
  function updateMeta(vendedorId, monthKeyStr, value) {
    const v = data.vendedores.find((x) => x.id === vendedorId);
    const metas = { ...(v.metas || {}), [monthKeyStr]: Number(value) || 0 };
    persist({ ...data, vendedores: data.vendedores.map((x) => (x.id === vendedorId ? { ...x, metas } : x)) });
  }
  // Meta da empresa para um mês. Valor 0/vazio remove a meta própria e volta a
  // valer a soma das metas individuais.
  function updateMetaEquipe(monthKeyStr, value) {
    const num = Number(value) || 0;
    const atual = { ...(data.metasEquipe || {}) };
    if (num > 0) atual[monthKeyStr] = num;
    else delete atual[monthKeyStr];
    persist({ ...data, metasEquipe: atual });
  }
  // Aplica a mesma meta em todos os vendedores, nos meses que estão em tela.
  function aplicarMetaEmTodos(value) {
    const num = Number(value) || 0;
    const chaves = months.map((m) => monthKey(m));
    const vendedores = data.vendedores.map((v) => {
      const metas = { ...(v.metas || {}) };
      chaves.forEach((k) => { metas[k] = num; });
      return { ...v, metas };
    });
    persist({ ...data, vendedores });
  }

  const selectedVendedor = selectedId !== 'equipe' ? data.vendedores.find((v) => v.id === selectedId) : null;

  return (
    <div>
      {inviteStatus && (
        <div style={{ fontSize: 12.5, color: 'var(--primary-text)', fontWeight: 600, marginBottom: 10 }}>{inviteStatus}</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button variant="secondary" onClick={() => { setEditing(null); setShowForm(true); }} style={{ fontSize: 13, padding: '8px 12px' }}>
          <Plus size={14} /> Vendedor
        </Button>
      </div>

      {data.vendedores.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum vendedor cadastrado" desc="Adicione vendedores para acompanhar vendas, comissão e metas." actionLabel="+ Adicionar vendedor" onAction={() => setShowForm(true)} />
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            <Chip active={selectedId === 'equipe'} onClick={() => setSelectedId('equipe')}>Equipe toda</Chip>
            {data.vendedores.map((v) => (
              <Chip key={v.id} active={selectedId === v.id} onClick={() => setSelectedId(v.id)}>{v.nome}</Chip>
            ))}
          </div>

          <RangePeriodSelector mode={rangeMode} setMode={setRangeMode} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />

          {receitaCats.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {receitaCats.map((c) => (
                <Chip key={c.id} active={selectedCats.includes(c.id)} onClick={() => toggleCat(c.id)}>{c.nome}</Chip>
              ))}
            </div>
          )}

          {selectedId === 'equipe' ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                <button
                  onClick={() => { setMetaTodosValor(''); setShowMetaTodos(true); }}
                  style={{ background: 'none', border: 'none', color: 'var(--primary-text)', fontWeight: 700, fontSize: 12, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                >
                  Definir meta para todos
                </button>
              </div>
              <VendedorPanoramaView
                isTeam
                vendedoresCount={data.vendedores.length}
                rows={buildTeamRangeRows(data.transactions, data.vendedores, months, selectedCats, data.planos, data.metasEquipe)}
                onEditMeta={updateMetaEquipe}
              />
            </>
          ) : !selectedVendedor ? null : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
                <div style={{ fontSize: 12, color: selectedVendedor.profileId ? 'var(--positive)' : 'var(--warning-strong)', fontWeight: 600 }}>
                  {selectedVendedor.profileId ? '✓ Conta vinculada' : `Aguardando cadastro (${selectedVendedor.conviteEmail})`}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => { setEditing(selectedVendedor); setShowForm(true); }} style={iconBtnStyle}><Edit2 size={15} /></button>
                  <button onClick={() => removeVendedor(selectedVendedor.id)} style={iconBtnStyle}><Trash2 size={15} /></button>
                </div>
              </div>
              <VendedorPanoramaView
                vendedor={selectedVendedor}
                rows={buildVendedorRangeRows(data.transactions, selectedVendedor, months, selectedCats, data.planos)}
                onEditMeta={(monthKeyStr, value) => updateMeta(selectedVendedor.id, monthKeyStr, value)}
              />
            </>
          )}
        </>
      )}

      {showForm && (
        <Modal title={editing ? 'Editar vendedor' : 'Novo vendedor'} onClose={() => { setShowForm(false); setEditing(null); }}>
          <VendedorForm vendedor={editing} onSubmit={saveVendedor} onCancel={() => { setShowForm(false); setEditing(null); }} />
        </Modal>
      )}

      {showMetaTodos && (
        <Modal title="Definir meta para todos" onClose={() => setShowMetaTodos(false)}>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0, marginBottom: 14, lineHeight: 1.5 }}>
            Esse valor vira a meta de <strong>cada</strong> vendedor nos {months.length} mês(es) que estão em tela
            ({months.length > 0 ? `${monthLabel(months[0])} a ${monthLabel(months[months.length - 1])}` : '—'}).
            Depois você ainda pode ajustar cada pessoa individualmente.
          </p>
          <Field label="Meta mensal por vendedor">
            <CurrencyInput value={metaTodosValor} onChange={setMetaTodosValor} style={inputStyle} />
          </Field>
          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <Button variant="secondary" onClick={() => setShowMetaTodos(false)} style={{ flex: 1 }}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={() => { aplicarMetaEmTodos(metaTodosValor); setShowMetaTodos(false); }}
              style={{ flex: 2 }}
            >
              Aplicar a {data.vendedores.length} vendedor(es)
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function VendedorForecast({ data, vendedorId }) {
  const [rangeMode, setRangeMode] = useState('prox3');
  const [customFrom, setCustomFrom] = useState(() => monthInputValue(new Date()));
  const [customTo, setCustomTo] = useState(() => monthInputValue(addMonths(new Date(), 2)));
  const [selectedCats, setSelectedCats] = useState([]);

  const v = data.vendedores.find((x) => x.id === vendedorId);
  const months = useMemo(() => computeMonthsForRange(rangeMode, customFrom, customTo), [rangeMode, customFrom, customTo]);
  const receitaCats = data.categories.filter((c) => c.tipo === 'receita');

  if (!v) {
    return <EmptyState icon={Users} title="Nenhum vendedor selecionado" desc="Peça ao administrador para cadastrar seu perfil de vendedor." />;
  }

  function toggleCat(id) {
    setSelectedCats((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));
  }

  const rows = buildVendedorRangeRows(data.transactions, v, months, selectedCats, data.planos);

  return (
    <div>
      <RangePeriodSelector mode={rangeMode} setMode={setRangeMode} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />
      {receitaCats.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {receitaCats.map((c) => (
            <Chip key={c.id} active={selectedCats.includes(c.id)} onClick={() => toggleCat(c.id)}>{c.nome}</Chip>
          ))}
        </div>
      )}
      <VendedorPanoramaView vendedor={v} rows={rows} />
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
        <VendedorForecast data={data} vendedorId={currentVendedorId} />
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
        <EquipeForecast data={data} persist={persist} askConfirm={askConfirm} />
      )}
    </div>
  );
}

/* =========================================================================
   PÁGINA: CATEGORIAS
   ========================================================================= */

function PlanoForm({ plano, categories, onSubmit, onCancel }) {
  const receitaCats = categories.filter((c) => c.tipo === 'receita');
  const [nome, setNome] = useState(plano?.nome || '');
  const [valor, setValor] = useState(plano?.valor != null ? String(plano.valor) : '');
  const [categoriaId, setCategoriaId] = useState(plano?.categoriaId || receitaCats[0]?.id || '');
  const [comissao, setComissao] = useState(plano?.comissaoPercentual != null ? String(plano.comissaoPercentual) : '5');
  const [contratoMeses, setContratoMeses] = useState(plano?.contratoMeses != null ? String(plano.contratoMeses) : '');
  const [recorrente, setRecorrente] = useState(!!plano?.recorrente);
  const [frequencia, setFrequencia] = useState(plano?.frequencia || 'mensal');
  const [ativo, setAtivo] = useState(plano?.ativo !== false);
  const [error, setError] = useState('');

  function submit() {
    if (!nome.trim()) { setError('Informe o nome do plano.'); return; }
    if (!valor || parseFloat(valor) <= 0) { setError('Informe o valor do plano.'); return; }
    onSubmit({
      id: plano?.id || uid(),
      nome: nome.trim(),
      valor: parseFloat(valor) || 0,
      categoriaId: categoriaId || null,
      comissaoPercentual: parseFloat(comissao) || 0,
      contratoMeses: contratoMeses ? (parseInt(contratoMeses, 10) || null) : null,
      recorrente,
      frequencia: recorrente ? frequencia : null,
      ativo,
    });
  }

  return (
    <div>
      <Field label="Nome do plano"><input type="text" style={inputStyle} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Plano Rádio Premium" /></Field>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Valor"><CurrencyInput value={valor} onChange={setValor} style={inputStyle} /></Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Comissão (%)"><input type="number" min="0" max="100" step="0.5" style={inputStyle} value={comissao} onChange={(e) => setComissao(e.target.value)} /></Field>
        </div>
      </div>
      <Field label="Categoria de receita">
        <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} style={inputStyle}>
          {receitaCats.length === 0 && <option value="">Crie uma categoria de receita primeiro</option>}
          {receitaCats.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </Field>
      <Field label="Duração do contrato (meses)" hint="Opcional. Preenche automaticamente ao lançar a venda.">
        <input type="number" min="0" style={inputStyle} value={contratoMeses} onChange={(e) => setContratoMeses(e.target.value)} placeholder="Ex.: 12" />
      </Field>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}><Repeat size={15} /> Cobrança recorrente</div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>O plano se repete automaticamente</div>
        </div>
        <Toggle checked={recorrente} onChange={setRecorrente} />
      </div>
      {recorrente && (
        <Field label="Repetir">
          <select value={frequencia} onChange={(e) => setFrequencia(e.target.value)} style={inputStyle}>
            <option value="mensal">Todo mês</option>
            <option value="semanal">Toda semana</option>
            <option value="anual">Todo ano</option>
          </select>
        </Field>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Disponível para venda</div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Desligue para aposentar o plano sem apagar o histórico</div>
        </div>
        <Toggle checked={ativo} onChange={setAtivo} />
      </div>

      {error && <div style={{ color: 'var(--negative)', fontSize: 12.5, marginBottom: 10, fontWeight: 600 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
        <Button variant="secondary" onClick={onCancel} style={{ flex: 1 }}>Cancelar</Button>
        <Button variant="primary" onClick={submit} style={{ flex: 2 }}>Salvar plano</Button>
      </div>
    </div>
  );
}

function CategoriasPage({ data, persist, askConfirm }) {
  const [subTab, setSubTab] = useState('categorias');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showPlanoForm, setShowPlanoForm] = useState(false);
  const [editingPlano, setEditingPlano] = useState(null);

  const receitaCats = data.categories.filter((c) => c.tipo === 'receita');
  const despesaCats = data.categories.filter((c) => c.tipo === 'despesa');
  const planos = data.planos || [];

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
  function savePlano(p) {
    const list = editingPlano ? planos.map((x) => (x.id === p.id ? p : x)) : [...planos, p];
    persist({ ...data, planos: list });
    setShowPlanoForm(false);
    setEditingPlano(null);
  }
  function removePlano(id) {
    const inUse = data.transactions.some((t) => t.planoId === id);
    const msg = inUse
      ? 'Esse plano já foi usado em vendas. Remover mesmo assim? As vendas continuam, mas passam a usar a comissão padrão do vendedor.'
      : 'Remover este plano?';
    askConfirm(msg, () => persist({ ...data, planos: planos.filter((p) => p.id !== id) }));
  }

  if (subTab === 'planos') {
    return (
      <div style={{ paddingTop: 12 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <Chip active={false} onClick={() => setSubTab('categorias')}>Categorias</Chip>
          <Chip active onClick={() => setSubTab('planos')}>Planos negociados</Chip>
        </div>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 14, lineHeight: 1.5 }}>
          Cadastre aqui os planos com preço e comissão já definidos. Quando o vendedor escolher um plano ao lançar a venda, os campos vêm preenchidos — e você pode ajustar qualquer coisa antes de aprovar.
        </p>

        {planos.length === 0 ? (
          <EmptyState icon={Tag} title="Nenhum plano cadastrado" desc="Crie planos com preço e comissão pré-definidos para agilizar o lançamento das vendas." actionLabel="+ Novo plano" onAction={() => { setEditingPlano(null); setShowPlanoForm(true); }} />
        ) : (
          <Card style={{ padding: 0 }}>
            {planos.map((p, i) => {
              const cat = data.categories.find((c) => c.id === p.categoriaId);
              return (
                <div key={p.id} style={{ padding: 14, borderBottom: i === planos.length - 1 ? 'none' : '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, opacity: p.ativo === false ? 0.5 : 1 }}>
                      {p.nome}{p.ativo === false && <span style={{ fontWeight: 500, color: 'var(--ink-soft)' }}> (fora de venda)</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                      {formatCurrency(p.valor)} · comissão {p.comissaoPercentual}%
                      {cat ? ` · ${cat.nome}` : ''}
                      {p.contratoMeses ? ` · ${p.contratoMeses} meses` : ''}
                      {p.recorrente ? ' · recorrente' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => { setEditingPlano(p); setShowPlanoForm(true); }} style={iconBtnStyle}><Edit2 size={15} /></button>
                    <button onClick={() => removePlano(p.id)} style={iconBtnStyle}><Trash2 size={15} /></button>
                  </div>
                </div>
              );
            })}
          </Card>
        )}

        {planos.length > 0 && (
          <Button variant="primary" onClick={() => { setEditingPlano(null); setShowPlanoForm(true); }} style={{ width: '100%', marginTop: 16 }}>
            <Plus size={16} /> Novo plano
          </Button>
        )}

        {showPlanoForm && (
          <Modal title={editingPlano ? 'Editar plano' : 'Novo plano negociado'} onClose={() => { setShowPlanoForm(false); setEditingPlano(null); }}>
            <PlanoForm plano={editingPlano} categories={data.categories} onSubmit={savePlano} onCancel={() => { setShowPlanoForm(false); setEditingPlano(null); }} />
          </Modal>
        )}
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 12 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Chip active onClick={() => setSubTab('categorias')}>Categorias</Chip>
        <Chip active={false} onClick={() => setSubTab('planos')}>Planos negociados</Chip>
      </div>
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

function ConfiguracoesPage({ role, themePref, onTheme, onUsers, onMural }) {
  const temaLabel = { light: 'Claro', dark: 'Escuro', system: 'Automático' }[themePref] || 'Automático';

  const itens = [
    {
      key: 'tema',
      icon: Palette,
      titulo: 'Aparência',
      desc: `Tema claro, escuro ou automático. Atualmente: ${temaLabel}.`,
      onClick: onTheme,
      todos: true,
    },
    {
      key: 'usuarios',
      icon: Users,
      titulo: 'Usuários',
      desc: 'Definir quem é administrador e quem é vendedor.',
      onClick: onUsers,
      todos: false,
    },
    {
      key: 'mural',
      icon: Megaphone,
      titulo: 'Mural de orientação',
      desc: 'Recados e materiais em PDF para a equipe de vendas.',
      onClick: onMural,
      todos: false,
    },
  ].filter((i) => i.todos || role === 'admin');

  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
      {itens.map((i) => {
        const Icon = i.icon;
        return (
          <button
            key={i.key}
            onClick={i.onClick}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, textAlign: 'left',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', padding: 18, cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)', color: 'var(--text-primary)',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 38, height: 38, borderRadius: 'var(--radius)', background: 'var(--primary-light)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}
            >
              <Icon size={19} style={{ color: 'var(--primary)' }} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 14.5, marginBottom: 3 }}>{i.titulo}</span>
              <span style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{i.desc}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ThemeModal({ value, onChange }) {
  const options = [
    { key: 'light', title: 'Claro', desc: 'Fundo claro, sempre.' },
    { key: 'dark', title: 'Escuro', desc: 'Fundo escuro, sempre.' },
    { key: 'system', title: 'Automático', desc: 'Segue o ajuste do seu celular ou computador.' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {options.map((o) => (
        <OptionCard key={o.key} active={value === o.key} title={o.title} desc={o.desc} onClick={() => onChange(o.key)} />
      ))}
    </div>
  );
}

function UsersManagementModal({ currentUserId, askConfirm }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('profiles').select('id, nome, role, created_at').order('created_at').then(({ data, error: err }) => {
      if (err) setError('Não foi possível carregar os usuários.');
      else setUsers(data);
    });
  }, []);

  function changeRole(user, newRole) {
    if (user.role === newRole || user.id === currentUserId) return;
    askConfirm(
      `Tornar ${user.nome || 'este usuário'} ${newRole === 'admin' ? 'administrador' : 'vendedor'}?`,
      async () => {
        const { error: err } = await supabase.from('profiles').update({ role: newRole }).eq('id', user.id);
        if (!err) setUsers((list) => list.map((u) => (u.id === user.id ? { ...u, role: newRole } : u)));
      }
    );
  }

  if (users === null) {
    return <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{error || 'Carregando…'}</p>;
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 14, lineHeight: 1.5 }}>
        Só aparece aqui quem já criou a própria conta pelo site. Você não pode mudar seu próprio papel por aqui.
      </p>
      <Card style={{ padding: 0 }}>
        {users.length === 0 && <div style={{ padding: 16, fontSize: 13, color: 'var(--ink-soft)' }}>Nenhum usuário encontrado.</div>}
        {users.map((u, i) => {
          const isSelf = u.id === currentUserId;
          return (
            <div key={u.id} style={{ padding: 14, borderBottom: i === users.length - 1 ? 'none' : '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700, fontSize: 14 }}>
                {u.nome || 'Sem nome'}{isSelf && <span style={{ color: 'var(--ink-soft)', fontWeight: 500 }}> (você)</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, opacity: isSelf ? 0.45 : 1, pointerEvents: isSelf ? 'none' : 'auto' }}>
                <Chip active={u.role === 'vendedor'} onClick={() => changeRole(u, 'vendedor')}>Vendedor</Chip>
                <Chip active={u.role === 'admin'} onClick={() => changeRole(u, 'admin')}>Admin</Chip>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

function BottomNav({ page, setPage, onAdd, role }) {
  // Mesma arquitetura de navegação do cabeçalho do desktop (mesmas seções, mesma
  // ordem) — só a posição muda, para o usuário não se perder ao trocar de aparelho.
  const items = navItemsFor(role).map((it) => (
    it.key === 'inicio' ? { ...it, label: 'Início' } : it
  ));
  const mid = Math.ceil(items.length / 2);
  const left = items.slice(0, mid);
  const right = items.slice(mid);

  function renderItem(it) {
    const Icon = it.icon;
    const active = page === it.key;
    return (
      <button key={it.key} onClick={() => setPage(it.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, color: active ? 'var(--primary-text)' : 'var(--ink-soft)', padding: '4px 8px', flex: 1 }}>
        <Icon size={20} strokeWidth={active ? 2.4 : 2} />
        <span style={{ fontSize: 10.5, fontWeight: active ? 700 : 500 }}>{it.label}</span>
      </button>
    );
  }

  return (
    <div className="lomuz-shell" style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', background: 'var(--surface)', borderTop: '1px solid var(--border)', padding: '8px 4px 10px' }}>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-around' }}>{left.map(renderItem)}</div>
        <div style={{ width: 58, flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-around' }}>{right.map(renderItem)}</div>
        <button
          onClick={onAdd}
          aria-label="Novo lançamento"
          style={{ position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)', width: 56, height: 56, borderRadius: '50%', background: 'var(--brand)', color: '#fff', border: '4px solid var(--bg)', boxShadow: '0 8px 18px rgba(109,40,217,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
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
  const [lembrar, setLembrar] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError('');
    setInfo('');

    if (mode === 'reset') {
      if (!email.trim()) { setError('Preencha o e-mail.'); return; }
      setLoading(true);
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
      setLoading(false);
      if (err) setError('Não foi possível enviar o link. Tente novamente.');
      else setInfo('Se esse e-mail tiver uma conta, enviamos um link para redefinir a senha.');
      return;
    }

    if (!email.trim() || !senha) { setError('Preencha e-mail e senha.'); return; }
    setLoading(true);
    if (mode === 'login') {
      localStorage.setItem('lomuz-remember', lembrar ? 'true' : 'false');
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

  function trocarModo(novo) {
    setMode(novo);
    setError('');
    setInfo('');
  }

  const titulos = { login: 'Entre com sua conta', signup: 'Crie sua conta', reset: 'Redefinir senha' };

  return (
    <div className="lomuz-app" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <style>{GLOBAL_CSS}</style>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <LogoHorizontal tone="light" size={40} />
        </div>
        <p style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13, marginBottom: 24 }}>
          {titulos[mode]}
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
          {mode !== 'reset' && (
            <Field label="Senha">
              <input type="password" style={inputStyle} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••••" />
            </Field>
          )}
          {mode === 'login' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--brand)' }} />
              <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Lembrar de mim neste dispositivo</span>
            </label>
          )}
          {error && <div style={{ color: 'var(--negative)', fontSize: 12.5, marginBottom: 10, fontWeight: 600 }}>{error}</div>}
          {info && <div style={{ color: 'var(--positive)', fontSize: 12.5, marginBottom: 10, fontWeight: 600 }}>{info}</div>}
          <Button variant="primary" onClick={submit} style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Aguarde…' : mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link de redefinição'}
          </Button>
        </Card>

        {mode === 'login' && (
          <button
            onClick={() => trocarModo('reset')}
            style={{ display: 'block', margin: '14px auto 0', background: 'none', border: 'none', color: 'var(--ink-soft)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}
          >
            Esqueci minha senha
          </button>
        )}

        <button
          onClick={() => trocarModo(mode === 'signup' ? 'login' : mode === 'reset' ? 'login' : 'signup')}
          style={{ display: 'block', margin: '10px auto 0', background: 'none', border: 'none', color: 'var(--primary-text)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        >
          {mode === 'signup' ? 'Já tem conta? Entrar' : mode === 'reset' ? 'Voltar para o login' : 'Não tem conta? Criar uma'}
        </button>
      </div>
    </div>
  );
}

function ResetPasswordScreen({ onDone }) {
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError('');
    if (senha.length < 6) { setError('A senha precisa ter pelo menos 6 caracteres.'); return; }
    if (senha !== confirmar) { setError('As senhas não são iguais.'); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password: senha });
    setLoading(false);
    if (err) { setError('Não foi possível salvar a nova senha. Peça um novo link e tente de novo.'); return; }
    onDone();
  }

  return (
    <div className="lomuz-app" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <style>{GLOBAL_CSS}</style>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <LogoHorizontal tone="light" size={40} />
        </div>
        <p style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13, marginBottom: 24 }}>Defina sua nova senha</p>
        <Card>
          <Field label="Nova senha">
            <input type="password" style={inputStyle} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••••" />
          </Field>
          <Field label="Confirmar nova senha">
            <input type="password" style={inputStyle} value={confirmar} onChange={(e) => setConfirmar(e.target.value)} placeholder="••••••••" />
          </Field>
          {error && <div style={{ color: 'var(--negative)', fontSize: 12.5, marginBottom: 10, fontWeight: 600 }}>{error}</div>}
          <Button variant="primary" onClick={submit} style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Salvando…' : 'Salvar nova senha'}
          </Button>
        </Card>
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
  const [showUsers, setShowUsers] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [showMural, setShowMural] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [txDraft, setTxDraft] = useState(null);
  const [txStep, setTxStep] = useState('form');

  const [confirmDialog, setConfirmDialog] = useState(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [themePref, setThemePref] = useState('system');
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const isDark = themePref === 'dark' || (themePref === 'system' && systemDark);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      setSession(s);
    });
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
      const [profileRes, catRes, vendRes, txRes, planoRes, orientRes, metaEqRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('categories').select('*').order('nome'),
        supabase.from('vendedores').select('*'),
        supabase.from('transactions').select('*'),
        supabase.from('planos').select('*').order('nome'),
        supabase.from('orientacoes').select('*'),
        supabase.from('metas_equipe').select('*'),
      ]);
      const metasEquipe = {};
      (metaEqRes.data || []).forEach((r) => { metasEquipe[r.mes] = Number(r.valor) || 0; });
      const profile = profileRes.data;
      const vendedores = (vendRes.data || []).map(rowToVendedor);
      const r = profile?.role || 'vendedor';
      const myVendedor = vendedores.find((v) => v.profileId === userId);
      setData({
        categories: catRes.data || [],
        transactions: (txRes.data || []).map(rowToTx),
        vendedores,
        planos: (planoRes.data || []).map(rowToPlano),
        orientacoes: (orientRes.data || []).map(rowToOrientacao),
        metasEquipe,
        uiPrefs: {
          dashboardWidgets: (profile?.dashboard_widgets && Object.keys(profile.dashboard_widgets).length)
            ? profile.dashboard_widgets
            : { ...DEFAULT_DASHBOARD_WIDGETS },
        },
      });
      setRole(r);
      setCurrentVendedorId(r === 'vendedor' ? (myVendedor?.id || null) : null);
      setNome(profile?.nome || s.user.email);
      setThemePref(profile?.theme || 'system');
    } catch (e) {
      console.error('Erro ao carregar dados do Supabase', e);
    }
  }

  async function handleSetTheme(newTheme) {
    setThemePref(newTheme);
    const userId = session?.user?.id;
    if (userId) await supabase.from('profiles').update({ theme: newTheme }).eq('id', userId);
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

      // planos negociados
      const prevPlanos = prev?.planos || [];
      const newPlanos = newData.planos || [];
      for (const p of newPlanos) {
        const before = prevPlanos.find((x) => x.id === p.id);
        if (!before) await supabase.from('planos').insert(planoToRow(p));
        else if (JSON.stringify(before) !== JSON.stringify(p)) await supabase.from('planos').update(planoToRow(p)).eq('id', p.id);
      }
      for (const p of prevPlanos) {
        if (!newPlanos.find((x) => x.id === p.id)) await supabase.from('planos').delete().eq('id', p.id);
      }

      // mural de orientação
      const prevOrients = prev?.orientacoes || [];
      const newOrients = newData.orientacoes || [];
      for (const o of newOrients) {
        const before = prevOrients.find((x) => x.id === o.id);
        if (!before) await supabase.from('orientacoes').insert(orientacaoToRow(o));
        else if (JSON.stringify(before) !== JSON.stringify(o)) await supabase.from('orientacoes').update(orientacaoToRow(o)).eq('id', o.id);
      }
      for (const o of prevOrients) {
        if (!newOrients.find((x) => x.id === o.id)) await supabase.from('orientacoes').delete().eq('id', o.id);
      }

      // meta da empresa por mês (upsert quando tem valor, remove quando zera)
      const prevMetaEq = prev?.metasEquipe || {};
      const newMetaEq = newData.metasEquipe || {};
      for (const [mes, valor] of Object.entries(newMetaEq)) {
        if (prevMetaEq[mes] !== valor) await supabase.from('metas_equipe').upsert({ mes, valor });
      }
      for (const mes of Object.keys(prevMetaEq)) {
        if (!(mes in newMetaEq)) await supabase.from('metas_equipe').delete().eq('mes', mes);
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
      // Venda lançada por vendedor entra como "pendente" e só conta depois
      // que o admin revisa e aprova. Lançamento feito pelo admin já vale.
      status: role === 'vendedor' ? 'pendente' : 'aprovado',
      clienteNome: '',
      contratoMeses: '',
      formaPagamento: '',
      planoId: '',
      comissaoPercentual: '',
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
      status: draft.status || editingTx?.status || 'aprovado',
      clienteNome: draft.clienteNome || '',
      contratoMeses: draft.contratoMeses ? (parseInt(draft.contratoMeses, 10) || null) : null,
      formaPagamento: draft.formaPagamento || '',
      planoId: draft.planoId || null,
      comissaoPercentual: (draft.comissaoPercentual !== '' && draft.comissaoPercentual != null)
        ? (parseFloat(draft.comissaoPercentual) || 0)
        : null,
    };
    const list = editingTx ? data.transactions.map((t) => (t.id === tx.id ? tx : t)) : [...data.transactions, tx];
    persist({ ...data, transactions: list });
  }
  function approveTransaction(draft) {
    commitTransaction({ ...draft, status: 'aprovado' }, { mode: draft.ativacao || 'imediata', dias: draft.diasTeste || 7 });
    closeTxModal();
  }
  function rejectTransaction(draft) {
    askConfirm('Rejeitar esta venda? Ela fica registrada como rejeitada e não conta no saldo nem na comissão.', () => {
      commitTransaction({ ...draft, status: 'rejeitado' }, { mode: draft.ativacao || 'imediata', dias: draft.diasTeste || 7 });
      closeTxModal();
    });
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
      <div className={`lomuz-app${isDark ? ' lomuz-dark' : ''}`} style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{GLOBAL_CSS}</style>
        <span style={{ fontSize: 14, color: 'var(--ink-soft)' }}>Carregando…</span>
      </div>
    );
  }

  if (passwordRecovery) {
    return <ResetPasswordScreen onDone={() => setPasswordRecovery(false)} />;
  }

  if (!session) {
    return <LoginScreen />;
  }

  // Carregamento: esqueleto no lugar do painel, em vez de tela vazia com texto.
  if (!data) {
    return (
      <div className={`lomuz-app${isDark ? ' lomuz-dark' : ''}`} style={{ minHeight: '100vh' }}>
        <style>{GLOBAL_CSS}</style>
        <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <div className="lomuz-topbar">
            <LogoHorizontal tone="light" size={32} />
          </div>
        </div>
        <div className="lomuz-content" aria-busy="true" aria-live="polite">
          <span className="lomuz-sr-only">Carregando os dados do Lomuz Control.</span>
          <Skeleton width={200} height={26} />
          <Skeleton width={300} height={14} style={{ marginTop: 8, marginBottom: 22 }} />
          <div className="lomuz-kpi-grid">
            <StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton />
          </div>
          <div className="lomuz-main-grid">
            <Skeleton height={320} radius="var(--radius-lg)" />
            <Skeleton height={320} radius="var(--radius-lg)" />
          </div>
        </div>
      </div>
    );
  }

  const primeiroNome = (nome || '').trim().split(/\s+/)[0] || '';
  const pageTitles = {
    inicio: 'Visão geral',
    lancamentos: role === 'vendedor' ? 'Suas vendas' : 'Lançamentos',
    previsao: role === 'vendedor' ? 'Sua previsão' : 'Previsão',
    categorias: 'Categorias',
    config: 'Configurações',
  };
  const pageSubtitles = {
    inicio: primeiroNome
      ? `Olá, ${primeiroNome}. Aqui está o resumo financeiro.`
      : 'Aqui está o resumo financeiro.',
    lancamentos: role === 'vendedor'
      ? 'Suas vendas lançadas e o status de aprovação de cada uma.'
      : 'Todas as receitas e despesas, com filtro por tipo e categoria.',
    previsao: role === 'vendedor'
      ? 'Sua projeção de vendas, metas e comissão.'
      : 'Projeção financeira e panorama da equipe de vendas.',
    categorias: 'Categorias de receita e despesa, e os planos negociados.',
    config: 'Aparência, usuários e mural de orientação.',
  };

  // Avisos reais do sistema — nada decorativo no sino.
  const alerts = [];
  if (role === 'admin') {
    const revisar = data.transactions.filter((t) => t.status === 'pendente').length;
    if (revisar > 0) {
      alerts.push({ tone: 'warning', page: 'inicio', text: `${revisar} venda(s) aguardando sua revisão.` });
    }
  }
  const aguardandoAtivacao = scopedTransactions(data, role, currentVendedorId)
    .filter((t) => t.recorrente && getRecurrenceStatus(t) === 'pendente').length;
  if (aguardandoAtivacao > 0) {
    alerts.push({ tone: 'warning', page: 'inicio', text: `${aguardandoAtivacao} lançamento(s) recorrente(s) aguardando ativação.` });
  }

  return (
    <div className={`lomuz-app${isDark ? ' lomuz-dark' : ''}`} style={{ minHeight: '100vh' }}>
      <style>{GLOBAL_CSS}</style>
      <AppShell
        role={role}
        nome={nome}
        page={page}
        setPage={setPage}
        onLogout={handleLogout}
        pageTitle={pageTitles[page] || 'Lomuz Control'}
        pageSubtitle={pageSubtitles[page]}
        alerts={alerts}
        onAlertClick={(a) => setPage(a.page || 'inicio')}
      >
        {page === 'inicio' && (
          <Dashboard data={data} role={role} currentVendedorId={currentVendedorId} period={period} setPeriod={setPeriod} onAddClick={openAddTransaction} onGoTo={setPage} onActivateNow={activateNow} onCustomizeClick={() => setShowCustomize(true)} onReviewSale={openEditTransaction} onEditMural={() => setShowMural(true)} />
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
        {page === 'config' && (
          <ConfiguracoesPage
            role={role}
            themePref={themePref}
            onTheme={() => setShowTheme(true)}
            onUsers={() => setShowUsers(true)}
            onMural={() => setShowMural(true)}
          />
        )}
      </AppShell>

      <div className="lomuz-bottomnav">
        <BottomNav page={page} setPage={setPage} onAdd={openAddTransaction} role={role} />
      </div>
      <div style={{ height: 96 }} className="lomuz-bottomnav" aria-hidden="true" />

        {showAddTx && (
          <Modal
            title={
              (editingTx && role === 'admin' && editingTx.status === 'pendente') ? 'Revisar venda'
                : editingTx ? 'Editar lançamento'
                  : txStep === 'form' ? (role === 'vendedor' ? 'Nova venda' : 'Novo lançamento')
                    : txStep === 'confirmRecurrence' ? 'Confirmar recorrência' : 'Ativação da recorrência'
            }
            onClose={closeTxModal}
          >
            {txStep === 'form' && (
              <TransactionForm
                draft={txDraft}
                categories={data.categories}
                role={role}
                vendedores={data.vendedores}
                planos={data.planos}
                onSubmit={handleFormSubmit}
                onCancel={closeTxModal}
                onDelete={editingTx ? () => requestDeleteTransaction(editingTx) : null}
                onCancelRecurrence={(editingTx && editingTx.recorrente && getRecurrenceStatus(editingTx) === 'ativo') ? () => requestCancelRecurrence(editingTx) : null}
                onApprove={approveTransaction}
                onReject={rejectTransaction}
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

        {showTheme && (
          <Modal title="Aparência" onClose={() => setShowTheme(false)}>
            <ThemeModal value={themePref} onChange={handleSetTheme} />
          </Modal>
        )}

        {showMural && (
          <Modal title="Mural de orientação" onClose={() => setShowMural(false)}>
            <MuralAdminModal
              orientacoes={data.orientacoes}
              persistOrientacoes={(nova) => persist({ ...data, orientacoes: nova })}
              askConfirm={askConfirm}
            />
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

        {showUsers && (
          <Modal title="Usuários" onClose={() => setShowUsers(false)}>
            <UsersManagementModal currentUserId={session?.user?.id} askConfirm={askConfirm} />
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
  );
}
