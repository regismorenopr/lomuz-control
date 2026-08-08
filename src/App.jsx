import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  Home, Receipt, TrendingUp, Tag, Plus, X, Calendar, ChevronRight, Repeat, Check,
  ArrowUpCircle, ArrowDownCircle, Users, Trash2, Edit2, Clock, Target, Upload,
  Utensils, Car, Film, HeartPulse, ShoppingBag, Briefcase, GraduationCap, Wallet,
  Gift, Smartphone, PawPrint, MoreHorizontal, Sparkles, Megaphone, Pin, FileText, Palette, Search, Settings,
  Download,
} from 'lucide-react';
import Papa from 'papaparse';
import { supabase } from './supabaseClient';
import { GLOBAL_CSS } from './styles/tokens.js';
import { AppShell, navItemsFor } from './components/AppShell.jsx';
import { LogoHorizontal } from './brand/Logo.jsx';
import {
  StatCard, TrendIndicator, StatusBadge, CashFlowChart, Panel, PanelLink,
  EmptyBlock, StatCardSkeleton, Skeleton, formatBRL,
} from './components/dashboard.jsx';
import { CurrencyInput } from './components/CurrencyInput.jsx';

// O Supabase (PostgREST) só devolve até 1000 linhas por chamada, mesmo sem
// limite explícito no .select(). Tabelas pequenas nunca notam, mas
// "transactions" já passou disso — sem paginar aqui, uma fatia dos
// lançamentos simplesmente some da tela sem nenhum erro. Busca em páginas de
// 1000 até a última vir incompleta.
async function fetchAllRows(table, { order = 'id' } = {}) {
  const pageSize = 1000;
  let from = 0;
  let all = [];
  for (;;) {
    const { data, error } = await supabase.from(table).select('*').order(order).range(from, from + pageSize - 1);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return { data: all };
}

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
// Soma meses SEM deixar o dia transbordar pro mês seguinte. O `setMonth` puro do
// JavaScript faz 31/07 menos 5 meses virar 03/03 (porque "31 de fevereiro" não
// existe e ele rola pra frente) — o que, num dia 29/30/31, deslocava em um mês
// inteiro o período anterior da comparação e a data das parcelas de uma
// recorrência. Quando o dia não existe no mês de destino, cai no último dia dele.
function addMonths(date, months) {
  const ano = date.getFullYear();
  const mes = date.getMonth() + months;
  const diaAlvo = date.getDate();
  const ultimoDiaDoMesAlvo = new Date(ano, mes + 1, 0).getDate();
  const d = new Date(date);
  d.setFullYear(ano, mes, Math.min(diaAlvo, ultimoDiaDoMesAlvo));
  return d;
}
function startOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function endOfMonth(date) { return new Date(date.getFullYear(), date.getMonth() + 1, 0); }

const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function monthLabel(date) { return `${MONTH_ABBR[date.getMonth()]}/${String(date.getFullYear()).slice(-2)}`; }
function monthKey(date) { return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`; }

// Nome do mês escrito por extenso. Lista à mão em vez de toLocaleDateString
// porque o pt-BR devolve minúsculo ("julho") e, em alguns ambientes, "julho de
// 2026" quando combinado com o ano — aqui o texto precisa ser exato.
const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
function mesAnoLabel(date) { return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`; }
// Distância em meses de calendário (ignora o dia), pode ser negativa. Nome
// diferente de monthsBetween (mais abaixo), que devolve a LISTA de meses.
function monthsDiff(from, to) {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

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
    fornecedor_id: tx.fornecedorId || null,
    contrato_meses: tx.contratoMeses || null,
    forma_pagamento: tx.formaPagamento || null,
    plano_id: tx.planoId || null,
    comissao_percentual: tx.comissaoPercentual != null ? tx.comissaoPercentual : null,
    pago: tx.pago !== false,
    data_vencimento: tx.dataVencimento || null,
    ultima_confirmacao: tx.ultimaConfirmacao || null,
    // Só despesa tem custo fixo/variável. As 3.420 despesas importadas já vêm
    // classificadas; o null existe porque a coluna nasceu sem valor padrão, e o
    // relatório mostra esse grupo como "não classificada" em vez de fingir.
    despesa_fixa: tx.tipo === 'despesa' ? (tx.despesaFixa == null ? null : !!tx.despesaFixa) : null,
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
    fornecedorId: row.fornecedor_id || null,
    contratoMeses: row.contrato_meses,
    formaPagamento: row.forma_pagamento || '',
    planoId: row.plano_id || null,
    comissaoPercentual: row.comissao_percentual != null ? Number(row.comissao_percentual) : null,
    dataEstimada: !!row.data_estimada,
    pago: row.pago !== false,
    dataVencimento: row.data_vencimento || null,
    ultimaConfirmacao: row.ultima_confirmacao || null,
    despesaFixa: row.despesa_fixa == null ? null : !!row.despesa_fixa,
  };
}
function planoToRow(p) {
  return {
    id: p.id,
    nome: p.nome,
    valor: p.valor || 0,
    categoria_id: p.categoriaId || null,
    servico_id: p.servicoId || null,
    comissao_percentual: (p.comissaoPercentual === '' || p.comissaoPercentual == null) ? null : Number(p.comissaoPercentual),
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
    servicoId: row.servico_id,
    comissaoPercentual: row.comissao_percentual == null ? null : Number(row.comissao_percentual),
    contratoMeses: row.contrato_meses,
    recorrente: !!row.recorrente,
    frequencia: row.frequencia || 'mensal',
    ativo: row.ativo !== false,
  };
}

function servicoToRow(s) {
  return { id: s.id, nome: s.nome, tipo_cobranca: s.tipoCobranca || 'unitaria', ativo: s.ativo !== false };
}
function rowToServico(row) {
  return { id: row.id, nome: row.nome, tipoCobranca: row.tipo_cobranca || 'unitaria', ativo: row.ativo !== false };
}

// Fornecedores são "credores" no sentido largo: a base tem fornecedor de
// verdade, banco, imposto e salário no mesmo campo, porque no sistema antigo o
// credor da despesa era só um texto solto. A tabela dá cadastro a esse texto —
// dá pra renomear sem perder histórico e somar quanto já foi pago a cada um.
function fornecedorToRow(f) {
  return { id: f.id, nome: f.nome, documento: f.documento || null, ativo: f.ativo !== false };
}
function rowToFornecedor(row) {
  return { id: row.id, nome: row.nome, documento: row.documento || '', ativo: row.ativo !== false };
}

function ramoToRow(r) {
  return { id: r.id, nome: r.nome };
}
function rowToRamo(row) {
  return { id: row.id, nome: row.nome };
}

function indiceToRow(i) {
  return { id: i.id, nome: i.nome, descricao: i.descricao || '' };
}
function rowToIndice(row) {
  return { id: row.id, nome: row.nome, descricao: row.descricao || '' };
}

function clienteToRow(c) {
  return {
    id: c.id,
    nome_fantasia: c.nomeFantasia,
    razao_social: c.razaoSocial || null,
    organizacao_rede: c.organizacaoRede || null,
    ramo_negocio_id: c.ramoNegocioId || null,
    cidade: c.cidade || null,
    estado: c.estado || null,
    endereco: c.endereco || null,
    contato_nome: c.contatoNome || null,
    contato_telefone: c.contatoTelefone || null,
    contato_email: c.contatoEmail || null,
    indice_reajuste_id: c.indiceReajusteId || null,
    proximo_reajuste: c.proximoReajuste || null,
    reajuste_confirmado: !!c.reajusteConfirmado,
    reajuste_percentual: c.reajustePercentual != null && c.reajustePercentual !== '' ? Number(c.reajustePercentual) : null,
    reajuste_valor: c.reajusteValor != null && c.reajusteValor !== '' ? Number(c.reajusteValor) : null,
    reajuste_suspenso_ate: c.reajusteSuspensoAte || null,
    ativo: c.ativo !== false,
    observacoes: c.observacoes || null,
  };
}
function rowToCliente(row) {
  return {
    id: row.id,
    nomeFantasia: row.nome_fantasia,
    razaoSocial: row.razao_social || '',
    organizacaoRede: row.organizacao_rede || '',
    ramoNegocioId: row.ramo_negocio_id,
    cidade: row.cidade || '',
    estado: row.estado || '',
    endereco: row.endereco || '',
    contatoNome: row.contato_nome || '',
    contatoTelefone: row.contato_telefone || '',
    contatoEmail: row.contato_email || '',
    indiceReajusteId: row.indice_reajuste_id,
    proximoReajuste: row.proximo_reajuste || null,
    reajusteConfirmado: !!row.reajuste_confirmado,
    reajustePercentual: row.reajuste_percentual != null ? Number(row.reajuste_percentual) : null,
    reajusteValor: row.reajuste_valor != null ? Number(row.reajuste_valor) : null,
    reajusteSuspensoAte: row.reajuste_suspenso_ate || null,
    ativo: row.ativo !== false,
    observacoes: row.observacoes || '',
  };
}

function clientePlanoToRow(cp) {
  return {
    id: cp.id,
    cliente_id: cp.clienteId,
    plano_id: cp.planoId || null,
    servico_id: cp.servicoId || null,
    ativo: cp.ativo !== false,
    cliente_desde: cp.clienteDesde || null,
  };
}
function rowToClientePlano(row) {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    planoId: row.plano_id,
    servicoId: row.servico_id,
    ativo: row.ativo !== false,
    clienteDesde: row.cliente_desde,
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
// negociado > comissão padrão do vendedor. Plano com comissão em branco não
// entra na disputa — antes um plano sem comissão definida gravava 0 e zerava a
// comissão do vendedor sem ninguém ter pedido. Zero explícito continua valendo
// como "esse plano não paga comissão".
function comissaoDaVenda(tx, vendedor, planos) {
  if (tx.comissaoPercentual != null) return tx.comissaoPercentual;
  const plano = tx.planoId ? (planos || []).find((p) => p.id === tx.planoId) : null;
  if (plano && plano.comissaoPercentual != null) return plano.comissaoPercentual;
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
    ativo: v.ativo !== false,
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
    ativo: row.ativo !== false,
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
  // Cada parcela é contada a partir da data original do contrato (start + N
  // meses), não somando um mês sobre a parcela anterior. A diferença aparece em
  // contrato do dia 29/30/31: somando em cadeia, um contrato do dia 31 caía em
  // 28/02 e daí em diante ficava presa no dia 28 pra sempre. Ancorado na
  // origem, ele volta pro dia 31 no mês seguinte.
  let count = 0;
  for (let safety = 0; safety < 1200; safety += 1) {
    if (count >= maxCount) break;
    const current = tx.frequencia === 'semanal'
      ? addDays(start, 7 * count)
      : addMonths(start, count * (tx.frequencia === 'anual' ? 12 : 1));
    if (current > effectiveEnd) break;
    if (current >= rangeStart) occurrences.push(current);
    count += 1;
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
  // Quantas ocorrências cada categoria teve — é o divisor do ticket médio por
  // produto (valor faturado ÷ nº de cobranças no período).
  const countByCategory = {};
  transactions.forEach((tx) => {
    if (tx.tipo !== tipo) return;
    const occ = expandOccurrences(tx, rangeStart, rangeEnd);
    if (occ.length === 0) return;
    const value = tx.valor * occ.length;
    total += value;
    count += occ.length;
    byCategory[tx.categoriaId] = (byCategory[tx.categoriaId] || 0) + value;
    countByCategory[tx.categoriaId] = (countByCategory[tx.categoriaId] || 0) + occ.length;
  });
  return { total: round2(total), count, byCategory, countByCategory };
}

// Soma por uma chave qualquer — categoria, fornecedor, cliente — já expandindo
// as recorrências dentro do período. Mesma regra do resto do app: o realizado
// de um contrato mensal é o valor dele × o número de cobranças no período, não
// o valor do contrato uma vez só.
function sumByKey(transactions, tipo, rangeStart, rangeEnd, keyFn) {
  const map = new Map();
  let total = 0;
  transactions.forEach((tx) => {
    if (tx.tipo !== tipo) return;
    const chave = keyFn(tx);
    if (chave == null || chave === '') return;
    const occ = expandOccurrences(tx, rangeStart, rangeEnd);
    if (occ.length === 0) return;
    const valor = tx.valor * occ.length;
    const r = map.get(chave) || { chave, valor: 0, cobrancas: 0, lancamentos: 0 };
    r.valor += valor;
    r.cobrancas += occ.length;
    r.lancamentos += 1;
    map.set(chave, r);
    total += valor;
  });
  const rows = [...map.values()]
    .map((r) => ({ ...r, valor: round2(r.valor), pct: total > 0 ? (r.valor / total) * 100 : 0 }))
    .sort((a, b) => b.valor - a.valor);
  return { rows, total: round2(total) };
}

// Número no formato que o Excel em português entende (vírgula decimal).
function numeroCSV(v) { return (Math.round((v || 0) * 100) / 100).toFixed(2).replace('.', ','); }

// Baixa uma tabela como CSV. Três detalhes que decidem se o arquivo abre certo
// no Excel em português: separador ponto-e-vírgula, vírgula decimal (numeroCSV)
// e o BOM no começo — sem o BOM os acentos viram sujeira.
function baixarCSV(nomeArquivo, linhas) {
  const csv = Papa.unparse(linhas, { delimiter: ';' });
  const blob = new Blob([String.fromCharCode(0xFEFF) + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
    case 'ultimos_12':
      return { start: startOfMonth(addMonths(today, -11)), end: endOfMonth(today) };
    case 'ano_passado':
      return { start: new Date(today.getFullYear() - 1, 0, 1), end: new Date(today.getFullYear() - 1, 11, 31) };
    case 'proximos_3':
      return { start: startOfMonth(today), end: endOfMonth(addMonths(today, 2)) };
    case 'proximos_6':
      return { start: startOfMonth(today), end: endOfMonth(addMonths(today, 5)) };
    case 'ano_atual':
      return { start: new Date(today.getFullYear(), 0, 1), end: new Date(today.getFullYear(), 11, 31) };
    // Janeiro a dezembro de um ano escolhido — o seletor deixa recuar pra anos
    // anteriores e avançar pros seguintes, e o ano corrente sai com os meses já
    // realizados mais a projeção dos contratos até dezembro.
    case 'ano': {
      const y = period.ano || today.getFullYear();
      return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
    }
    // Um mês escolhido, com a mesma navegação de recuar/avançar do "ano":
    // mesOffset é a distância em meses até hoje (0 = mês atual, -1 = mês
    // passado, 1 = mês que vem).
    case 'mes': {
      const alvo = addMonths(today, period.mesOffset || 0);
      return { start: startOfMonth(alvo), end: endOfMonth(alvo) };
    }
    case 'custom':
      return {
        start: period.start ? parseISODate(period.start) : startOfMonth(today),
        end: period.end ? parseISODate(period.end) : endOfMonth(today),
      };
    default:
      return { start: startOfMonth(today), end: endOfMonth(today) };
  }
}

// Nome legível do período em foco. "Este mês" por si só não diz que mês é —
// este rótulo diz, e vale para todas as opções do seletor.
function periodLabel(period) {
  const { start, end } = getPeriodRange(period);
  if (period.type === 'custom') return `${formatDateBR(toISODate(start))} a ${formatDateBR(toISODate(end))}`;
  if (period.type === 'ano' || period.type === 'ano_atual' || period.type === 'ano_passado') return `Ano de ${start.getFullYear()}`;
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) return mesAnoLabel(start);
  if (start.getFullYear() === end.getFullYear()) {
    return `${MONTH_NAMES[start.getMonth()]} a ${MONTH_NAMES[end.getMonth()]} ${start.getFullYear()}`;
  }
  return `${mesAnoLabel(start)} a ${mesAnoLabel(end)}`;
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
    case 'ultimos_12':
      return { start: startOfMonth(addMonths(today, -23)), end: endOfMonth(addMonths(today, -12)) };
    case 'ano_passado':
      return { start: new Date(today.getFullYear() - 2, 0, 1), end: new Date(today.getFullYear() - 2, 11, 31) };
    case 'proximos_3':
      return { start: startOfMonth(addMonths(today, -3)), end: endOfMonth(addMonths(today, -1)) };
    case 'proximos_6':
      return { start: startOfMonth(addMonths(today, -6)), end: endOfMonth(addMonths(today, -1)) };
    case 'ano_atual':
      return { start: new Date(today.getFullYear() - 1, 0, 1), end: new Date(today.getFullYear() - 1, 11, 31) };
    case 'ano': {
      const y = (period.ano || today.getFullYear()) - 1;
      return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
    }
    case 'mes': {
      const alvo = addMonths(today, (period.mesOffset || 0) - 1);
      return { start: startOfMonth(alvo), end: endOfMonth(alvo) };
    }
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

// Entradas x saídas mês a mês, no formato que o gráfico de fluxo de caixa usa.
// monthsForward > 0 estende a série para meses futuros (períodos "Próx. N meses").
function buildCashFlowRows(transactions, monthsBack, monthsForward = 0) {
  return buildCompanyEvolution(transactions, monthsBack, monthsForward).map((r) => ({
    key: r.key, label: r.label, entradas: r.receita, saidas: r.despesa,
  }));
}

// Quebra o período escolhido em meses, recortando o primeiro e o último mês nas
// datas exatas do período — assim a soma das linhas fecha com os cartões de
// Receitas/Despesas/Resultado, em vez de estourar pelas bordas do mês.
function buildPeriodMonthlyRows(transactions, range) {
  const rows = [];
  let cursor = startOfMonth(range.start);
  let safety = 0;
  while (cursor <= range.end && safety < 240) {
    const rs = cursor > range.start ? cursor : range.start;
    const fimMes = endOfMonth(cursor);
    const re = fimMes < range.end ? fimMes : range.end;
    const receitas = sumByPeriod(transactions, 'receita', rs, re).total;
    const despesas = sumByPeriod(transactions, 'despesa', rs, re).total;
    rows.push({ key: monthKey(cursor), label: mesAnoLabel(cursor), receitas, despesas, saldo: round2(receitas - despesas) });
    cursor = addMonths(cursor, 1);
    safety += 1;
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
  // Vendas antigas importadas sem data real (data_estimada) não entram na
  // evolução mês a mês pra não empilhar um pico artificial num único mês —
  // mas continuam contando nos totais gerais/acumulados, que não dependem de mês.
  const txsComDataConfiavel = transactions.filter((t) => !t.dataEstimada);
  const rows = [];
  for (let i = -(monthsBack - 1); i <= monthsForward; i += 1) {
    const m = addMonths(startOfMonth(today), i);
    const rs = startOfMonth(m);
    const re = endOfMonth(m);
    const receita = sumByPeriod(txsComDataConfiavel, 'receita', rs, re).total;
    const despesa = sumByPeriod(txsComDataConfiavel, 'despesa', rs, re).total;
    rows.push({ key: monthKey(m), label: monthLabel(m), receita, despesa, saldo: round2(receita - despesa) });
  }
  return rows;
}

// Clientes ativos cujo próximo reajuste de contrato está a `diasJanela` dias
// ou menos (inclui atrasado). Base do aviso no sino e no banner da página de
// Clientes — nenhum reajuste é aplicado sozinho, só avisa.
function clientesComReajustePendente(clientes, diasJanela = 30) {
  const hojeISO = toISODate(new Date());
  const limiteISO = toISODate(addDays(new Date(), diasJanela));
  return (clientes || [])
    .filter((c) => {
      if (c.ativo === false || !c.proximoReajuste) return false;
      // Suspensão vencida volta a avisar sozinha — não precisa o admin reativar.
      if (c.reajusteSuspensoAte && c.reajusteSuspensoAte >= hojeISO) return false;
      return c.proximoReajuste <= limiteISO;
    })
    .map((c) => ({ ...c, atrasado: c.proximoReajuste < hojeISO }))
    .sort((a, b) => a.proximoReajuste.localeCompare(b.proximoReajuste));
}

// Progressão de urgência do relatório de vencimentos — tempo estimado pelo
// analista: até 10 dias corridos após o vencimento é folga normal (banco
// processando, lembrete ainda não surtiu efeito); depois disso vira crítico.
function urgenciaAtraso(diasAtraso) {
  if (!diasAtraso || diasAtraso <= 0) return null;
  if (diasAtraso <= 10) return { tone: 'warning', label: 'Atenção' };
  return { tone: 'danger', label: 'Crítico' };
}

// Meses inteiros desde o último pagamento de uma recorrência. O atraso do ciclo
// sozinho nunca passa de ~31 dias, então um contrato marcado ativo mas sem
// receber desde 2023 aparecia igual a um que atrasou uma semana. Este número é
// o que separa "esqueceu de pagar" de "parou de pagar e ninguém cancelou".
function mesesSemPagamento(tx, hoje = new Date()) {
  if (!tx.ultimaConfirmacao) return null;
  const u = parseISODate(tx.ultimaConfirmacao);
  const meses = (hoje.getFullYear() - u.getFullYear()) * 12 + (hoje.getMonth() - u.getMonth());
  return meses > 0 ? meses : 0;
}

// Ciclo de vencimento atual de uma recorrência: o dia de vencimento é o dia
// do mês da data original do contrato (ex.: contrato datado 2026-07-01
// vence todo dia 1º). Sem confirmação de recebimento desde esse dia, conta
// como dias em atraso — é um sinal pro relatório, o app não concilia banco.
function cicloVencimentoRecorrente(tx, hoje = new Date()) {
  const diaVencimento = parseISODate(tx.data).getDate();
  let vencimentoCiclo = new Date(hoje.getFullYear(), hoje.getMonth(), diaVencimento);
  if (vencimentoCiclo > hoje) vencimentoCiclo = new Date(hoje.getFullYear(), hoje.getMonth() - 1, diaVencimento);
  const confirmado = !!(tx.ultimaConfirmacao && parseISODate(tx.ultimaConfirmacao) >= vencimentoCiclo);
  const diasAtraso = confirmado ? 0 : Math.max(0, Math.round((hoje - vencimentoCiclo) / 86400000));
  return { diaVencimento, vencimentoCiclo: toISODate(vencimentoCiclo), diasAtraso, confirmado };
}

// Relatório completo de vencimentos: cada recorrência ativa no ciclo atual +
// contas pontuais em aberto, todas com o mesmo selo de urgência — a análise
// por cliente que o zControl não oferecia.
function buildRelatorioVencimentos(transactions, hoje = new Date()) {
  const linhas = [];
  transactions.forEach((t) => {
    if (t.status !== 'aprovado') return;
    if (t.recorrente) {
      if (getRecurrenceStatus(t) !== 'ativo') return;
      const ciclo = cicloVencimentoRecorrente(t, hoje);
      linhas.push({
        id: t.id, tipo: t.tipo, recorrente: true, clienteNome: t.clienteNome, descricao: t.descricao, valor: t.valor,
        diaVencimento: ciclo.diaVencimento, vencimento: ciclo.vencimentoCiclo, diasAtraso: ciclo.diasAtraso, confirmado: ciclo.confirmado,
        ultimoPagamento: t.ultimaConfirmacao || null, mesesParado: mesesSemPagamento(t, hoje),
      });
    } else if (t.pago === false && t.dataVencimento) {
      const diasAtraso = Math.max(0, Math.round((hoje - parseISODate(t.dataVencimento)) / 86400000));
      linhas.push({
        id: t.id, tipo: t.tipo, recorrente: false, clienteNome: t.clienteNome, descricao: t.descricao, valor: t.valor,
        vencimento: t.dataVencimento, diasAtraso, confirmado: false,
        ultimoPagamento: null, mesesParado: null,
      });
    }
  });
  // Contrato parado há meses vem antes de tudo: é dinheiro que a empresa acha
  // que recebe e não recebe. Depois deles, ordem por dias de atraso.
  return linhas.sort((a, b) => (b.mesesParado || 0) - (a.mesesParado || 0) || b.diasAtraso - a.diasAtraso);
}

// Recorrência ativa que não recebe há 3 meses ou mais: a empresa conta esse
// dinheiro no MRR e ele não entra. 3 meses porque 1 ou 2 ainda cabe em atraso
// comum (boleto, troca de titularidade); a partir do terceiro é padrão.
const MESES_PARA_CONTRATO_PARADO = 3;
function contratosParados(linhas) {
  return (linhas || []).filter((l) => l.recorrente && (l.mesesParado || 0) >= MESES_PARA_CONTRATO_PARADO);
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
    pago: tx.pago !== false,
    dataVencimento: tx.dataVencimento || '',
    despesaFixa: tx.despesaFixa === true,
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
const thStyle = { textAlign: 'left', padding: '8px 10px', fontWeight: 700, color: 'var(--ink-soft)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', fontSize: 'var(--fs-small)' };
const tdStyle = { padding: '8px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };

// Os tokens visuais (cores, raios, sombras, grades e responsividade) ficam
// centralizados em src/styles/tokens.js.

/* =========================================================================
   COMPONENTES BÁSICOS (ÁTOMOS)
   ========================================================================= */

function Card({ children, style }) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 16, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border)', ...style }}>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 14px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--fs-body)', fontWeight: 600, flexShrink: 0,
        border: active ? '1px solid var(--brand)' : '1px solid var(--border)',
        background: active ? 'var(--brand)' : 'var(--surface)',
        color: active ? 'var(--on-primary)' : 'var(--ink-soft)', cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

function Button({ variant = 'primary', children, style, ...props }) {
  const base = { padding: '12px 16px', borderRadius: 'var(--radius)', fontWeight: 700, fontSize: 'var(--fs-base)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 };
  const variants = {
    primary: { background: 'var(--brand)', color: 'var(--on-primary)' },
    secondary: { background: 'var(--surface-2)', color: 'var(--ink)' },
    danger: { background: 'var(--negative)', color: 'var(--on-primary)' },
    ghost: { background: 'transparent', color: 'var(--ink-soft)' },
  };
  return <button style={{ ...base, ...variants[variant], ...style }} {...props}>{children}</button>;
}

function Field({ label, children, hint }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ display: 'block', fontSize: 'var(--fs-micro)', fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: 'var(--fs-small)', color: 'var(--ink-soft)', marginTop: 5, lineHeight: 1.5 }}>{hint}</span>}
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
      <div style={{ fontWeight: 700, fontSize: 'var(--fs-title)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 'var(--fs-body)', color: 'var(--ink-soft)', marginBottom: actionLabel ? 18 : 0, lineHeight: 1.6 }}>{desc}</div>
      {actionLabel && <Button variant="primary" onClick={onAction} style={{ display: 'inline-flex' }}>{actionLabel}</Button>}
    </Card>
  );
}

function SectionTitle({ icon: Icon, children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '22px 0 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 'var(--fs-base)', color: 'var(--ink)', letterSpacing: '-0.01em' }}>
        {Icon && <Icon size={15} style={{ color: 'var(--ink-soft)' }} />} {children}
      </div>
      {action && (
        <button onClick={action.onClick} style={{ background: 'none', border: 'none', color: 'var(--primary-text)', fontWeight: 700, fontSize: 'var(--fs-small)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
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
      <div style={{ fontSize: 'var(--fs-body)', color: 'var(--ink-soft)', marginLeft: 28, marginTop: 4, lineHeight: 1.4 }}>{desc}</div>
      {children}
    </div>
  );
}

function QuickAddButton({ icon: Icon, label, desc, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%',
        padding: 14, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer',
      }}
    >
      <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 'var(--radius, 10px)', background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={19} color="var(--primary-text)" />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 700, fontSize: 'var(--fs-title)' }}>{label}</span>
        <span style={{ display: 'block', fontSize: 'var(--fs-body)', color: 'var(--ink-soft)', marginTop: 2 }}>{desc}</span>
      </span>
    </button>
  );
}

// Item do popover do botão rápido: compacto (ícone + rótulo numa linha), ao
// contrário do QuickAddButton grande usado no bottom sheet do celular — um
// popover ancorado no botão precisa ser pequeno, senão vira outro modal.
function FabMenuItem({ icon: Icon, label, onClick }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        padding: '10px 12px', background: 'transparent', border: 'none',
        borderRadius: 'var(--radius-sm)', cursor: 'pointer',
        color: 'var(--text-primary)', fontSize: 'var(--fs-body)', fontWeight: 600,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <Icon size={17} style={{ color: 'var(--primary-text)', flexShrink: 0 }} />
      {label}
    </button>
  );
}

// Botão rápido do desktop: só o "+", sem texto — o rótulo por extenso só fazia
// sentido enquanto ele abria um modal genérico ("O que você quer lançar?"); um
// ícone sozinho e óbvio é o padrão de SaaS pra esse botão. As opções abrem num
// popover ancorado nele mesmo (sobe a partir do canto), não um modal no centro
// da tela — mesma lógica de abrir/fechar do menu de Cadastros no cabeçalho.
function DesktopQuickAddFab({ role, onQuickAdd }) {
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

  function selecionar(tipo) {
    setOpen(false);
    onQuickAdd(tipo);
  }

  return (
    <div ref={ref} className="lomuz-fab-wrap">
      {open && (
        <div role="menu" aria-label="O que você quer lançar" className="lomuz-fab-menu">
          {/* Vendedor só lança venda: cadastrar cliente e lançar despesa são
              bloqueados pela permissão do banco, então oferecer as opções
              daria um erro silencioso depois de preencher o formulário. */}
          <FabMenuItem icon={ArrowUpCircle} label="Venda" onClick={() => selecionar('venda')} />
          {role !== 'vendedor' && (
            <>
              <FabMenuItem icon={Users} label="Cliente" onClick={() => selecionar('cliente')} />
              <FabMenuItem icon={ArrowUpCircle} label="Receita" onClick={() => selecionar('receita')} />
              <FabMenuItem icon={ArrowDownCircle} label="Despesa" onClick={() => selecionar('despesa')} />
            </>
          )}
        </div>
      )}
      <button
        className="lomuz-fab"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Lançar cliente, venda, receita ou despesa"
        title="Novo lançamento"
      >
        <Plus size={24} strokeWidth={2.6} />
      </button>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--overlay-scrim)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--surface)', width: '100%', maxWidth: 480, borderRadius: '20px 20px 0 0', maxHeight: '88vh', overflowY: 'auto', padding: 20, animation: 'lomuzSlideUp .22s ease-out' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 className="lomuz-display" style={{ fontSize: 'var(--fs-lg)', margin: 0, fontWeight: 700 }}>{title}</h2>
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

function TransactionRow({ tx, category, last, onClick, faltas }) {
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
          {/* Cliente na receita, fornecedor/credor na despesa: o nome já era
              buscável na lista, mas não aparecia em lugar nenhum dela — a linha
              mostrava só a descrição ("Energia Elétrica"), nunca o credor
              ("Copel"). */}
          {tx.clienteNome && (
            <span title={tx.clienteNome} style={{ maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {tx.clienteNome}</span>
          )}
          {tx.dataEstimada && <span title="Venda antiga importada sem data exata registrada — usamos uma data aproximada." style={{ color: 'var(--warning-strong)', fontWeight: 700 }}>· data aproximada</span>}
          {tx.recorrente && <Repeat size={11} />}
          {status === 'pendente' && <span style={{ color: 'var(--warning-strong)', fontWeight: 700 }}>· Pendente</span>}
          {status === 'cancelado' && <span style={{ color: 'var(--negative)', fontWeight: 700 }}>· Cancelado</span>}
          {tx.status === 'pendente' && <span style={{ color: 'var(--warning-strong)', fontWeight: 700 }}>· Aguardando aprovação</span>}
          {tx.status === 'rejeitado' && <span style={{ color: 'var(--negative)', fontWeight: 700 }}>· Rejeitada</span>}
        </div>
        {/* O que falta neste lançamento, direto na linha — mesma ideia da lista
            de Clientes: ver o buraco sem precisar abrir o formulário. */}
        {faltas && faltas.length > 0 && (
          <div style={{ fontSize: 'var(--fs-small)', color: 'var(--warning-strong)', marginTop: 2, fontWeight: 600 }}>
            Falta: {faltas.map((f) => f.label).join(', ')}
          </div>
        )}
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
      <button onClick={onEdit} style={iconBtnStyle}><Edit2 size={15} /></button>
      <button onClick={onDelete} style={iconBtnStyle}><Trash2 size={15} /></button>
    </div>
  );
}

/* =========================================================================
   SELETORES DE PERÍODO
   ========================================================================= */

// Ordem cronológica: passado à esquerda, este mês pré-selecionado no meio,
// futuro à direita — assim como pedido.
const PERIOD_PRESETS_PADRAO = [
  { key: 'ultimos_3', label: 'Últimos 3 meses' },
  // O rótulo de "mes" e "ano" é montado no PeriodSelector: vira "Este mês"/
  // "Este ano" no mês/ano corrente e passa a nomear o mês/ano quando as setas
  // navegam pra outro.
  { key: 'mes', label: 'Este mês' },
  { key: 'proximos_3', label: 'Próx. 3 meses' },
  { key: 'proximos_6', label: 'Próx. 6 meses' },
  { key: 'ano', label: 'Este ano' },
  { key: 'custom', label: 'Personalizado' },
];

// Relatório olha pra trás, não pra frente: aqui os presets são de histórico
// fechado (mês passado, 12 meses, ano fechado), sem as janelas futuras que o
// painel Início usa pra projeção.
const PERIOD_PRESETS_RELATORIO = [
  { key: 'mes', label: 'Este mês' },
  { key: 'ultimos_3', label: 'Últimos 3 meses' },
  { key: 'ultimos_12', label: 'Últimos 12 meses' },
  { key: 'ano', label: 'Este ano' },
  { key: 'custom', label: 'Personalizado' },
];

// Navegação de ano no padrão que todo SaaS usa: seta, ano, seta. As setas ficam
// desabilitadas nas pontas em vez de sumirem, pra pessoa não achar que o
// controle quebrou.
function YearStepper({ ano, onChange, anoMin, anoMax }) {
  const btn = (disabled) => ({
    width: 34, height: 34, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
    background: 'var(--surface)', color: disabled ? 'var(--border)' : 'var(--ink)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    cursor: disabled ? 'default' : 'pointer',
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
      <button type="button" onClick={() => ano > anoMin && onChange(ano - 1)} disabled={ano <= anoMin} aria-label={`Ano anterior (${ano - 1})`} style={btn(ano <= anoMin)}>
        <ChevronRight size={17} style={{ transform: 'rotate(180deg)' }} />
      </button>
      <div style={{ minWidth: 86, textAlign: 'center', fontSize: 'var(--fs-title)', fontWeight: 800, letterSpacing: '-0.01em' }}>{ano}</div>
      <button type="button" onClick={() => ano < anoMax && onChange(ano + 1)} disabled={ano >= anoMax} aria-label={`Ano seguinte (${ano + 1})`} style={btn(ano >= anoMax)}>
        <ChevronRight size={17} />
      </button>
      <span style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-soft)', marginLeft: 4, lineHeight: 1.4 }}>
        01/01/{ano} a 31/12/{ano} — os 12 meses
      </span>
    </div>
  );
}

// Mesma navegação do YearStepper, um degrau abaixo: seta, mês por extenso,
// seta. offsetMin/offsetMax limitam o quanto dá pra recuar/avançar.
function MonthStepper({ mesOffset, onChange, offsetMin, offsetMax }) {
  const btn = (disabled) => ({
    width: 34, height: 34, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
    background: 'var(--surface)', color: disabled ? 'var(--border)' : 'var(--ink)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    cursor: disabled ? 'default' : 'pointer',
  });
  const mesAtual = mesAnoLabel(addMonths(new Date(), mesOffset));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
      <button type="button" onClick={() => mesOffset > offsetMin && onChange(mesOffset - 1)} disabled={mesOffset <= offsetMin} aria-label={`Mês anterior (${mesAnoLabel(addMonths(new Date(), mesOffset - 1))})`} style={btn(mesOffset <= offsetMin)}>
        <ChevronRight size={17} style={{ transform: 'rotate(180deg)' }} />
      </button>
      <div style={{ minWidth: 150, textAlign: 'center', fontSize: 'var(--fs-title)', fontWeight: 800, letterSpacing: '-0.01em' }}>{mesAtual}</div>
      <button type="button" onClick={() => mesOffset < offsetMax && onChange(mesOffset + 1)} disabled={mesOffset >= offsetMax} aria-label={`Mês seguinte (${mesAnoLabel(addMonths(new Date(), mesOffset + 1))})`} style={btn(mesOffset >= offsetMax)}>
        <ChevronRight size={17} />
      </button>
    </div>
  );
}

function PeriodSelector({ value, onChange, presets = PERIOD_PRESETS_PADRAO, anoMin, anoMax, mesOffsetMin = -120, mesOffsetMax = 60 }) {
  const anoHoje = new Date().getFullYear();
  const minAno = anoMin ?? anoHoje - 10;
  const maxAno = anoMax ?? anoHoje + 5;

  function selectPreset(key) {
    if (key === 'custom') {
      onChange({
        ...value,
        type: 'custom',
        start: value.start || toISODate(startOfMonth(addMonths(new Date(), -1))),
        end: value.end || toISODate(new Date()),
      });
    } else if (key === 'ano') {
      onChange({ ...value, type: 'ano', ano: value.ano || Math.min(anoHoje, maxAno) });
    } else if (key === 'mes') {
      onChange({ ...value, type: 'mes', mesOffset: value.mesOffset || 0 });
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
          // O botão do ano se chama "Este ano" enquanto mostra o ano corrente —
          // é o nome que a pessoa procura — e passa a dizer qual ano quando as
          // setas levam pra outro. Rótulo fixo "Por ano" fazia o usuário não
          // achar o que antes se chamava "Este ano".
          <Chip key={p.key} active={value.type === p.key} onClick={() => selectPreset(p.key)}>
            {(p.key === 'ano' && value.type === 'ano' && value.ano && value.ano !== anoHoje)
              ? `Ano de ${value.ano}`
              : (p.key === 'mes' && value.type === 'mes' && value.mesOffset)
                ? mesAnoLabel(addMonths(new Date(), value.mesOffset))
                : (p.key === 'ano' ? 'Este ano' : p.key === 'mes' ? 'Este mês' : p.label)}
          </Chip>
        ))}
      </div>
      {value.type === 'ano' && (
        <YearStepper
          ano={value.ano || anoHoje}
          onChange={(a) => onChange({ ...value, type: 'ano', ano: a })}
          anoMin={minAno}
          anoMax={maxAno}
        />
      )}
      {value.type === 'mes' && (
        <MonthStepper
          mesOffset={value.mesOffset || 0}
          onChange={(o) => onChange({ ...value, type: 'mes', mesOffset: o })}
          offsetMin={mesOffsetMin}
          offsetMax={mesOffsetMax}
        />
      )}
      {value.type === 'custom' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
          <input type="date" value={value.start} onChange={(e) => changeStart(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>até</span>
          <input type="date" value={value.end} onChange={(e) => changeEnd(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
        </div>
      )}
      <div style={{ marginTop: 10, fontSize: 'var(--fs-body)', fontWeight: 700 }}>
        Mostrando: <span style={{ color: 'var(--primary-text)' }}>{periodLabel(value)}</span>
      </div>
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
            <span style={{ display: 'block', fontSize: 'var(--fs-small)', fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>De</span>
            <input type="month" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ flex: 1, minWidth: 120 }}>
            <span style={{ display: 'block', fontSize: 'var(--fs-small)', fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>Até</span>
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
      style={{ ...inputStyle, padding: '3px 6px', fontSize: 'var(--fs-small)', width: 104 }}
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
        <div style={{ fontSize: 'var(--fs-small)', opacity: 0.7, textTransform: 'uppercase', fontWeight: 700 }}>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-small)', color: 'var(--ink-soft)', marginTop: 6, flexWrap: 'wrap', gap: 8 }}>
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
      {erro && <div style={{ color: 'var(--negative)', fontSize: 'var(--fs-body)', fontWeight: 600, marginTop: 8 }}>{erro}</div>}
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
                <span style={{ fontSize: 'var(--fs-body)', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
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

        {erro && <div style={{ color: 'var(--negative)', fontSize: 'var(--fs-body)', marginBottom: 10, fontWeight: 600 }}>{erro}</div>}
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

function TransactionForm({ draft, categories, role, vendedores, planos, fornecedores, transactions, onSubmit, onCancel, onDelete, onCancelRecurrence, onApprove, onReject }) {
  const [local, setLocal] = useState(draft);
  const [error, setError] = useState('');
  const cats = categories.filter((c) => c.tipo === local.tipo);
  // Campos de contrato só fazem sentido em venda (receita atribuída a vendedor).
  const isVenda = local.tipo === 'receita';
  const emRevisao = role === 'admin' && local.status === 'pendente';
  const planosAtivos = (planos || []).filter((p) => p.ativo !== false);
  const planoEscolhido = local.planoId ? planosAtivos.find((p) => p.id === local.planoId) : null;

  // Em despesa, o histórico do fornecedor vira sugestão de categoria e de custo
  // fixo/variável, e os avisos de boa prática aparecem antes de salvar.
  const historicoForn = useMemo(
    () => (isVenda ? null : historicoDoFornecedor(transactions || [], local.clienteNome)),
    [transactions, local.clienteNome, isVenda],
  );
  const categoriaSugerida = historicoForn?.categoriaId ? categories.find((c) => c.id === historicoForn.categoriaId) : null;
  const sugestaoAplicavel = !!categoriaSugerida
    && (local.categoriaId !== categoriaSugerida.id
      || (historicoForn.fixaSugerida != null && local.despesaFixa !== historicoForn.fixaSugerida));
  const avisos = isVenda ? [] : avisosDaDespesa(local, categories.find((c) => c.id === local.categoriaId), historicoForn);

  function aplicarSugestao() {
    setLocal((l) => ({
      ...l,
      categoriaId: categoriaSugerida.id,
      despesaFixa: historicoForn.fixaSugerida != null ? historicoForn.fixaSugerida : l.despesaFixa,
    }));
  }

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
        <Field
          label="Plano negociado"
          hint={planoEscolhido
            ? `${planoEscolhido.comissaoPercentual != null ? `Comissão do plano: ${planoEscolhido.comissaoPercentual}%.` : 'Este plano não define comissão — vale a comissão padrão do vendedor.'} Preencheu os campos abaixo — pode ajustar se precisar.`
            : 'Escolha um plano para preencher valor, categoria e duração automaticamente.'}
        >
          <select value={local.planoId || ''} onChange={(e) => escolherPlano(e.target.value)} style={inputStyle}>
            <option value="">Sem plano (preencher manualmente)</option>
            {planosAtivos.map((p) => (
              <option key={p.id} value={p.id}>{p.nome} · {formatCurrency(p.valor)}{p.comissaoPercentual != null ? ` · ${p.comissaoPercentual}%` : ''}</option>
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

      {/* Despesa: quem recebe o pagamento. Até aqui o formulário não tinha esse
          campo — as 3.420 despesas importadas do sistema antigo trouxeram o
          credor, mas uma despesa nova nascia sem ele. O datalist deixa
          escolher entre os já cadastrados sem virar um select de 180 linhas. */}
      {!isVenda && (
        <Field label="Fornecedor / credor (opcional)" hint="Nome que ainda não existe no cadastro é criado automaticamente ao salvar.">
          <input
            type="text"
            list="lomuz-fornecedores"
            value={local.clienteNome || ''}
            onChange={(e) => set('clienteNome', e.target.value)}
            placeholder="Ex.: Posto Sul Paraná"
            style={inputStyle}
          />
          <datalist id="lomuz-fornecedores">
            {(fornecedores || []).filter((f) => f.ativo !== false).map((f) => <option key={f.id} value={f.nome} />)}
          </datalist>
        </Field>
      )}

      {/* O que o histórico deste fornecedor diz. Sugestão, nunca preenchimento
          automático silencioso: quem lança precisa ver o que está aceitando. */}
      {!isVenda && historicoForn && (
        <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: 12, marginBottom: 14, marginTop: -4 }}>
          <div style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-soft)', lineHeight: 1.6 }}>
            Você já lançou <strong style={{ color: 'var(--ink)' }}>{historicoForn.lancamentos}x</strong> para este fornecedor
            {historicoForn.ultimo ? `, a última em ${formatDateBR(historicoForn.ultimo)}` : ''}.
            {categoriaSugerida && <> Costuma entrar em <strong style={{ color: 'var(--ink)' }}>{categoriaSugerida.nome}</strong>
              {historicoForn.fixaSugerida != null && <> como custo <strong style={{ color: 'var(--ink)' }}>{historicoForn.fixaSugerida ? 'fixo' : 'variável'}</strong></>}
              , com valor por volta de <strong style={{ color: 'var(--ink)' }}>{formatCurrency(historicoForn.valorTipico)}</strong>.</>}
          </div>
          {sugestaoAplicavel && (
            <Button variant="secondary" onClick={aplicarSugestao} style={{ marginTop: 10 }}>
              <Check size={14} /> Usar {categoriaSugerida.nome}{historicoForn.fixaSugerida != null ? ` e custo ${historicoForn.fixaSugerida ? 'fixo' : 'variável'}` : ''}
            </Button>
          )}
        </div>
      )}

      {/* Custo fixo x variável: as 3.420 despesas importadas já vinham
          classificadas assim e o relatório de despesas usa essa divisão, então
          despesa nova também precisa dizer qual das duas é. */}
      {!isVenda && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
          <div style={{ minWidth: 0, paddingRight: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Despesa fixa</div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Ligue para custo que se repete todo mês (aluguel, folha, internet). Desligue para gasto eventual.</div>
          </div>
          <Toggle checked={local.despesaFixa === true} onChange={(v) => set('despesaFixa', v)} />
        </div>
      )}

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

      {!local.recorrente && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{local.tipo === 'despesa' ? 'Já foi pago' : 'Já foi recebido'}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
              {local.pago ? 'Conta liquidada, não entra em vencimentos.' : 'Fica em aberto até você marcar como pago/recebido.'}
            </div>
          </div>
          <Toggle checked={local.pago} onChange={(v) => set('pago', v)} />
        </div>
      )}

      {!local.recorrente && !local.pago && (
        <Field label="Vencimento">
          <input type="date" value={local.dataVencimento || local.data} onChange={(e) => set('dataVencimento', e.target.value)} style={inputStyle} />
        </Field>
      )}

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
          hint={(planoEscolhido && planoEscolhido.comissaoPercentual != null)
            ? `Em branco = usa os ${planoEscolhido.comissaoPercentual}% do plano "${planoEscolhido.nome}".`
            : 'Em branco = usa a comissão padrão do vendedor.'}
        >
          <input
            type="number" min="0" max="100" step="0.5"
            placeholder={(planoEscolhido && planoEscolhido.comissaoPercentual != null) ? `${planoEscolhido.comissaoPercentual}% (do plano)` : 'Padrão do vendedor'}
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

      {error && <div style={{ color: 'var(--negative)', fontSize: 'var(--fs-body)', marginTop: 12, fontWeight: 600 }}>{error}</div>}

      {/* Orientação de lançamento: nada aqui bloqueia o salvamento — quem
          conhece o próprio negócio decide. Mas o erro é apontado antes de
          virar número errado no relatório, com o motivo explicado. */}
      {avisos.length > 0 && (
        <div style={{ marginTop: 6, marginBottom: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {avisos.map((a, i) => {
            const cor = a.tom === 'danger' ? 'var(--negative)' : a.tom === 'warning' ? 'var(--warning-strong)' : 'var(--primary-text)';
            const fundo = a.tom === 'danger' ? 'var(--negative-soft)' : a.tom === 'warning' ? 'var(--warning-light)' : 'var(--brand-soft)';
            return (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: fundo, borderRadius: 10, padding: '10px 12px' }}>
                <span aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
                  {a.tom === 'info' ? <Sparkles size={15} color={cor} /> : <Clock size={15} color={cor} />}
                </span>
                <span style={{ fontSize: 'var(--fs-small)', color: cor, lineHeight: 1.55, fontWeight: a.tom === 'info' ? 600 : 700 }}>{a.texto}</span>
              </div>
            );
          })}
        </div>
      )}

      {emRevisao ? (
        <>
          <Card style={{ marginTop: 16, borderColor: 'var(--warning)', background: 'var(--warning-light)' }}>
            <p style={{ margin: 0, fontSize: 'var(--fs-body)', lineHeight: 1.5, color: 'var(--warning-strong)' }}>
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
            style={{ width: '100%', marginTop: 10, background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 'var(--fs-body)', fontWeight: 700, cursor: 'pointer', padding: 8 }}
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
          style={{ width: '100%', marginTop: 4, background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 'var(--fs-body)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8 }}
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

function CancelRecurrenceStep({ onBack, onConfirm }) {
  const [dataCancelamento, setDataCancelamento] = useState(toISODate(new Date()));
  const [error, setError] = useState('');

  function confirm() {
    if (!dataCancelamento) { setError('Informe a data de desativação.'); return; }
    onConfirm(dataCancelamento);
  }

  return (
    <div>
      <Card style={{ marginBottom: 20 }}>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
          Os lançamentos futuros dessa recorrência param, mas o histórico continua no seu painel. Se o cliente já tinha parado antes de hoje, informe a data real (ou estimada) em que isso aconteceu, para que os relatórios de desempenho e o gráfico de cancelamentos por mês fiquem corretos.
        </p>
      </Card>
      <Field label="Data estimada de desativação">
        <input
          type="date"
          value={dataCancelamento}
          onChange={(e) => { setDataCancelamento(e.target.value); setError(''); }}
          style={inputStyle}
        />
      </Field>
      {error && <div style={{ color: 'var(--negative)', fontSize: 'var(--fs-body)', marginTop: 4, fontWeight: 600 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <Button variant="secondary" onClick={onBack} style={{ flex: 1 }}>Voltar</Button>
        <Button variant="primary" onClick={confirm} style={{ flex: 2 }}>Confirmar cancelamento</Button>
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
      {error && <div style={{ color: 'var(--negative)', fontSize: 'var(--fs-body)', marginBottom: 10, fontWeight: 600 }}>{error}</div>}
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
  // 20% é o padrão da empresa pra vendedor novo — continua editável campo a
  // campo, é só o valor de partida.
  const [comissao, setComissao] = useState(vendedor?.comissaoPercentual ?? 20);
  const [meta, setMeta] = useState(vendedor?.metaPadrao ?? 10000);
  const [ativo, setAtivo] = useState(vendedor?.ativo !== false);
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
      ativo,
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
        <Field label="E-mail para convite" hint="A pessoa deve criar a conta no app usando exatamente este e-mail. Deixe em branco pra cadastrar alguém sem login (ex.: histórico antigo).">
          <input type="email" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@email.com" />
        </Field>
      )}
      <Field label="Comissão (%)"><input type="number" min="0" max="100" step="0.5" style={inputStyle} value={comissao} onChange={(e) => setComissao(e.target.value)} /></Field>
      <Field label="Meta mensal padrão" hint="Você pode ajustar mês a mês depois, na tela de Previsão.">
        <CurrencyInput value={meta} onChange={setMeta} style={inputStyle} />
      </Field>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Ativo</div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Inativo mantém o histórico de vendas, mas sai do ranking visível entre vendedores e da lista de convites.</div>
        </div>
        <Toggle checked={ativo} onChange={setAtivo} />
      </div>
      {error && <div style={{ color: 'var(--negative)', fontSize: 'var(--fs-body)', marginBottom: 10, fontWeight: 600 }}>{error}</div>}
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

// Cartões do topo que abrem a lista dos lançamentos por trás do número.
// Resultado entra junto: quem clica nele quer ver de onde veio o saldo, e a
// lista dos dois lados é o que explica isso.
const FOCOS_COM_LISTA = ['receitas', 'despesas', 'resultado'];

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
  const [resumoMode, setResumoMode] = useState('total');
  const [rankingCompleto, setRankingCompleto] = useState(false);
  const [listaFocoLimite, setListaFocoLimite] = useState(40);
  function toggleFocus(key) {
    setFocusMetric((cur) => (cur === key ? null : key));
    setListaFocoLimite(40);
  }

  // Escolher um ano é pedir os 12 meses: a tabela mês a mês abre junto, sem
  // exigir um segundo clique. Nos outros períodos o padrão continua sendo o
  // total, que é o que interessa num recorte curto.
  useEffect(() => {
    if (period.type === 'ano') setResumoMode('mensal');
  }, [period.type, period.ano]);

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

  // Meses reais do período escolhido — base da tabela "ver mês a mês" e da
  // janela do gráfico.
  const mesesPeriodo = buildPeriodMonthlyRows(txs, range);
  const periodoMultiMes = mesesPeriodo.length > 1;
  const incluiFuturo = range.end > endOfMonth(new Date());

  // A janela do gráfico sai do próprio período escolhido, sempre — back e
  // forward são distâncias em meses até o mês atual e podem ser negativas
  // quando o período todo está no passado. Um período de um único mês vira um
  // gráfico de um ponto só: antes o gráfico teimava em mostrar 6 meses fixos
  // mesmo com "Este mês" selecionado, o que contradizia o período escolhido no
  // seletor logo acima — o número da tela e o gráfico da tela precisam bater.
  const chartWindow = { back: 1 - monthsDiff(new Date(), range.start), forward: monthsDiff(new Date(), range.end) };
  const cashFlowRows = buildCashFlowRows(txs, chartWindow.back, chartWindow.forward);
  const resultadoRows = buildCompanyEvolution(txs, chartWindow.back, chartWindow.forward);

  // Lista de lançamentos por trás do número do cartão clicado — só os que têm
  // ocorrência dentro do período escolhido, sem misturar com período anterior
  // nem com projeção fora do intervalo. Contrato recorrente entra uma vez, com
  // o valor já multiplicado pelas cobranças que caem no período (mesma conta
  // que soma o cartão), e a etiqueta "×N" avisa quando não é uma cobrança só.
  const linhasFocoPeriodo = useMemo(() => {
    if (!FOCOS_COM_LISTA.includes(focusMetric)) return [];
    // Resultado é receita menos despesa, então a lista dele mostra os dois
    // lados — é o único jeito de o total da lista fechar com o cartão.
    const tipos = focusMetric === 'resultado'
      ? ['receita', 'despesa']
      : [focusMetric === 'receitas' ? 'receita' : 'despesa'];
    return txs
      .filter((t) => tipos.includes(t.tipo))
      .map((t) => {
        const ocorrencias = expandOccurrences(t, range.start, range.end).length;
        return ocorrencias > 0 ? { tx: t, ocorrencias, valorNoPeriodo: round2(t.valor * ocorrencias) } : null;
      })
      .filter(Boolean)
      .sort((a, b) => (b.tx.data || '').localeCompare(a.tx.data || ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs, focusMetric, range.start, range.end]);

  const rotuloFoco = { receitas: 'receita', despesas: 'despesa', resultado: 'receita e despesa' }[focusMetric];
  const totalFoco = focusMetric === 'receitas' ? receitas.total : focusMetric === 'despesas' ? despesas.total : saldo;

  // Ranking de produtos/serviços do período (por categoria de receita), do mais
  // vendido ao menos vendido. Ordena por valor faturado, não por quantidade.
  const topProdutos = Object.entries(receitas.byCategory)
    .map(([catId, val]) => {
      const c = data.categories.find((cc) => cc.id === catId);
      return { id: catId, nome: c?.nome || 'Outros', valor: val, ticket: receitas.countByCategory?.[catId] ? round2(val / receitas.countByCategory[catId]) : null };
    })
    .sort((a, b) => b.valor - a.valor);

  // Contas a pagar/receber em aberto — só lançamentos pontuais marcados como
  // "não pago ainda", com vencimento. Recorrente não entra aqui (ver
  // buildProximosVencimentos).
  const hojeISO = toISODate(new Date());
  const emAberto = txs.filter((t) => !t.recorrente && t.pago === false && t.dataVencimento);
  const pagarHoje = emAberto.filter((t) => t.tipo === 'despesa' && t.dataVencimento === hojeISO);
  const pagarAtraso = emAberto.filter((t) => t.tipo === 'despesa' && t.dataVencimento < hojeISO);
  const receberAtraso = emAberto.filter((t) => t.tipo === 'receita' && t.dataVencimento < hojeISO);
  const somaPagarHoje = round2(pagarHoje.reduce((s, t) => s + t.valor, 0));
  const somaPagarAtraso = round2(pagarAtraso.reduce((s, t) => s + t.valor, 0));
  const somaReceberAtraso = round2(receberAtraso.reduce((s, t) => s + t.valor, 0));

  const pendentes = txs.filter((t) => t.recorrente && getRecurrenceStatus(t) === 'pendente');
  // Vendas lançadas por vendedores esperando o admin revisar e aprovar.
  const aguardandoRevisao = role === 'admin' ? data.transactions.filter((t) => t.status === 'pendente') : [];
  // Tudo que exige uma ação vai junto num bloco no topo, separado dos números
  // informativos — antes ficava espalhado com uma grade de cartões no meio.
  const temContasEmAlerta = somaPagarHoje > 0 || somaPagarAtraso > 0 || somaReceberAtraso > 0;
  const temAtencao = aguardandoRevisao.length > 0 || pendentes.length > 0 || temContasEmAlerta;
  const widgets = { ...DEFAULT_DASHBOARD_WIDGETS, ...(data.uiPrefs?.dashboardWidgets || {}) };

  const pieData = Object.entries(despesas.byCategory)
    .map(([catId, val]) => {
      const c = data.categories.find((cc) => cc.id === catId);
      return { name: c?.nome || 'Outros', value: val, color: c?.cor || '#7A6A58' };
    })
    .sort((a, b) => b.value - a.value);

  // Ticket médio por produto: mesmo conjunto do ranking, mas ordenado pelo
  // ticket em vez do faturamento total — produto caro de baixo volume sobe.
  const ticketPorProduto = topProdutos.filter((p) => p.ticket != null).sort((a, b) => b.ticket - a.ticket);

  // Visão geral da empresa (somente admin): evolução, crescimento, cancelamentos e ranking.
  const evolution = buildCompanyEvolution(txs, 6);
  const lastM = evolution[evolution.length - 1];
  const prevM = evolution[evolution.length - 2];
  const growthPct = (prevM && prevM.receita > 0) ? round2(((lastM.receita - prevM.receita) / prevM.receita) * 100) : null;
  const cancelamentos = buildCancelamentosPorMes(txs, 6);
  const totalCancelamentos6m = cancelamentos.reduce((s, c) => s + c.count, 0);
  // Só vendedores ativos entram no ranking — os inativos do cadastro são
  // ex-funcionários e colaboradores de outras funções, não vendedores.
  const ranking = buildVendedorRanking(txs, data.vendedores.filter((v) => v.ativo !== false), range.start, range.end, data.planos);
  const nenhumWidgetAtivo = role === 'admin' && !widgets.categorias && !widgets.ticketMedio && !widgets.receitaDespesa && !widgets.rankingVendedores && !widgets.cancelamentos;

  // Ranking visível pro próprio vendedor: só nome, comissão e vendas de quem
  // está ATIVO, vindo das views seguras (nunca a tabela transactions inteira).
  const rankingPublico = data.rankingPublico || { vendedores: [], transacoes: [] };
  const rankingEquipe = role !== 'admin'
    ? buildVendedorRanking(rankingPublico.transacoes, rankingPublico.vendedores, range.start, range.end, data.planos)
    : [];

  // "Precisa da sua atenção" virou um aviso compacto, não a primeira coisa da
  // tela: na hierarquia de uma leitura financeira, o resultado do período vem
  // antes de qualquer pendência operacional (é assim que se lê um DRE — o
  // número primeiro, os avisos depois). O bloco também ficou mais discreto —
  // uma linha por pendência num único cartão, em vez de vários cartões grandes
  // e coloridos competindo com os números principais.
  const blocoAtencao = temAtencao && (
    <Card style={{ borderColor: 'var(--warning)', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-small)', fontWeight: 700, color: 'var(--warning-strong)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>
        <Clock size={14} /> Pendências
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {aguardandoRevisao.slice(0, 5).map((t) => {
          const vend = data.vendedores.find((v) => v.id === t.vendedorId);
          return (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--fs-small)', color: 'var(--ink)', gap: 8 }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Venda aguardando revisão · {vend?.nome || 'Vendedor'} · {t.clienteNome || 'sem cliente'} · {formatCurrency(t.valor)}
              </span>
              <button onClick={() => onReviewSale(t)} style={{ background: 'none', border: 'none', color: 'var(--primary-text)', fontWeight: 700, fontSize: 'var(--fs-small)', cursor: 'pointer', textDecoration: 'underline', flexShrink: 0 }}>
                Revisar
              </button>
            </div>
          );
        })}
        {pendentes.slice(0, 4).map((t) => {
          const c = data.categories.find((cc) => cc.id === t.categoriaId);
          return (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--fs-small)', color: 'var(--ink)', gap: 8 }}>
              <span>Aguardando ativação · {c?.nome} · {formatCurrency(t.valor)} · ativa em {daysUntil(t.dataAtivacao)} dia(s)</span>
              {/* Só admin ativa antes do prazo — muitos produtos têm período de
                  teste e o vendedor não deve poder pular essa validação. */}
              {role === 'admin' && (
                <button onClick={() => onActivateNow(t)} style={{ background: 'none', border: 'none', color: 'var(--primary-text)', fontWeight: 700, fontSize: 'var(--fs-small)', cursor: 'pointer', textDecoration: 'underline', flexShrink: 0 }}>
                  Ativar agora
                </button>
              )}
            </div>
          );
        })}
        {somaPagarHoje > 0 && (
          <div style={{ fontSize: 'var(--fs-small)', color: 'var(--ink)' }}>Vence hoje (a pagar) · {formatCurrency(somaPagarHoje)} · {pagarHoje.length} conta(s)</div>
        )}
        {somaPagarAtraso > 0 && (
          <div style={{ fontSize: 'var(--fs-small)', color: 'var(--negative)', fontWeight: 700 }}>Em atraso — a pagar · {formatCurrency(somaPagarAtraso)} · {pagarAtraso.length} conta(s)</div>
        )}
        {somaReceberAtraso > 0 && (
          <div style={{ fontSize: 'var(--fs-small)', color: 'var(--negative)', fontWeight: 700 }}>Em atraso — a receber · {formatCurrency(somaReceberAtraso)} · {receberAtraso.length} conta(s)</div>
        )}
      </div>
    </Card>
  );

  return (
    <div style={{ paddingTop: 12 }}>
      <SectionTitle icon={TrendingUp}>Resumo do período</SectionTitle>
      <PeriodSelector value={period} onChange={setPeriod} />

      <div className="lomuz-kpi-grid" style={{ marginTop: 14 }}>
        <StatCard
          title="Receitas do período"
          value={formatCurrency(receitas.total)}
          icon={ArrowUpCircle}
          tone="success"
          trendPct={varReceitas}
          trendLabel="vs período anterior"
          goodWhenUp
          hint="Soma das receitas aprovadas dentro do período escolhido, incluindo as ocorrências de lançamentos recorrentes. Toque para ver a lista de lançamentos."
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
          hint="Soma das despesas aprovadas dentro do período escolhido, incluindo as ocorrências de lançamentos recorrentes. Toque para ver a lista de lançamentos."
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
      </div>

      {periodoMultiMes && (
        <>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <Chip active={resumoMode === 'total'} onClick={() => setResumoMode('total')}>Total do período</Chip>
            <Chip active={resumoMode === 'mensal'} onClick={() => setResumoMode('mensal')}>Ver mês a mês</Chip>
          </div>
          {resumoMode === 'mensal' && (
            <Card style={{ padding: 0, marginTop: 10 }}>
              <div className="lomuz-table-wrap">
                <table className="lomuz-table">
                  <caption className="lomuz-sr-only">
                    Receitas, despesas e resultado de cada mês do período {periodLabel(period)}.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Mês</th>
                      <th scope="col" style={{ textAlign: 'right' }}>Receitas</th>
                      <th scope="col" style={{ textAlign: 'right' }}>Despesas</th>
                      <th scope="col" style={{ textAlign: 'right' }}>Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Mês que ainda não chegou vem marcado como previsto: num
                        período tipo "Este ano" as duas coisas convivem na mesma
                        tabela (o que já aconteceu e a projeção dos contratos até
                        dezembro), e sem a marca não dá pra saber onde uma acaba
                        e a outra começa. O mês corrente não é previsão — ele já
                        está acontecendo. */}
                    {mesesPeriodo.map((m) => {
                      const futuro = m.key > monthKey(new Date());
                      return (
                        <tr key={m.key}>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {m.label}
                            {futuro && (
                              <span style={{ marginLeft: 6, fontSize: 'var(--fs-micro)', fontWeight: 700, color: 'var(--ink-soft)', background: 'var(--surface-2)', borderRadius: 999, padding: '2px 7px' }}>previsto</span>
                            )}
                          </td>
                          <td className="lomuz-num" style={{ textAlign: 'right', color: 'var(--success)', whiteSpace: 'nowrap', opacity: futuro ? 0.75 : 1 }}>{formatCurrency(m.receitas)}</td>
                          <td className="lomuz-num" style={{ textAlign: 'right', color: 'var(--danger)', whiteSpace: 'nowrap', opacity: futuro ? 0.75 : 1 }}>{formatCurrency(m.despesas)}</td>
                          <td className="lomuz-num" style={{ textAlign: 'right', fontWeight: 700, color: m.saldo >= 0 ? 'var(--primary-text)' : 'var(--danger)', whiteSpace: 'nowrap', opacity: futuro ? 0.75 : 1 }}>{formatCurrency(m.saldo)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Total do período</td>
                      <td className="lomuz-num" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success)', whiteSpace: 'nowrap' }}>{formatCurrency(receitas.total)}</td>
                      <td className="lomuz-num" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--danger)', whiteSpace: 'nowrap' }}>{formatCurrency(despesas.total)}</td>
                      <td className="lomuz-num" style={{ textAlign: 'right', fontWeight: 700, color: saldo >= 0 ? 'var(--primary-text)' : 'var(--danger)', whiteSpace: 'nowrap' }}>{formatCurrency(saldo)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {incluiFuturo && (
                <p style={{ margin: 0, padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: 'var(--fs-small)', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                  Os meses marcados como <strong>previsto</strong> ainda não aconteceram: o valor é a projeção dos contratos recorrentes já cadastrados, seguindo até o fim do período escolhido.
                </p>
              )}
            </Card>
          )}
        </>
      )}

      {/* Lista por trás do cartão clicado: abre ao tocar em Receitas ou
          Despesas, some ao tocar de novo — "recolhível" pede um controle
          explícito de abrir/fechar, não só cor de destaque no cartão. Só os
          lançamentos com ocorrência no período escolhido, nada de período
          anterior nem projeção fora do intervalo. */}
      {FOCOS_COM_LISTA.includes(focusMetric) && (
        <Card style={{ padding: 0, marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {linhasFocoPeriodo.length} lançamento(s) de {rotuloFoco} · {periodLabel(period)}
            </div>
            <button
              onClick={() => toggleFocus(focusMetric)}
              aria-expanded="true"
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--primary-text)', fontWeight: 700, fontSize: 'var(--fs-small)', cursor: 'pointer', flexShrink: 0 }}
            >
              Recolher <ChevronRight size={14} style={{ transform: 'rotate(-90deg)' }} />
            </button>
          </div>

          {/* O total abre a lista em vez de fechá-la: é o número que a pessoa
              veio conferir, e com 40+ linhas ele sumia lá embaixo. */}
          {linhasFocoPeriodo.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', fontWeight: 700, fontSize: 14 }}>
              <span>Total do período</span>
              <span style={{ color: focusMetric === 'receitas' ? 'var(--positive)' : focusMetric === 'despesas' ? 'var(--negative)' : totalFoco >= 0 ? 'var(--primary-text)' : 'var(--negative)' }}>
                {formatCurrency(totalFoco)}
              </span>
            </div>
          )}

          {linhasFocoPeriodo.length === 0 ? (
            <div style={{ padding: 16, fontSize: 'var(--fs-body)', color: 'var(--ink-soft)' }}>Nada neste período.</div>
          ) : (
            <>
              {linhasFocoPeriodo.slice(0, listaFocoLimite).map(({ tx, ocorrencias, valorNoPeriodo }, i, arr) => {
                const cat = data.categories.find((c) => c.id === tx.categoriaId);
                return (
                  <div
                    key={tx.id}
                    onClick={() => onReviewSale(tx)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: i === arr.length - 1 && arr.length <= listaFocoLimite ? 'none' : '1px solid var(--border)', cursor: 'pointer' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tx.clienteNome || tx.descricao || cat?.nome || 'Sem descrição'}
                      </div>
                      <div style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                        {tx.recorrente ? (
                          // Contrato recorrente mostra a data de início, não a
                          // da cobrança do período — sem o rótulo, "10/01/2026"
                          // ao lado de uma cobrança de julho pareceria erro.
                          <><Repeat size={11} /> Contrato desde {formatDateBR(tx.data)}</>
                        ) : formatDateBR(tx.data)}
                        {cat ? ` · ${cat.nome}` : ''}{ocorrencias > 1 ? ` · ${ocorrencias}x no período` : ''}
                      </div>
                    </div>
                    {/* Na lista do Resultado a cor vem do próprio lançamento,
                        não do cartão — receita e despesa convivem ali. */}
                    <div style={{ fontWeight: 700, fontSize: 14, color: tx.tipo === 'receita' ? 'var(--positive)' : 'var(--negative)', whiteSpace: 'nowrap' }}>
                      {tx.tipo === 'receita' ? '' : '− '}{formatCurrency(valorNoPeriodo)}
                    </div>
                  </div>
                );
              })}
              {linhasFocoPeriodo.length > listaFocoLimite && (
                <button
                  onClick={() => setListaFocoLimite((n) => n + 40)}
                  style={{ width: '100%', padding: 12, background: 'none', border: 'none', borderTop: '1px solid var(--border)', color: 'var(--primary-text)', fontWeight: 700, fontSize: 'var(--fs-small)', cursor: 'pointer' }}
                >
                  Mostrar mais {Math.min(40, linhasFocoPeriodo.length - listaFocoLimite)} de {linhasFocoPeriodo.length - listaFocoLimite} restantes
                </button>
              )}
            </>
          )}
        </Card>
      )}

      <SectionTitle icon={Receipt}>Detalhes e movimentação</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <CashFlowChart
          rows={focusMetric === 'resultado' ? resultadoRows : cashFlowRows}
          mode={focusMetric === 'resultado' ? 'resultado' : 'fluxo'}
          emphasize={focusMetric === 'receitas' ? 'entradas' : focusMetric === 'despesas' ? 'saidas' : null}
          title={`${focusMetric === 'resultado' ? 'Evolução do resultado mensal'
            : focusMetric === 'receitas' ? 'Fluxo de caixa — receitas em destaque'
              : focusMetric === 'despesas' ? 'Fluxo de caixa — despesas em destaque'
                : 'Fluxo de caixa'} · ${periodLabel(period)}`}
        />

        {blocoAtencao}

        <Panel
          title={`Ranking de produtos — ${periodLabel(period)}`}
          action={topProdutos.length > 10 ? (
            <PanelLink onClick={() => setRankingCompleto((v) => !v)}>
              {rankingCompleto ? 'Ver menos' : `Ver todos (${topProdutos.length})`}
            </PanelLink>
          ) : null}
        >
          {topProdutos.length === 0 ? (
            <div style={{ padding: '10px 4px' }}>
              <EmptyBlock icon={Tag} title="Nenhuma receita categorizada" desc="Quando houver vendas aprovadas com categoria neste período, o ranking aparece aqui." />
            </div>
          ) : (
            <>
              <p style={{ margin: 0, padding: '12px 16px 4px', fontSize: 'var(--fs-small)', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                Do mais vendido ao menos vendido, pelo valor faturado no período — inclui as parcelas de contratos recorrentes. O ticket médio é esse valor dividido pelo número de cobranças.
                {incluiFuturo ? ' Este período inclui meses que ainda não aconteceram: esses valores são projeção.' : ''}
              </p>
              <div style={{ padding: '4px 4px 6px' }}>
                {(rankingCompleto ? topProdutos : topProdutos.slice(0, 10)).map((p, i, arr) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--border)' }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: i === 0 ? 'var(--warning-light)' : 'var(--surface-2)', color: i === 0 ? 'var(--warning-strong)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div>
                      <div style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-soft)' }}>
                        {p.ticket != null ? `Ticket médio ${formatCurrency(p.ticket)}` : 'Ticket médio indisponível'}
                        {receitas.total > 0 ? ` · ${Math.round((p.valor / receitas.total) * 100)}% do faturamento` : ''}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--success)', whiteSpace: 'nowrap' }}>{formatCurrency(p.valor)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>
      </div>

      <MuralCard orientacoes={data.orientacoes} role={role} onEdit={onEditMural} />

      {role !== 'admin' && (
        <>
          <SectionTitle icon={Users}>Ranking de vendas da equipe</SectionTitle>
          {rankingEquipe.length === 0 ? (
            <Card><p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>Nenhum vendedor ativo com vendas no período.</p></Card>
          ) : (
            <Card style={{ padding: 0 }}>
              {rankingEquipe.map((r, i) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i === rankingEquipe.length - 1 ? 'none' : '1px solid var(--border)', background: r.id === currentVendedorId ? 'var(--surface-2)' : 'transparent' }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: i === 0 ? 'var(--gold-soft)' : 'var(--surface-2)', color: i === 0 ? 'var(--warning-strong)' : 'var(--ink-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.nome}{r.id === currentVendedorId ? ' (você)' : ''}</div>
                    <div style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-soft)' }}>Comissão {formatCurrency(r.comissao)}</div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--positive)', whiteSpace: 'nowrap' }}>{formatCurrency(r.vendas)}</div>
                </div>
              ))}
            </Card>
          )}
        </>
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
                  <SectionTitle icon={Receipt}>Ticket médio por produto</SectionTitle>
                  {ticketPorProduto.length === 0 ? (
                    <Card><p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>Nenhuma receita categorizada neste período.</p></Card>
                  ) : (
                    <Card style={{ padding: 0 }}>
                      <p style={{ margin: 0, padding: '12px 16px 4px', fontSize: 'var(--fs-small)', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                        Valor faturado dividido pelo número de cobranças de cada produto no período, do maior ticket para o menor.
                      </p>
                      {ticketPorProduto.map((p, i) => (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: i === ticketPorProduto.length - 1 ? 'none' : '1px solid var(--border)' }}>
                          <div style={{ width: 26, height: 26, borderRadius: '50%', background: i === 0 ? 'var(--warning-light)' : 'var(--surface-2)', color: i === 0 ? 'var(--warning-strong)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                            {i + 1}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div>
                            <div style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-soft)' }}>
                              {receitas.countByCategory[p.id]} cobrança(s) · {formatCurrency(p.valor)} no total
                            </div>
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--positive)', whiteSpace: 'nowrap' }}>{formatCurrency(p.ticket)}</div>
                        </div>
                      ))}
                    </Card>
                  )}
                </>
              )}

              {widgets.receitaDespesa && (
                <>
                  <SectionTitle icon={TrendingUp}>Evolução da empresa</SectionTitle>
                  <Card>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontSize: 'var(--fs-small)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--ink-soft)' }}>Receita x despesa · 6 meses</div>
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
                            <div style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-soft)' }}>Comissão {formatCurrency(r.comissao)}</div>
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
   PÁGINAS: RECEITAS E DESPESAS

   Uma página só, parametrizada pelo tipo. Antes era um "Lançamentos" com filtro
   de tipo no topo — mas quem abre a tela já sabe se quer ver o que entrou ou o
   que saiu, e cada lado pede filtros diferentes: receita tem contrato e
   vendedor, despesa tem fornecedor, conta em aberto e custo fixo.
   ========================================================================= */

const MOVIMENTOS_POR_PAGINA = 60;

// O que falta num lançamento pra ele funcionar direito. Mesma ideia da lista de
// clientes: só entra aqui o que de fato desliga alguma função do app, com o
// motivo escrito — não é cobrança de perfeccionismo.
const FALTAS_RECEITA = [
  { key: 'cliente', label: 'cliente', titulo: 'Sem cliente', porque: 'não dá pra saber de quem é a receita nem cruzar com o cadastro', falta: (t) => !(t.clienteNome || '').trim() },
  { key: 'categoria', label: 'categoria', titulo: 'Sem categoria', porque: 'fica fora do relatório de receita por produto', falta: (t) => !t.categoriaId },
  { key: 'vendedor', label: 'vendedor', titulo: 'Sem vendedor', porque: 'nenhuma comissão é calculada para a venda', falta: (t) => !t.vendedorId },
  { key: 'valor', label: 'valor conferido', titulo: 'Valor zerado ou de centavos', porque: 'costuma ser erro de digitação — vale conferir antes que siga cobrando errado', falta: (t) => (t.valor || 0) <= 1 },
];
const FALTAS_DESPESA = [
  { key: 'fornecedor', label: 'fornecedor', titulo: 'Sem fornecedor', porque: 'não entra na conta de quanto você paga para cada um', falta: (t) => !(t.clienteNome || '').trim() },
  { key: 'categoria', label: 'categoria', titulo: 'Sem categoria', porque: 'não responde "para onde meu dinheiro foi" em nenhum relatório', falta: (t) => !t.categoriaId },
  { key: 'custo', label: 'custo fixo ou variável', titulo: 'Sem custo fixo ou variável', porque: 'o relatório de custo fixo x variável ignora esses lançamentos', falta: (t) => t.despesaFixa == null },
  { key: 'vencimento', label: 'vencimento', titulo: 'Em aberto sem data de vencimento', porque: 'não aparece no aviso de contas a pagar nem em Vencimentos', falta: (t) => t.pago === false && !t.dataVencimento },
  { key: 'valor', label: 'valor conferido', titulo: 'Valor zerado ou de centavos', porque: 'pode ser erro de digitação — resto de arredondamento de comissão também cai aqui e pode ser normal', falta: (t) => (t.valor || 0) <= 1 },
];

const MOV_PERIODOS = [
  { key: 'todos', label: 'Todo o período' },
  { key: 'mes_atual', label: 'Este mês' },
  { key: 'mes_passado', label: 'Mês passado' },
  { key: 'ultimos_3', label: 'Últimos 3 meses' },
  { key: 'ultimos_12', label: 'Últimos 12 meses' },
  { key: 'ano_atual', label: 'Este ano' },
  { key: 'ano_passado', label: 'Ano passado' },
];

const MOV_ORDENS = [
  { key: 'recente', label: 'Mais recente' },
  { key: 'antiga', label: 'Mais antiga' },
  { key: 'maior', label: 'Maior valor' },
  { key: 'menor', label: 'Menor valor' },
];

function MovimentosPage({ data, role, currentVendedorId, tipo, onEdit, onImportClick, onNovo }) {
  const ehReceita = tipo === 'receita';
  const [busca, setBusca] = useState('');
  const [filterPeriodo, setFilterPeriodo] = useState('todos');
  const [filterCat, setFilterCat] = useState('todas');
  const [ordem, setOrdem] = useState('recente');
  const [limite, setLimite] = useState(MOVIMENTOS_POR_PAGINA);
  const [totalsMode, setTotalsMode] = useState('geral');
  // Filtros que existem só de um lado.
  const [filterRecorrencia, setFilterRecorrencia] = useState('todos');
  const [filterContrato, setFilterContrato] = useState('todos');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [filterVendedor, setFilterVendedor] = useState('todos');
  const [filterPagamento, setFilterPagamento] = useState('todos');
  const [filterCusto, setFilterCusto] = useState('todos');
  const [filterFornecedor, setFilterFornecedor] = useState('todos');
  const [filterFalta, setFilterFalta] = useState('todos');

  const categorias = data.categories.filter((c) => c.tipo === tipo);
  const fornecedores = data.fornecedores || [];
  const vendedores = data.vendedores || [];

  const todas = scopedTransactions(data, role, currentVendedorId).filter((t) => t.tipo === tipo);
  const termo = busca.trim().toLowerCase();

  const FALTAS = ehReceita ? FALTAS_RECEITA : FALTAS_DESPESA;
  const faltasPorLancamento = useMemo(() => {
    const m = new Map();
    todas.forEach((t) => { const f = FALTAS.filter((x) => x.falta(t)); if (f.length) m.set(t.id, f); });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todas, ehReceita]);
  const resumoFaltas = FALTAS.map((f) => ({ ...f, quantos: todas.filter((t) => f.falta(t)).length })).filter((f) => f.quantos > 0);
  const totalIncompletos = faltasPorLancamento.size;

  let list = todas.filter((t) => {
    if (filterCat !== 'todas' && t.categoriaId !== filterCat) return false;
    if (filterPeriodo !== 'todos') {
      // Vendas antigas com data estimada (importação sem data real) só aparecem
      // em "Todo o período": filtrar por um mês com uma data que não é real
      // daria um resultado enganoso.
      if (t.dataEstimada) return false;
      const r = getPeriodRange({ type: filterPeriodo });
      const d = parseISODate(t.data);
      if (d < r.start || d > r.end) return false;
    }
    if (ehReceita) {
      if (filterRecorrencia === 'recorrentes' && !t.recorrente) return false;
      if (filterRecorrencia === 'unicas' && t.recorrente) return false;
      if (filterContrato !== 'todos') {
        if (!t.recorrente) return false;
        if (getRecurrenceStatus(t) !== filterContrato) return false;
      }
      if (filterStatus !== 'todos' && (t.status || 'aprovado') !== filterStatus) return false;
      if (filterVendedor === 'sem' && t.vendedorId) return false;
      if (filterVendedor !== 'todos' && filterVendedor !== 'sem' && t.vendedorId !== filterVendedor) return false;
    } else {
      if (filterPagamento === 'pagas' && t.pago === false) return false;
      if (filterPagamento === 'abertas' && t.pago !== false) return false;
      if (filterCusto === 'fixa' && t.despesaFixa !== true) return false;
      if (filterCusto === 'variavel' && t.despesaFixa !== false) return false;
      if (filterCusto === 'nao_classificada' && t.despesaFixa != null) return false;
      if (filterFornecedor === 'sem' && t.fornecedorId) return false;
      if (filterFornecedor !== 'todos' && filterFornecedor !== 'sem' && t.fornecedorId !== filterFornecedor) return false;
    }
    if (filterFalta === 'incompletos' && !faltasPorLancamento.has(t.id)) return false;
    if (filterFalta !== 'todos' && filterFalta !== 'incompletos') {
      const f = FALTAS.find((x) => x.key === filterFalta);
      if (f && !f.falta(t)) return false;
    }
    if (termo) {
      const cat = data.categories.find((c) => c.id === t.categoriaId);
      const alvo = `${t.descricao || ''} ${t.clienteNome || ''} ${cat?.nome || ''}`.toLowerCase();
      if (!alvo.includes(termo)) return false;
    }
    return true;
  });

  list = [...list].sort((a, b) => {
    if (ordem === 'antiga') return (a.data || '').localeCompare(b.data || '');
    if (ordem === 'maior') return b.valor - a.valor;
    if (ordem === 'menor') return a.valor - b.valor;
    return (b.data || '').localeCompare(a.data || '');
  });
  const visiveis = list.slice(0, limite);

  const total = round2(list.reduce((s, t) => s + t.valor, 0));
  const media = list.length > 0 ? round2(total / list.length) : 0;
  const emAberto = ehReceita ? 0 : round2(list.filter((t) => t.pago === false).reduce((s, t) => s + t.valor, 0));
  const filtrando = list.length !== todas.length;

  const porMes = {};
  list.forEach((t) => {
    const key = (t.data || '').slice(0, 7);
    if (!porMes[key]) porMes[key] = { valor: 0, qtd: 0 };
    porMes[key].valor += t.valor;
    porMes[key].qtd += 1;
  });
  const mensalRows = Object.entries(porMes)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, v]) => ({ key, label: mesAnoLabel(parseISODate(`${key}-01`)), valor: round2(v.valor), qtd: v.qtd }));

  useEffect(() => { setLimite(MOVIMENTOS_POR_PAGINA); }, [busca, filterPeriodo, filterCat, ordem, filterRecorrencia, filterContrato, filterStatus, filterVendedor, filterPagamento, filterCusto, filterFornecedor, filterFalta]);

  const nomeCategoria = (id) => data.categories.find((c) => c.id === id)?.nome || '';
  function baixar() {
    baixarCSV(`${ehReceita ? 'receitas' : 'despesas'}_${toISODate(new Date())}.csv`, list.map((t) => ({
      Data: formatDateBR(t.data),
      [ehReceita ? 'Cliente' : 'Fornecedor']: t.clienteNome || '',
      'Descrição': t.descricao || '',
      Categoria: nomeCategoria(t.categoriaId),
      Valor: numeroCSV(t.valor),
      ...(ehReceita
        ? {
          'Cobrança': t.recorrente ? `recorrente (${t.frequencia || 'mensal'})` : 'única',
          'Contrato': t.recorrente ? { ativo: 'ativo', cancelado: 'cancelado', pendente: 'em teste' }[getRecurrenceStatus(t)] || '' : '',
          'Cancelado em': t.dataCancelamento ? formatDateBR(t.dataCancelamento) : '',
          'Aprovação': t.status || 'aprovado',
          Vendedor: vendedores.find((v) => v.id === t.vendedorId)?.nome || '',
        }
        : {
          Pagamento: t.pago === false ? 'em aberto' : 'pago',
          Vencimento: t.dataVencimento ? formatDateBR(t.dataVencimento) : '',
          Custo: t.despesaFixa === true ? 'fixo' : t.despesaFixa === false ? 'variável' : 'não classificado',
        }),
    })));
  }

  return (
    <div style={{ paddingTop: 12 }}>
      <PageToolbar
        desc={ehReceita
          ? 'Tudo que entra: vendas e outras receitas. Contrato recorrente aparece uma vez, como contrato — as cobranças mês a mês estão em Relatórios e em Vencimentos.'
          : 'Tudo que sai, uma linha por parcela. Use "Em aberto" para ver o que ainda falta pagar.'}
        actionLabel={ehReceita ? (role === 'vendedor' ? 'Nova venda' : 'Nova receita') : 'Nova despesa'}
        onAction={onNovo}
      />

      {role === 'admin' && (
        <button
          onClick={onImportClick}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--primary-text)', fontWeight: 700, fontSize: 'var(--fs-body)', cursor: 'pointer', padding: '0 0 10px' }}
        >
          <Upload size={14} /> Importar CSV (Asaas ou outro)
        </button>
      )}

      {/* Mesma função permanente da tela de Clientes: cada linha do aviso diz o
          que falta e por que importa, e filtra a lista naquele buraco. */}
      {role === 'admin' && totalIncompletos > 0 && (
        <Card style={{ marginBottom: 14, borderColor: 'var(--warning)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 'var(--fs-title)' }}>
                <FileText size={17} style={{ color: 'var(--warning-strong)', flexShrink: 0 }} />
                {totalIncompletos} de {todas.length} lançamento(s) incompleto(s)
              </div>
              <div style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-soft)', marginTop: 3, lineHeight: 1.5 }}>
                Clique em um item para ver só os lançamentos que precisam daquele ajuste. Abrir o lançamento já leva ao formulário.
              </div>
            </div>
            {filterFalta !== 'todos' && (
              <Button variant="secondary" onClick={() => setFilterFalta('todos')} style={{ flexShrink: 0 }}>Limpar filtro</Button>
            )}
          </div>

          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {resumoFaltas.map((f) => {
              const ativo = filterFalta === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilterFalta(ativo ? 'todos' : f.key)}
                  aria-pressed={ativo}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    padding: '10px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    border: ativo ? '1px solid var(--warning)' : '1px solid transparent',
                    background: ativo ? 'var(--warning-light)' : 'transparent',
                    color: 'var(--ink)',
                  }}
                  onMouseEnter={(e) => { if (!ativo) e.currentTarget.style.background = 'var(--surface-2)'; }}
                  onMouseLeave={(e) => { if (!ativo) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ minWidth: 54, fontWeight: 800, fontSize: 15, color: 'var(--warning-strong)', flexShrink: 0 }}>{f.quantos}</span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: 13 }}>{f.titulo}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.45 }}>{f.porque}</span>
                  </span>
                  <ChevronRight size={16} style={{ color: 'var(--ink-soft)', flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        </Card>
      )}

      <SearchInput
        value={busca}
        onChange={setBusca}
        placeholder={ehReceita ? 'Buscar por cliente, descrição ou categoria…' : 'Buscar por fornecedor, descrição ou categoria…'}
      />

      <FilterGroup label="Período">
        {MOV_PERIODOS.map((p) => (
          <Chip key={p.key} active={filterPeriodo === p.key} onClick={() => setFilterPeriodo(p.key)}>{p.label}</Chip>
        ))}
      </FilterGroup>

      {ehReceita ? (
        <>
          <FilterGroup label="Forma de cobrança">
            <Chip active={filterRecorrencia === 'todos'} onClick={() => setFilterRecorrencia('todos')}>Todas</Chip>
            <Chip active={filterRecorrencia === 'recorrentes'} onClick={() => setFilterRecorrencia('recorrentes')}>Recorrentes</Chip>
            <Chip active={filterRecorrencia === 'unicas'} onClick={() => setFilterRecorrencia('unicas')}>Venda única</Chip>
          </FilterGroup>

          <FilterGroup label="Situação do contrato">
            <Chip active={filterContrato === 'todos'} onClick={() => setFilterContrato('todos')}>Todas</Chip>
            <Chip active={filterContrato === 'ativo'} onClick={() => setFilterContrato('ativo')}>Ativo</Chip>
            <Chip active={filterContrato === 'cancelado'} onClick={() => setFilterContrato('cancelado')}>Cancelado</Chip>
            <Chip active={filterContrato === 'pendente'} onClick={() => setFilterContrato('pendente')}>Em período de teste</Chip>
          </FilterGroup>

          {role === 'admin' && (
            <FilterGroup label="Aprovação">
              <Chip active={filterStatus === 'todos'} onClick={() => setFilterStatus('todos')}>Todas</Chip>
              <Chip active={filterStatus === 'aprovado'} onClick={() => setFilterStatus('aprovado')}>Aprovadas</Chip>
              <Chip active={filterStatus === 'pendente'} onClick={() => setFilterStatus('pendente')}>Aguardando</Chip>
              <Chip active={filterStatus === 'rejeitado'} onClick={() => setFilterStatus('rejeitado')}>Rejeitadas</Chip>
            </FilterGroup>
          )}
        </>
      ) : (
        <>
          <FilterGroup label="Pagamento">
            <Chip active={filterPagamento === 'todos'} onClick={() => setFilterPagamento('todos')}>Todas</Chip>
            <Chip active={filterPagamento === 'pagas'} onClick={() => setFilterPagamento('pagas')}>Pagas</Chip>
            <Chip active={filterPagamento === 'abertas'} onClick={() => setFilterPagamento('abertas')}>Em aberto</Chip>
          </FilterGroup>

          <FilterGroup label="Tipo de custo">
            <Chip active={filterCusto === 'todos'} onClick={() => setFilterCusto('todos')}>Todos</Chip>
            <Chip active={filterCusto === 'fixa'} onClick={() => setFilterCusto('fixa')}>Fixo</Chip>
            <Chip active={filterCusto === 'variavel'} onClick={() => setFilterCusto('variavel')}>Variável</Chip>
            <Chip active={filterCusto === 'nao_classificada'} onClick={() => setFilterCusto('nao_classificada')}>Não classificado</Chip>
          </FilterGroup>
        </>
      )}

      {role === 'admin' && totalIncompletos > 0 && (
        <FilterGroup label="Cadastro">
          <Chip active={filterFalta === 'todos'} onClick={() => setFilterFalta('todos')}>Todos</Chip>
          <Chip active={filterFalta === 'incompletos'} onClick={() => setFilterFalta('incompletos')}>Incompletos ({totalIncompletos})</Chip>
          {resumoFaltas.map((f) => (
            <Chip key={f.key} active={filterFalta === f.key} onClick={() => setFilterFalta(f.key)}>Sem {f.label} ({f.quantos})</Chip>
          ))}
        </FilterGroup>
      )}

      <FilterGroup label={ehReceita ? 'Categoria, vendedor e ordem' : 'Categoria, fornecedor e ordem'}>
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={{ ...inputStyle, flex: '1 1 180px', width: 'auto' }}>
          <option value="todas">Todas as categorias</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>

        {ehReceita ? (
          role === 'admin' && vendedores.length > 0 && (
            <select value={filterVendedor} onChange={(e) => setFilterVendedor(e.target.value)} style={{ ...inputStyle, flex: '1 1 170px', width: 'auto' }}>
              <option value="todos">Todos os vendedores</option>
              <option value="sem">Sem vendedor (venda da casa)</option>
              {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          )
        ) : (
          fornecedores.length > 0 && (
            <select value={filterFornecedor} onChange={(e) => setFilterFornecedor(e.target.value)} style={{ ...inputStyle, flex: '1 1 200px', width: 'auto' }}>
              <option value="todos">Todos os fornecedores</option>
              <option value="sem">Sem fornecedor informado</option>
              {[...fornecedores].sort((a, b) => (a.nome || '').localeCompare(b.nome || '')).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          )
        )}

        <select value={ordem} onChange={(e) => setOrdem(e.target.value)} style={{ ...inputStyle, flex: '0 1 150px', width: 'auto' }}>
          {MOV_ORDENS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </FilterGroup>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, margin: '4px 2px 10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-soft)' }}>
          {filtrando ? `${list.length} de ${todas.length} lançamento(s)` : `${list.length} lançamento(s)`}
          {list.length > visiveis.length ? ` · mostrando os ${visiveis.length} primeiros` : ''}
        </span>
        {list.length > 0 && (
          <Button variant="secondary" onClick={baixar} style={{ flexShrink: 0 }}>
            <Download size={15} /> Baixar CSV
          </Button>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Nada por aqui"
          desc={todas.length === 0
            ? `Nenhuma ${ehReceita ? 'receita' : 'despesa'} lançada ainda. Use o botão acima para registrar a primeira.`
            : 'Nenhum lançamento com esses filtros. Ajuste a busca ou o período.'}
          actionLabel={todas.length === 0 ? (ehReceita ? '+ Nova receita' : '+ Nova despesa') : undefined}
          onAction={todas.length === 0 ? onNovo : undefined}
        />
      ) : (
        <>
          <Card style={{ padding: 0 }}>
            {visiveis.map((tx, i) => (
              <TransactionRow
                key={tx.id}
                tx={tx}
                category={data.categories.find((c) => c.id === tx.categoriaId)}
                last={i === visiveis.length - 1}
                onClick={() => onEdit(tx)}
                faltas={role === 'admin' ? faltasPorLancamento.get(tx.id) : null}
              />
            ))}
          </Card>

          {list.length > visiveis.length && (
            <Button variant="secondary" onClick={() => setLimite((n) => n + MOVIMENTOS_POR_PAGINA)} style={{ width: '100%', marginTop: 12 }}>
              Mostrar mais {Math.min(MOVIMENTOS_POR_PAGINA, list.length - visiveis.length)} de {list.length - visiveis.length} restantes
            </Button>
          )}

          <div style={{ marginTop: 14, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--fs-small)', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Total do filtro</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <Chip active={totalsMode === 'geral'} onClick={() => setTotalsMode('geral')}>Total geral</Chip>
                <Chip active={totalsMode === 'mensal'} onClick={() => setTotalsMode('mensal')}>Por mês</Chip>
              </div>
            </div>

            {totalsMode === 'geral' ? (
              <Card>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-soft)' }}>{ehReceita ? 'Receitas' : 'Despesas'}</div>
                    <div style={{ fontWeight: 800, fontSize: 18, color: ehReceita ? 'var(--positive)' : 'var(--negative)' }}>{formatCurrency(total)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Lançamentos</div>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>{list.length}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Valor médio</div>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>{formatCurrency(media)}</div>
                  </div>
                  {!ehReceita && emAberto > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Em aberto</div>
                      <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--warning-strong)' }}>{formatCurrency(emAberto)}</div>
                    </div>
                  )}
                </div>
                {ehReceita && (
                  <p style={{ margin: '12px 0 0', fontSize: 'var(--fs-small)', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                    Este total soma o valor de cada contrato uma vez. O faturamento realizado, com as parcelas dos recorrentes, está em Relatórios.
                  </p>
                )}
              </Card>
            ) : (
              <Card style={{ padding: 0 }}>
                <div className="lomuz-table-wrap">
                  <table className="lomuz-table">
                    <caption className="lomuz-sr-only">Totais mensais do filtro aplicado.</caption>
                    <thead>
                      <tr>
                        <th scope="col">Mês</th>
                        <th scope="col" style={{ textAlign: 'right' }}>Lançamentos</th>
                        <th scope="col" style={{ textAlign: 'right' }}>{ehReceita ? 'Receitas' : 'Despesas'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mensalRows.map((r) => (
                        <tr key={r.key}>
                          <td style={{ whiteSpace: 'nowrap' }}>{r.label}</td>
                          <td className="lomuz-num" style={{ textAlign: 'right' }}>{r.qtd}</td>
                          <td className="lomuz-num" style={{ textAlign: 'right', fontWeight: 700, color: ehReceita ? 'var(--positive)' : 'var(--negative)' }}>{formatCurrency(r.valor)}</td>
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
          {error && <div style={{ color: 'var(--negative)', fontSize: 'var(--fs-body)', marginTop: 12, fontWeight: 600 }}>{error}</div>}
          <Button variant="secondary" onClick={onClose} style={{ width: '100%', marginTop: 20 }}>Cancelar</Button>
        </div>
      )}

      {step === 'mapping' && (
        <div>
          <div style={{ fontSize: 'var(--fs-body)', color: 'var(--ink-soft)', marginBottom: 12 }}>{fileName} · {rows.length} linha(s) encontrada(s)</div>

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
            <div style={{ fontSize: 'var(--fs-body)', fontWeight: 700, marginBottom: 6 }}>
              {validRows.length} lançamento(s) prontos para importar
              {invalidCount > 0 && <span style={{ color: 'var(--negative)', fontWeight: 600 }}> · {invalidCount} ignorado(s) (data ou valor inválido)</span>}
            </div>
            {validRows.slice(0, 4).map((r, i) => (
              <div key={i} style={{ fontSize: 12, color: 'var(--ink-soft)', display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span>{formatDateBR(r.data)} · {r.descricao || '(sem descrição)'}</span>
                <span>{formatCurrency(r.valor)}</span>
              </div>
            ))}
            {validRows.length > 4 && <div style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-soft)' }}>+ {validRows.length - 4} outro(s)…</div>}
          </div>

          {error && <div style={{ color: 'var(--negative)', fontSize: 'var(--fs-body)', marginTop: 12, fontWeight: 600 }}>{error}</div>}

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
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-body)' }}>
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
        <div style={{ fontSize: 'var(--fs-body)', color: 'var(--primary-text)', fontWeight: 600, marginBottom: 10 }}>{inviteStatus}</div>
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
              <Chip key={v.id} active={selectedId === v.id} onClick={() => setSelectedId(v.id)}>
                {v.nome}{v.ativo === false ? ' (inativo)' : ''}
              </Chip>
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

function PlanoForm({ plano, categories, servicos, onSubmit, onCancel }) {
  const receitaCats = categories.filter((c) => c.tipo === 'receita');
  const servicosAtivos = (servicos || []).filter((s) => s.ativo !== false);
  const [nome, setNome] = useState(plano?.nome || '');
  const [valor, setValor] = useState(plano?.valor != null ? String(plano.valor) : '');
  const [categoriaId, setCategoriaId] = useState(plano?.categoriaId || receitaCats[0]?.id || '');
  const [servicoId, setServicoId] = useState(plano?.servicoId || servicosAtivos[0]?.id || '');
  // Plano novo já vem sugerindo 5%; plano existente sem comissão definida abre
  // em branco, senão editar o nome do plano gravaria 5% que ninguém escolheu.
  const [comissao, setComissao] = useState(plano ? (plano.comissaoPercentual != null ? String(plano.comissaoPercentual) : '') : '5');
  const [contratoMeses, setContratoMeses] = useState(plano?.contratoMeses != null ? String(plano.contratoMeses) : '');
  const [recorrente, setRecorrente] = useState(!!plano?.recorrente);
  const [frequencia, setFrequencia] = useState(plano?.frequencia || 'mensal');
  const [ativo, setAtivo] = useState(plano?.ativo !== false);
  const [error, setError] = useState('');

  function submit() {
    if (!nome.trim()) { setError('Informe o nome do plano.'); return; }
    if (!valor || parseFloat(valor) <= 0) { setError('Informe o valor do plano.'); return; }
    if (!servicoId) { setError('Escolha o serviço que este plano vende.'); return; }
    onSubmit({
      id: plano?.id || uid(),
      nome: nome.trim(),
      valor: parseFloat(valor) || 0,
      categoriaId: categoriaId || null,
      servicoId,
      comissaoPercentual: comissao.trim() === '' ? null : (parseFloat(comissao) || 0),
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
          <Field label="Comissão (%)" hint="Em branco = usa a comissão padrão de cada vendedor.">
            <input type="number" min="0" max="100" step="0.5" style={inputStyle} value={comissao} onChange={(e) => setComissao(e.target.value)} placeholder="do vendedor" />
          </Field>
        </div>
      </div>
      <Field label="Serviço" hint="O que este plano vende de fato.">
        <select value={servicoId} onChange={(e) => setServicoId(e.target.value)} style={inputStyle}>
          {servicosAtivos.length === 0 && <option value="">Crie um serviço primeiro, na aba Serviços</option>}
          {servicosAtivos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
      </Field>
      <Field label="Categoria de receita" hint="Só pra contabilidade e relatórios financeiros.">
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

      {error && <div style={{ color: 'var(--negative)', fontSize: 'var(--fs-body)', marginBottom: 10, fontWeight: 600 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
        <Button variant="secondary" onClick={onCancel} style={{ flex: 1 }}>Cancelar</Button>
        <Button variant="primary" onClick={submit} style={{ flex: 2 }}>Salvar plano</Button>
      </div>
    </div>
  );
}

// Os cadastros deixaram de ser seção própria no menu e viraram abas de
// Clientes: são todos cadastro de apoio, o cliente é o principal, e assim a
// barra de navegação fica com 7 seções em vez de 8. A aba "Clientes" é a
// primeira e é o que abre por padrão.
const CADASTROS_TABS = [
  { key: 'clientes', label: 'Clientes' },
  { key: 'fornecedores', label: 'Fornecedores' },
  { key: 'categorias', label: 'Categorias' },
  { key: 'planos', label: 'Planos negociados' },
  { key: 'servicos', label: 'Serviços' },
  { key: 'ramos', label: 'Ramos de negócio' },
  { key: 'indices', label: 'Índices de reajuste' },
];
function CadastrosTabNav({ subTab, setSubTab }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      {CADASTROS_TABS.map((t) => (
        <Chip key={t.key} active={subTab === t.key} onClick={() => setSubTab(t.key)}>{t.label}</Chip>
      ))}
    </div>
  );
}

// Cabeçalho padrão das páginas de cadastro: explicação curta à esquerda e a
// ação principal à direita, sempre no topo. Antes o botão "Novo" existia só
// no fim da lista — numa lista de 57 categorias ele ficava invisível.
function PageToolbar({ desc, actionLabel, onAction }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
      <p style={{ fontSize: 'var(--fs-body)', color: 'var(--ink-soft)', margin: 0, lineHeight: 1.6, flex: '1 1 280px', minWidth: 0 }}>{desc}</p>
      {actionLabel && (
        <Button variant="primary" onClick={onAction} style={{ flexShrink: 0 }}>
          <Plus size={16} /> {actionLabel}
        </Button>
      )}
    </div>
  );
}

function SearchInput({ value, onChange, placeholder }) {
  return (
    <div style={{ position: 'relative', marginBottom: 12 }}>
      <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)', pointerEvents: 'none' }} />
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ ...inputStyle, paddingLeft: 34 }} />
    </div>
  );
}

// Rótulo de grupo de filtro — mesmo estilo em todas as páginas de lista.
function FilterGroup({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 'var(--fs-micro)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--ink-soft)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}

// Aba genérica de cadastro simples (serviços, ramos de negócio, índices de
// reajuste) — mesma estrutura de lista + formulário das categorias/planos,
// mas com um Form específico por tipo já que os campos mudam.
function CadastroSimplesTab({ subTab, setSubTab, config, onSave, onRemove }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const { itens, titulo, desc, Form, renderLinha } = config;

  return (
    <div style={{ paddingTop: 12 }}>
      <PageToolbar desc={desc} actionLabel={config.novoLabel || 'Novo'} onAction={() => { setEditing(null); setShowForm(true); }} />

      {itens.length === 0 ? (
        <EmptyState icon={Tag} title={titulo} desc="Use o botão acima para criar o primeiro." actionLabel="+ Novo" onAction={() => { setEditing(null); setShowForm(true); }} />
      ) : (
        <Card style={{ padding: 0 }}>
          {itens.map((item, i) => {
            const linha = renderLinha(item);
            return (
              <div key={item.id} style={{ padding: 14, borderBottom: i === itens.length - 1 ? 'none' : '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{item.nome}</div>
                  {linha && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{linha}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => { setEditing(item); setShowForm(true); }} style={iconBtnStyle}><Edit2 size={15} /></button>
                  <button onClick={() => onRemove(item.id)} style={iconBtnStyle}><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {itens.length > 0 && (
        <Button variant="primary" onClick={() => { setEditing(null); setShowForm(true); }} style={{ width: '100%', marginTop: 16 }}>
          <Plus size={16} /> Novo
        </Button>
      )}

      {showForm && (
        <Modal title={editing ? 'Editar' : 'Novo'} onClose={() => { setShowForm(false); setEditing(null); }}>
          <Form
            item={editing}
            onSubmit={(item) => { onSave(item, editing); setShowForm(false); setEditing(null); }}
            onCancel={() => { setShowForm(false); setEditing(null); }}
          />
        </Modal>
      )}
    </div>
  );
}

function ServicoForm({ item, onSubmit, onCancel }) {
  const [nome, setNome] = useState(item?.nome || '');
  const [tipoCobranca, setTipoCobranca] = useState(item?.tipoCobranca || 'unitaria');
  const [ativo, setAtivo] = useState(item?.ativo !== false);
  const [error, setError] = useState('');

  function submit() {
    if (!nome.trim()) { setError('Informe o nome do serviço.'); return; }
    onSubmit({ id: item?.id || uid(), nome: nome.trim(), tipoCobranca, ativo });
  }

  return (
    <div>
      <Field label="Nome do serviço"><input type="text" style={inputStyle} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Carro Som" /></Field>
      <Field label="Forma de cobrança">
        <select value={tipoCobranca} onChange={(e) => setTipoCobranca(e.target.value)} style={inputStyle}>
          <option value="recorrente">Recorrente</option>
          <option value="unitaria">Unitária</option>
          <option value="por_hora">Por hora</option>
        </select>
      </Field>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Disponível para novos planos</div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Desligue pra aposentar o serviço sem apagar o histórico</div>
        </div>
        <Toggle checked={ativo} onChange={setAtivo} />
      </div>
      {error && <div style={{ color: 'var(--negative)', fontSize: 'var(--fs-body)', marginBottom: 10, fontWeight: 600 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
        <Button variant="secondary" onClick={onCancel} style={{ flex: 1 }}>Cancelar</Button>
        <Button variant="primary" onClick={submit} style={{ flex: 2 }}>Salvar serviço</Button>
      </div>
    </div>
  );
}

function RamoForm({ item, onSubmit, onCancel }) {
  const [nome, setNome] = useState(item?.nome || '');
  const [error, setError] = useState('');

  function submit() {
    if (!nome.trim()) { setError('Informe o nome do ramo.'); return; }
    onSubmit({ id: item?.id || uid(), nome: nome.trim() });
  }

  return (
    <div>
      <Field label="Nome do ramo de negócio"><input type="text" style={inputStyle} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Comércio varejista" /></Field>
      {error && <div style={{ color: 'var(--negative)', fontSize: 'var(--fs-body)', marginBottom: 10, fontWeight: 600 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
        <Button variant="secondary" onClick={onCancel} style={{ flex: 1 }}>Cancelar</Button>
        <Button variant="primary" onClick={submit} style={{ flex: 2 }}>Salvar ramo</Button>
      </div>
    </div>
  );
}

function IndiceForm({ item, onSubmit, onCancel }) {
  const [nome, setNome] = useState(item?.nome || '');
  const [descricao, setDescricao] = useState(item?.descricao || '');
  const [error, setError] = useState('');

  function submit() {
    if (!nome.trim()) { setError('Informe o nome do índice.'); return; }
    onSubmit({ id: item?.id || uid(), nome: nome.trim(), descricao: descricao.trim() });
  }

  return (
    <div>
      <Field label="Nome do índice"><input type="text" style={inputStyle} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: IPCA (12 meses acumulado)" /></Field>
      <Field label="Descrição (opcional)">
        <textarea rows={3} style={{ ...inputStyle, resize: 'vertical' }} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="De onde vem, quando costuma ser usado..." />
      </Field>
      {error && <div style={{ color: 'var(--negative)', fontSize: 'var(--fs-body)', marginBottom: 10, fontWeight: 600 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
        <Button variant="secondary" onClick={onCancel} style={{ flex: 1 }}>Cancelar</Button>
        <Button variant="primary" onClick={submit} style={{ flex: 2 }}>Salvar índice</Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
   CADASTRO: FORNECEDORES / CREDORES
   Aba própria (e não a CadastroSimplesTab genérica) porque são 180 registros
   com histórico de pagamento atrás: sem busca, ordenação por valor e paginação
   viraria uma parede de nomes, e o dado mais útil — quanto já foi pago a cada
   um — não caberia numa lista simples de nome.
   ------------------------------------------------------------------------- */

const FORNECEDORES_POR_PAGINA = 40;

function FornecedorForm({ item, resumo, onSubmit, onCancel, onDelete }) {
  const [nome, setNome] = useState(item?.nome || '');
  const [documento, setDocumento] = useState(item?.documento || '');
  const [ativo, setAtivo] = useState(item?.ativo !== false);
  const [error, setError] = useState('');

  function submit() {
    if (!nome.trim()) { setError('Informe o nome do fornecedor.'); return; }
    onSubmit({ id: item?.id || uid(), nome: nome.trim(), documento: documento.trim(), ativo });
  }

  const temHistorico = (resumo?.lancamentos || 0) > 0;

  return (
    <div>
      {temHistorico && (
        <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: 12, marginBottom: 14, fontSize: 'var(--fs-small)', color: 'var(--ink-soft)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--ink)' }}>{resumo.lancamentos} despesa(s)</strong> já lançada(s) para este fornecedor, somando <strong style={{ color: 'var(--ink)' }}>{formatCurrency(resumo.total)}</strong>
          {resumo.ultimo ? ` — a última em ${formatDateBR(resumo.ultimo)}.` : '.'}
          {resumo.aberto > 0 && <> Ainda em aberto: <strong style={{ color: 'var(--warning-strong)' }}>{formatCurrency(resumo.aberto)}</strong>.</>}
        </div>
      )}

      <Field label="Nome do fornecedor" hint="Renomear aqui muda o nome em todos os lançamentos deste fornecedor.">
        <input type="text" style={inputStyle} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Posto Sul Paraná" />
      </Field>
      <Field label="CNPJ / CPF (opcional)">
        <input type="text" style={inputStyle} value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="Só números ou com pontuação" />
      </Field>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Fornecedor ativo</div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Desligue pra tirar da lista de novas despesas sem apagar o histórico</div>
        </div>
        <Toggle checked={ativo} onChange={setAtivo} />
      </div>

      {error && <div style={{ color: 'var(--negative)', fontSize: 'var(--fs-body)', marginBottom: 10, fontWeight: 600 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
        <Button variant="secondary" onClick={onCancel} style={{ flex: 1 }}>Cancelar</Button>
        <Button variant="primary" onClick={submit} style={{ flex: 2 }}>Salvar fornecedor</Button>
      </div>

      {/* Fornecedor com despesa lançada não se apaga: o histórico financeiro
          precisa continuar somando por credor. O caminho é desativar. */}
      {onDelete && (
        temHistorico ? (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 'var(--fs-small)', color: 'var(--ink-soft)', lineHeight: 1.6 }}>
            Não é possível excluir um fornecedor que já tem despesa lançada — isso apagaria o vínculo do histórico. Use o botão <strong>Fornecedor ativo</strong> acima para aposentá-lo.
          </div>
        ) : (
          <Button variant="secondary" onClick={onDelete} style={{ width: '100%', marginTop: 12, color: 'var(--negative)' }}>
            <Trash2 size={15} /> Excluir fornecedor
          </Button>
        )
      )}
    </div>
  );
}

function FornecedoresTab({ subTab, setSubTab, fornecedores, transactions, onSave, onRemove }) {
  const [busca, setBusca] = useState('');
  const [filterAtivo, setFilterAtivo] = useState('ativos');
  const [ordem, setOrdem] = useState('gasto');
  const [limite, setLimite] = useState(FORNECEDORES_POR_PAGINA);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  // Quanto já foi pago a cada fornecedor. As despesas são todas lançamento
  // avulso (uma linha por parcela), então dá pra somar `valor` direto — não
  // precisa expandir recorrência como nas receitas.
  const resumos = useMemo(() => {
    const map = new Map();
    transactions.forEach((t) => {
      if (t.tipo !== 'despesa' || !t.fornecedorId || t.status !== 'aprovado') return;
      const r = map.get(t.fornecedorId) || { lancamentos: 0, total: 0, aberto: 0, ultimo: null };
      r.lancamentos += 1;
      r.total += t.valor || 0;
      if (t.pago === false) r.aberto += t.valor || 0;
      if (!r.ultimo || t.data > r.ultimo) r.ultimo = t.data;
      map.set(t.fornecedorId, r);
    });
    return map;
  }, [transactions]);

  const vazio = { lancamentos: 0, total: 0, aberto: 0, ultimo: null };
  const termo = busca.trim().toLowerCase();
  const termoDigitos = soDigitos(busca);

  let list = fornecedores.filter((f) => {
    if (filterAtivo === 'ativos' && f.ativo === false) return false;
    if (filterAtivo === 'inativos' && f.ativo !== false) return false;
    if (termo) {
      const porDocumento = termoDigitos.length >= 3 && soDigitos(f.documento).includes(termoDigitos);
      if (!(f.nome || '').toLowerCase().includes(termo) && !porDocumento) return false;
    }
    return true;
  });
  list = [...list].sort((a, b) => {
    const ra = resumos.get(a.id) || vazio;
    const rb = resumos.get(b.id) || vazio;
    if (ordem === 'gasto') return rb.total - ra.total || (a.nome || '').localeCompare(b.nome || '');
    if (ordem === 'aberto') return rb.aberto - ra.aberto || rb.total - ra.total;
    if (ordem === 'recente') return (rb.ultimo || '').localeCompare(ra.ultimo || '');
    return (a.nome || '').localeCompare(b.nome || '');
  });
  const visiveis = list.slice(0, limite);

  const totalConsiderado = fornecedores.filter((f) => (filterAtivo === 'ativos' ? f.ativo !== false : filterAtivo === 'inativos' ? f.ativo === false : true)).length;
  const filtrando = list.length !== totalConsiderado;
  const somaFiltro = list.reduce((s, f) => s + (resumos.get(f.id)?.total || 0), 0);
  const abertoFiltro = list.reduce((s, f) => s + (resumos.get(f.id)?.aberto || 0), 0);

  useEffect(() => { setLimite(FORNECEDORES_POR_PAGINA); }, [busca, filterAtivo, ordem]);

  function abrirNovo() { setEditing(null); setShowForm(true); }
  function salvar(item) { onSave(item, editing); setShowForm(false); setEditing(null); }
  function excluir(id) { onRemove(id); setShowForm(false); setEditing(null); }

  return (
    <div style={{ paddingTop: 12 }}>
      <PageToolbar
        desc="Quem a empresa paga: fornecedor, banco, imposto, salário. Cada despesa aponta para um fornecedor, e é isso que permite ver quanto já foi pago a cada um."
        actionLabel="Novo fornecedor"
        onAction={abrirNovo}
      />

      <SearchInput value={busca} onChange={setBusca} placeholder="Buscar fornecedor pelo nome ou CNPJ…" />

      <FilterGroup label="Situação">
        <Chip active={filterAtivo === 'ativos'} onClick={() => setFilterAtivo('ativos')}>Ativos</Chip>
        <Chip active={filterAtivo === 'inativos'} onClick={() => setFilterAtivo('inativos')}>Inativos</Chip>
        <Chip active={filterAtivo === 'todos'} onClick={() => setFilterAtivo('todos')}>Todos</Chip>
      </FilterGroup>

      <FilterGroup label="Ordenar por">
        <Chip active={ordem === 'gasto'} onClick={() => setOrdem('gasto')}>Maior gasto</Chip>
        <Chip active={ordem === 'aberto'} onClick={() => setOrdem('aberto')}>Maior valor em aberto</Chip>
        <Chip active={ordem === 'recente'} onClick={() => setOrdem('recente')}>Pagamento mais recente</Chip>
        <Chip active={ordem === 'nome'} onClick={() => setOrdem('nome')}>Nome</Chip>
      </FilterGroup>

      <div style={{ margin: '4px 2px 10px', fontSize: 'var(--fs-small)', color: 'var(--ink-soft)' }}>
        {filtrando ? `${list.length} de ${totalConsiderado} fornecedor(es)` : `${list.length} fornecedor(es)`}
        {somaFiltro > 0 ? ` · ${formatCurrency(somaFiltro)} pagos` : ''}
        {abertoFiltro > 0 ? ` · ${formatCurrency(abertoFiltro)} em aberto` : ''}
        {list.length > visiveis.length ? ` · mostrando os ${visiveis.length} primeiros` : ''}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={termo ? 'Nenhum fornecedor encontrado' : 'Nenhum fornecedor cadastrado'}
          desc={termo ? `Nada com "${busca}". Ajuste a busca ou cadastre um novo.` : 'Cadastre quem a empresa paga para acompanhar o gasto por fornecedor.'}
          actionLabel="+ Novo fornecedor"
          onAction={abrirNovo}
        />
      ) : (
        <Card style={{ padding: 0 }}>
          {visiveis.map((f, i) => {
            const r = resumos.get(f.id) || vazio;
            const linha2 = [
              f.documento,
              r.lancamentos > 0 ? `${r.lancamentos} lançamento(s)` : 'sem lançamento ainda',
              r.ultimo ? `último em ${formatDateBR(r.ultimo)}` : null,
            ].filter(Boolean).join(' · ');
            return (
              <div
                key={f.id}
                onClick={() => { setEditing(f); setShowForm(true); }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: i === visiveis.length - 1 ? 'none' : '1px solid var(--border)', cursor: 'pointer' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nome}</span>
                    {f.ativo === false && <span style={{ fontSize: 'var(--fs-micro)', fontWeight: 700, color: 'var(--ink-soft)', background: 'var(--surface-2)', borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>Inativo</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linha2}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{formatCurrency(r.total)}</div>
                  {r.aberto > 0 && <div style={{ fontSize: 'var(--fs-small)', fontWeight: 700, color: 'var(--warning-strong)' }}>{formatCurrency(r.aberto)} a pagar</div>}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {list.length > visiveis.length && (
        <Button variant="secondary" onClick={() => setLimite((n) => n + FORNECEDORES_POR_PAGINA)} style={{ width: '100%', marginTop: 12 }}>
          Mostrar mais {Math.min(FORNECEDORES_POR_PAGINA, list.length - visiveis.length)} de {list.length - visiveis.length} restantes
        </Button>
      )}

      {list.length > 0 && (
        <Button variant="primary" onClick={abrirNovo} style={{ width: '100%', marginTop: 16 }}>
          <Plus size={16} /> Novo fornecedor
        </Button>
      )}

      {showForm && (
        <Modal title={editing ? 'Editar fornecedor' : 'Novo fornecedor'} onClose={() => { setShowForm(false); setEditing(null); }}>
          <FornecedorForm
            item={editing}
            resumo={editing ? (resumos.get(editing.id) || vazio) : vazio}
            onSubmit={salvar}
            onCancel={() => { setShowForm(false); setEditing(null); }}
            onDelete={editing ? () => excluir(editing.id) : null}
          />
        </Modal>
      )}
    </div>
  );
}

// subTab vem de fora porque o menu do cabeçalho abre um cadastro específico
// direto, sem passar pela primeira aba.
function CategoriasPage({ data, persist, askConfirm, subTab, setSubTab }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showPlanoForm, setShowPlanoForm] = useState(false);
  const [editingPlano, setEditingPlano] = useState(null);
  const [buscaCat, setBuscaCat] = useState('');
  const [filtroTipoCat, setFiltroTipoCat] = useState('todas');

  const receitaCats = data.categories.filter((c) => c.tipo === 'receita');
  const despesaCats = data.categories.filter((c) => c.tipo === 'despesa');
  const planos = data.planos || [];
  const servicos = data.servicos || [];
  const ramosNegocio = data.ramosNegocio || [];
  const indicesReajuste = data.indicesReajuste || [];

  function saveSimples(campo, item, editingItem) {
    const list = editingItem ? (data[campo] || []).map((x) => (x.id === item.id ? item : x)) : [...(data[campo] || []), item];
    persist({ ...data, [campo]: list });
  }
  function removeSimples(campo, id, msg) {
    askConfirm(msg, () => persist({ ...data, [campo]: (data[campo] || []).filter((x) => x.id !== id) }));
  }

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
        <PageToolbar
          desc="Planos com preço e comissão já definidos. Quando o vendedor escolhe um plano ao lançar a venda, os campos vêm preenchidos — e você ainda pode ajustar antes de aprovar."
          actionLabel="Novo plano"
          onAction={() => { setEditingPlano(null); setShowPlanoForm(true); }}
        />

        {planos.length === 0 ? (
          <EmptyState icon={Tag} title="Nenhum plano cadastrado" desc="Crie planos com preço e comissão pré-definidos para agilizar o lançamento das vendas." actionLabel="+ Novo plano" onAction={() => { setEditingPlano(null); setShowPlanoForm(true); }} />
        ) : (
          <Card style={{ padding: 0 }}>
            {planos.map((p, i) => {
              const cat = data.categories.find((c) => c.id === p.categoriaId);
              const serv = servicos.find((s) => s.id === p.servicoId);
              return (
                <div key={p.id} style={{ padding: 14, borderBottom: i === planos.length - 1 ? 'none' : '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, opacity: p.ativo === false ? 0.5 : 1 }}>
                      {p.nome}{p.ativo === false && <span style={{ fontWeight: 500, color: 'var(--ink-soft)' }}> (fora de venda)</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                      {formatCurrency(p.valor)} · {p.comissaoPercentual != null ? `comissão ${p.comissaoPercentual}%` : 'comissão do vendedor'}
                      {serv ? ` · ${serv.nome}` : ''}
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

        {showPlanoForm && (
          <Modal title={editingPlano ? 'Editar plano' : 'Novo plano negociado'} onClose={() => { setShowPlanoForm(false); setEditingPlano(null); }}>
            <PlanoForm plano={editingPlano} categories={data.categories} servicos={servicos} onSubmit={savePlano} onCancel={() => { setShowPlanoForm(false); setEditingPlano(null); }} />
          </Modal>
        )}
      </div>
    );
  }

  if (subTab === 'fornecedores') {
    return (
      <FornecedoresTab
        subTab={subTab} setSubTab={setSubTab}
        fornecedores={data.fornecedores || []}
        transactions={data.transactions}
        onSave={(item, editingItem) => saveSimples('fornecedores', item, editingItem)}
        onRemove={(id) => removeSimples('fornecedores', id, 'Excluir este fornecedor? Ele não tem nenhuma despesa lançada.')}
      />
    );
  }

  if (subTab === 'servicos' || subTab === 'ramos' || subTab === 'indices') {
    const config = {
      servicos: {
        campo: 'servicos', itens: servicos, titulo: 'Nenhum serviço cadastrado',
        desc: 'Serviços são o que a empresa vende de fato — cada plano negociado aponta para um serviço.',
        Form: ServicoForm,
        renderLinha: (s) => `${{ recorrente: 'Recorrente', unitaria: 'Unitária', por_hora: 'Por hora' }[s.tipoCobranca] || s.tipoCobranca}${s.ativo === false ? ' · inativo' : ''}`,
      },
      ramos: {
        campo: 'ramosNegocio', itens: ramosNegocio, titulo: 'Nenhum ramo cadastrado',
        desc: 'Ramos de negócio classificam o cliente (comércio, indústria, órgão público...). Usados no cadastro de clientes.',
        Form: RamoForm,
        renderLinha: () => null,
      },
      indices: {
        campo: 'indicesReajuste', itens: indicesReajuste, titulo: 'Nenhum índice cadastrado',
        desc: 'Índices financeiros usados no reajuste anual de contrato do cliente (padrão: IPCA acumulado 12 meses).',
        Form: IndiceForm,
        renderLinha: (ix) => ix.descricao || null,
      },
    }[subTab];

    return (
      <CadastroSimplesTab
        key={subTab}
        subTab={subTab} setSubTab={setSubTab}
        config={config}
        onSave={(item, editingItem) => saveSimples(config.campo, item, editingItem)}
        onRemove={(id) => removeSimples(config.campo, id, `Remover este item?`)}
      />
    );
  }

  const termo = buscaCat.trim().toLowerCase();
  const filtra = (list) => (termo ? list.filter((c) => c.nome.toLowerCase().includes(termo)) : list);
  const receitasFiltradas = filtra(receitaCats);
  const despesasFiltradas = filtra(despesaCats);
  const mostraReceitas = filtroTipoCat !== 'despesa';
  const mostraDespesas = filtroTipoCat !== 'receita';
  const nadaEncontrado = (!mostraReceitas || receitasFiltradas.length === 0) && (!mostraDespesas || despesasFiltradas.length === 0);

  function novaCategoria() { setEditing(null); setShowForm(true); }

  return (
    <div style={{ paddingTop: 12 }}>
      <PageToolbar
        desc="Categorias organizam suas receitas e despesas — é o que alimenta os gráficos, a previsão e o ranking de produtos."
        actionLabel="Nova categoria"
        onAction={novaCategoria}
      />

      <SearchInput value={buscaCat} onChange={setBuscaCat} placeholder="Buscar categoria pelo nome…" />
      <FilterGroup label="Tipo">
        <Chip active={filtroTipoCat === 'todas'} onClick={() => setFiltroTipoCat('todas')}>Todas ({receitaCats.length + despesaCats.length})</Chip>
        <Chip active={filtroTipoCat === 'receita'} onClick={() => setFiltroTipoCat('receita')}>Receitas ({receitaCats.length})</Chip>
        <Chip active={filtroTipoCat === 'despesa'} onClick={() => setFiltroTipoCat('despesa')}>Despesas ({despesaCats.length})</Chip>
      </FilterGroup>

      {nadaEncontrado ? (
        <EmptyState
          icon={Tag}
          title={termo ? 'Nenhuma categoria encontrada' : 'Nenhuma categoria ainda'}
          desc={termo ? `Nada com "${buscaCat}". Ajuste a busca ou crie uma categoria nova.` : 'Crie a primeira categoria para começar a organizar suas receitas e despesas.'}
          actionLabel="+ Nova categoria"
          onAction={novaCategoria}
        />
      ) : (
        <>
          {mostraReceitas && receitasFiltradas.length > 0 && (
            <>
              <SectionTitle icon={ArrowUpCircle}>Receitas · {receitasFiltradas.length}</SectionTitle>
              <Card style={{ padding: 0 }}>
                {receitasFiltradas.map((c, i) => <CategoryRow key={c.id} cat={c} last={i === receitasFiltradas.length - 1} onEdit={() => { setEditing(c); setShowForm(true); }} onDelete={() => remove(c.id)} />)}
              </Card>
            </>
          )}

          {mostraDespesas && despesasFiltradas.length > 0 && (
            <>
              <SectionTitle icon={ArrowDownCircle}>Despesas · {despesasFiltradas.length}</SectionTitle>
              <Card style={{ padding: 0 }}>
                {despesasFiltradas.map((c, i) => <CategoryRow key={c.id} cat={c} last={i === despesasFiltradas.length - 1} onEdit={() => { setEditing(c); setShowForm(true); }} onDelete={() => remove(c.id)} />)}
              </Card>
            </>
          )}
        </>
      )}

      {showForm && (
        <Modal title={editing ? 'Editar categoria' : 'Nova categoria'} onClose={() => { setShowForm(false); setEditing(null); }}>
          <CategoryForm cat={editing} onSubmit={save} onCancel={() => { setShowForm(false); setEditing(null); }} />
        </Modal>
      )}
    </div>
  );
}

/* =========================================================================
   PÁGINA: CLIENTES
   ========================================================================= */

function ClienteForm({ item, ramosNegocio, indicesReajuste, onSubmit, onCancel, onDelete }) {
  const [nomeFantasia, setNomeFantasia] = useState(item?.nomeFantasia || '');
  const [razaoSocial, setRazaoSocial] = useState(item?.razaoSocial || '');
  const [organizacaoRede, setOrganizacaoRede] = useState(item?.organizacaoRede || '');
  const [ramoNegocioId, setRamoNegocioId] = useState(item?.ramoNegocioId || '');
  const [cidade, setCidade] = useState(item?.cidade || '');
  const [estado, setEstado] = useState(item?.estado || '');
  const [endereco, setEndereco] = useState(item?.endereco || '');
  const [contatoNome, setContatoNome] = useState(item?.contatoNome || '');
  const [contatoTelefone, setContatoTelefone] = useState(item?.contatoTelefone || '');
  const [contatoEmail, setContatoEmail] = useState(item?.contatoEmail || '');
  const [indiceReajusteId, setIndiceReajusteId] = useState(item?.indiceReajusteId || '');
  const [proximoReajuste, setProximoReajuste] = useState(item?.proximoReajuste || '');
  const [observacoes, setObservacoes] = useState(item?.observacoes || '');
  const [ativo, setAtivo] = useState(item?.ativo !== false);
  const [error, setError] = useState('');

  function submit() {
    if (!nomeFantasia.trim()) { setError('Informe o nome do cliente.'); return; }
    onSubmit({
      id: item?.id || uid(),
      nomeFantasia: nomeFantasia.trim(),
      razaoSocial: razaoSocial.trim(),
      organizacaoRede: organizacaoRede.trim(),
      ramoNegocioId: ramoNegocioId || null,
      cidade: cidade.trim(),
      estado: estado.trim(),
      endereco: endereco.trim(),
      contatoNome: contatoNome.trim(),
      contatoTelefone: contatoTelefone.trim(),
      contatoEmail: contatoEmail.trim(),
      indiceReajusteId: indiceReajusteId || null,
      proximoReajuste: proximoReajuste || null,
      observacoes: observacoes.trim(),
      ativo,
    });
  }

  return (
    <div>
      <Field label="Nome do cliente"><input type="text" style={inputStyle} value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} placeholder="Ex.: Supermercado Central" /></Field>
      <Field label="Razão social (opcional)"><input type="text" style={inputStyle} value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} /></Field>
      <Field label="Rede/organização (opcional)"><input type="text" style={inputStyle} value={organizacaoRede} onChange={(e) => setOrganizacaoRede(e.target.value)} placeholder="Ex.: Rede Sul 10" /></Field>

      <Field label="Ramo de negócio">
        <select value={ramoNegocioId} onChange={(e) => setRamoNegocioId(e.target.value)} style={inputStyle}>
          <option value="">Não informado</option>
          {(ramosNegocio || []).map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
        </select>
      </Field>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 2 }}><Field label="Cidade"><input type="text" style={inputStyle} value={cidade} onChange={(e) => setCidade(e.target.value)} /></Field></div>
        <div style={{ flex: 1 }}><Field label="UF"><input type="text" maxLength={2} style={{ ...inputStyle, textTransform: 'uppercase' }} value={estado} onChange={(e) => setEstado(e.target.value.toUpperCase())} /></Field></div>
      </div>
      <Field label="Endereço (opcional)"><input type="text" style={inputStyle} value={endereco} onChange={(e) => setEndereco(e.target.value)} /></Field>

      <Field label="Contato (opcional)"><input type="text" style={inputStyle} value={contatoNome} onChange={(e) => setContatoNome(e.target.value)} placeholder="Nome de quem responde por esse cliente" /></Field>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Telefone"><input type="text" style={inputStyle} value={contatoTelefone} onChange={(e) => setContatoTelefone(e.target.value)} /></Field></div>
        <div style={{ flex: 1 }}><Field label="E-mail"><input type="email" style={inputStyle} value={contatoEmail} onChange={(e) => setContatoEmail(e.target.value)} /></Field></div>
      </div>

      <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: 12, marginTop: 4, marginBottom: 14 }}>
        <Field label="Índice de reajuste" hint="Usado no aviso anual de correção de contrato.">
          <select value={indiceReajusteId} onChange={(e) => setIndiceReajusteId(e.target.value)} style={inputStyle}>
            <option value="">Nenhum</option>
            {(indicesReajuste || []).map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
          </select>
        </Field>
        <Field label="Próximo reajuste" hint="O sistema avisa quando faltar 30 dias ou menos.">
          <input type="date" value={proximoReajuste} onChange={(e) => setProximoReajuste(e.target.value)} style={inputStyle} />
        </Field>
      </div>

      <Field label="Observações (opcional)">
        <textarea rows={3} style={{ ...inputStyle, resize: 'vertical' }} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
      </Field>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Cliente ativo</div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Desligue pra clientes que já encerraram, sem apagar o histórico.</div>
        </div>
        <Toggle checked={ativo} onChange={setAtivo} />
      </div>

      {error && <div style={{ color: 'var(--negative)', fontSize: 'var(--fs-body)', marginTop: 10, fontWeight: 600 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        {onDelete && (
          <button onClick={onDelete} style={{ ...iconBtnStyle, width: 44, height: 44 }} aria-label="Remover cliente"><Trash2 size={16} /></button>
        )}
        <Button variant="secondary" onClick={onCancel} style={{ flex: 1 }}>Cancelar</Button>
        <Button variant="primary" onClick={submit} style={{ flex: 2 }}>Salvar cliente</Button>
      </div>
    </div>
  );
}

function ReajusteForm({ cliente, indicesReajuste, onSubmit, onCancel }) {
  const [modo, setModo] = useState('indice');
  const [proximoReajuste, setProximoReajuste] = useState(cliente.proximoReajuste || '');
  const [indiceReajusteId, setIndiceReajusteId] = useState(cliente.indiceReajusteId || '');
  const [percentual, setPercentual] = useState(cliente.reajustePercentual != null ? String(cliente.reajustePercentual) : '');
  const [valor, setValor] = useState(cliente.reajusteValor != null ? String(cliente.reajusteValor) : '');
  const [suspensoAte, setSuspensoAte] = useState(cliente.reajusteSuspensoAte || '');
  const [error, setError] = useState('');

  const limiteSuspensao = toISODate(addMonths(new Date(), 12));

  function aplicar(patch) {
    onSubmit({ ...cliente, ...patch });
  }

  function confirmarProximoMes() {
    const base = proximoReajuste ? parseISODate(proximoReajuste) : new Date();
    aplicar({ proximoReajuste: toISODate(addMonths(base, 1)), reajusteConfirmado: true, reajusteSuspensoAte: null });
  }

  function salvar() {
    if (!proximoReajuste) { setError('Informe a data do próximo reajuste.'); return; }
    if (modo === 'percentual' && (!percentual || Number(percentual) <= 0)) { setError('Informe um percentual válido.'); return; }
    if (modo === 'valor' && (!valor || Number(valor) <= 0)) { setError('Informe um valor válido.'); return; }
    if (modo === 'indice' && !indiceReajusteId) { setError('Escolha um índice de reajuste.'); return; }
    setError('');
    aplicar({
      proximoReajuste,
      indiceReajusteId: modo === 'indice' ? indiceReajusteId : cliente.indiceReajusteId,
      reajustePercentual: modo === 'percentual' ? Number(percentual) : null,
      reajusteValor: modo === 'valor' ? Number(valor) : null,
      reajusteSuspensoAte: null,
    });
  }

  function suspender() {
    if (!suspensoAte) { setError('Informe até quando o reajuste fica suspenso.'); return; }
    if (suspensoAte > limiteSuspensao) { setError('A suspensão não pode passar de 1 ano.'); return; }
    if (suspensoAte < toISODate(new Date())) { setError('A data de suspensão precisa ser no futuro.'); return; }
    setError('');
    aplicar({ reajusteSuspensoAte: suspensoAte, reajusteConfirmado: false });
  }

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{cliente.nomeFantasia}</div>
        <div style={{ fontSize: 'var(--fs-body)', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
          Reajuste previsto para {cliente.proximoReajuste ? formatDateBR(cliente.proximoReajuste) : 'data não definida'}
          {cliente.reajusteConfirmado ? ' · já confirmado por você' : ''}
          {cliente.reajusteSuspensoAte ? ` · suspenso até ${formatDateBR(cliente.reajusteSuspensoAte)}` : ''}
        </div>
      </Card>

      <Field label="Data do reajuste">
        <input type="date" value={proximoReajuste} onChange={(e) => { setProximoReajuste(e.target.value); setError(''); }} style={inputStyle} />
      </Field>

      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--ink-soft)', marginBottom: 6 }}>Como calcular</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <Chip active={modo === 'indice'} onClick={() => { setModo('indice'); setError(''); }}>Pelo índice</Chip>
        <Chip active={modo === 'percentual'} onClick={() => { setModo('percentual'); setError(''); }}>Percentual fixo</Chip>
        <Chip active={modo === 'valor'} onClick={() => { setModo('valor'); setError(''); }}>Valor em reais</Chip>
      </div>

      {modo === 'indice' && (
        <Field label="Índice de reajuste" hint="O percentual acumulado do índice é conferido por você na hora de aplicar.">
          <select value={indiceReajusteId} onChange={(e) => { setIndiceReajusteId(e.target.value); setError(''); }} style={inputStyle}>
            <option value="">Escolha um índice</option>
            {(indicesReajuste || []).map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
          </select>
        </Field>
      )}
      {modo === 'percentual' && (
        <Field label="Percentual de reajuste (%)" hint="Substitui o índice neste reajuste.">
          <input type="number" min="0" step="0.01" value={percentual} onChange={(e) => { setPercentual(e.target.value); setError(''); }} style={inputStyle} placeholder="Ex.: 4,5" />
        </Field>
      )}
      {modo === 'valor' && (
        <Field label="Valor do reajuste" hint="Acréscimo fixo em reais, no lugar do percentual.">
          <CurrencyInput value={valor} onChange={(v) => { setValor(v); setError(''); }} style={inputStyle} />
        </Field>
      )}

      {error && <div style={{ color: 'var(--negative)', fontSize: 'var(--fs-body)', marginBottom: 12, fontWeight: 600 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <Button variant="secondary" onClick={onCancel} style={{ flex: 1 }}>Cancelar</Button>
        <Button variant="primary" onClick={salvar} style={{ flex: 2 }}>Salvar reajuste</Button>
      </div>
      <Button variant="secondary" onClick={confirmarProximoMes} style={{ width: '100%', marginBottom: 16 }}>
        <Check size={15} /> Confirmar para o próximo mês
      </Button>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Suspender temporariamente</div>
        <div style={{ fontSize: 'var(--fs-body)', color: 'var(--ink-soft)', marginBottom: 12, lineHeight: 1.5 }}>
          O aviso para de aparecer até a data escolhida e volta sozinho depois. No máximo 1 ano, para o reajuste não sair do radar de vez.
        </div>
        <Field label="Suspender até">
          <input
            type="date"
            value={suspensoAte}
            max={limiteSuspensao}
            min={toISODate(new Date())}
            onChange={(e) => { setSuspensoAte(e.target.value); setError(''); }}
            style={inputStyle}
          />
        </Field>
        <Button variant="secondary" onClick={suspender} style={{ width: '100%' }}>Suspender reajuste</Button>
      </div>
    </div>
  );
}

// Quantos clientes a lista mostra antes de pedir "mostrar mais". A base tem
// centenas de cadastros; jogar todos na tela de uma vez trava a rolagem no
// celular e não ajuda ninguém — quem procura alguém específico usa a busca.
const CLIENTES_POR_PAGINA = 60;

// Só os dígitos: deixa procurar CNPJ do jeito que a pessoa tem em mãos,
// com ou sem ponto e barra.
function soDigitos(v) { return (v || '').replace(/\D/g, ''); }

// O que falta num cadastro de cliente pra ele funcionar de verdade. Não é "todo
// campo vazio é problema": a ordem abaixo é a de quem dói primeiro, e cada item
// diz o que deixa de funcionar sem ele — foi a importação do sistema antigo que
// deixou esses buracos, e é isso que precisa ser fechado à mão.
const FALTAS_CLIENTE = [
  {
    key: 'contato',
    label: 'contato',
    titulo: 'Sem telefone nem e-mail',
    porque: 'sem um contato não dá pra cobrar nem avisar o cliente do reajuste',
    falta: (c) => !(c.contatoTelefone || '').trim() && !(c.contatoEmail || '').trim(),
  },
  {
    key: 'documento',
    label: 'CNPJ/CPF',
    titulo: 'Sem CNPJ ou CPF',
    porque: 'é o que diferencia duas lojas de mesmo nome e o que a nota fiscal exige',
    falta: (c) => !soDigitos(c.documento),
  },
  {
    key: 'ramo',
    label: 'ramo de atividade',
    titulo: 'Sem ramo de atividade',
    porque: 'o filtro por ramo e a análise por segmento ignoram esses clientes',
    falta: (c) => !c.ramoNegocioId,
  },
  {
    key: 'cidade',
    label: 'cidade',
    titulo: 'Sem cidade',
    porque: 'sem cidade não dá pra ver onde a carteira está concentrada',
    falta: (c) => !(c.cidade || '').trim(),
  },
  {
    key: 'reajuste',
    label: 'data de reajuste',
    titulo: 'Sem data de reajuste',
    porque: 'o aviso anual de reajuste nunca dispara para esses clientes',
    falta: (c) => !c.proximoReajuste,
  },
  {
    key: 'razao',
    label: 'razão social',
    titulo: 'Sem razão social',
    porque: 'é o nome que vai no contrato e na nota, diferente do nome fantasia',
    falta: (c) => !(c.razaoSocial || '').trim(),
  },
];

function faltasDoCliente(c) { return FALTAS_CLIENTE.filter((f) => f.falta(c)); }

/* -------------------------------------------------------------------------
   ORIENTAÇÃO DE LANÇAMENTO

   O usuário não é contador. Em vez de exigir que ele aprenda plano de contas,
   o sistema aprende com o que ele já lançou: 3.420 despesas históricas dizem
   em que categoria cada fornecedor costuma cair e se aquele gasto é fixo ou
   variável. Na hora de lançar, isso volta como sugestão — nunca preenchido
   sozinho sem avisar, pra ele não gravar algo que não conferiu.
   ------------------------------------------------------------------------- */

// O que o histórico diz sobre um fornecedor: categoria mais usada, quantas
// vezes, se costuma ser custo fixo, e o valor típico (mediana, que não é
// distorcida por um lançamento fora do padrão como a média seria).
function historicoDoFornecedor(transactions, nomeFornecedor) {
  const chave = (nomeFornecedor || '').trim().toLowerCase();
  if (!chave) return null;
  const iguais = transactions.filter((t) => t.tipo === 'despesa' && (t.clienteNome || '').trim().toLowerCase() === chave);
  if (iguais.length === 0) return null;

  const porCategoria = new Map();
  let fixas = 0;
  let variaveis = 0;
  iguais.forEach((t) => {
    if (t.categoriaId) porCategoria.set(t.categoriaId, (porCategoria.get(t.categoriaId) || 0) + 1);
    if (t.despesaFixa === true) fixas += 1;
    if (t.despesaFixa === false) variaveis += 1;
  });
  const [categoriaId, vezes] = [...porCategoria.entries()].sort((a, b) => b[1] - a[1])[0] || [null, 0];

  const valores = iguais.map((t) => t.valor).sort((a, b) => a - b);
  const meio = Math.floor(valores.length / 2);
  const valorTipico = valores.length % 2 ? valores[meio] : round2((valores[meio - 1] + valores[meio]) / 2);

  return {
    lancamentos: iguais.length,
    categoriaId,
    vezesNaCategoria: vezes,
    fixaSugerida: fixas === 0 && variaveis === 0 ? null : fixas >= variaveis,
    valorTipico,
    ultimo: iguais.map((t) => t.data).sort().pop() || null,
  };
}

// Avisos de boa prática na hora de lançar uma despesa. Cada um existe porque
// erra-se de verdade nesse ponto e o erro distorce um número que o dono olha.
function avisosDaDespesa(draft, categoria, historico) {
  const avisos = [];
  const valor = parseFloat(draft.valor) || 0;
  const descricao = `${draft.descricao || ''} ${draft.clienteNome || ''}`.toLowerCase();

  if (valor > 0 && valor <= 1) {
    avisos.push({
      tom: 'danger',
      texto: 'Valor de centavos. Confira: a base já tem lançamentos de R$ 0,01 que entraram por erro de digitação e ficaram anos cobrando o valor errado.',
    });
  }

  if (historico && historico.valorTipico > 0 && valor > 0) {
    const razao = valor / historico.valorTipico;
    if (razao >= 3 || razao <= 1 / 3) {
      avisos.push({
        tom: 'warning',
        texto: `Este fornecedor costuma ser ${formatCurrency(historico.valorTipico)} (${historico.lancamentos} lançamento(s) anteriores). O valor digitado está bem fora disso — confira se não faltou ou sobrou um zero.`,
      });
    }
  }

  // Retirada de sócio, empréstimo e compra de bem não são despesa operacional:
  // jogados no meio das outras, fazem a margem parecer pior do que é.
  if (/(retirada|pr[óo]-?labore|prolabore|dividendo|distribui[çc][ãa]o de lucro|s[óo]cio)/.test(descricao)) {
    avisos.push({
      tom: 'info',
      texto: 'Parece retirada de sócio. Vale ter uma categoria só pra isso: não é custo de operar a empresa, e misturada com as outras despesas ela faz o resultado operacional parecer pior do que é.',
    });
  }
  if (/(empr[ée]stimo|financiamento|parcela do banco|consignado)/.test(descricao)) {
    avisos.push({
      tom: 'info',
      texto: 'Parece parcela de empréstimo ou financiamento. O ideal é separar em duas categorias: os juros são despesa do mês, a parte que abate a dívida não é.',
    });
  }
  if (/(equipamento|computador|notebook|m[óo]vel|m[óo]veis|ve[íi]culo|carro novo|reforma|obra)/.test(descricao) && valor >= 1000) {
    avisos.push({
      tom: 'info',
      texto: 'Parece compra de bem (equipamento, veículo, reforma). Lançar de uma vez faz o mês parecer muito pior. Se o bem vai durar anos, o mais correto é registrar como investimento em categoria própria.',
    });
  }
  if (/(casa|pessoal|particular|fam[íi]lia|supermercado do m[êe]s)/.test(descricao)) {
    avisos.push({
      tom: 'info',
      texto: 'Isso parece gasto pessoal. Se for, mantenha numa categoria separada das despesas da empresa — senão o custo do negócio fica inflado e a decisão sai errada.',
    });
  }

  if (!draft.categoriaId) {
    avisos.push({ tom: 'warning', texto: 'Escolha uma categoria: é ela que responde "para onde meu dinheiro foi" em todos os relatórios.' });
  }
  if (!(draft.clienteNome || '').trim()) {
    avisos.push({ tom: 'warning', texto: 'Informe o fornecedor. Sem ele, essa despesa não entra na conta de quanto você paga para cada um.' });
  }
  if (draft.pago === false && !draft.dataVencimento) {
    avisos.push({ tom: 'warning', texto: 'Conta em aberto sem data de vencimento não aparece no aviso de contas a pagar.' });
  }
  if (categoria && categoria.tipo === 'receita') {
    avisos.push({ tom: 'danger', texto: 'A categoria escolhida é de receita, mas o lançamento é de despesa. Isso troca o sinal do valor nos relatórios.' });
  }

  return avisos;
}

function ClientesPage({ data, role, persist, askConfirm }) {
  const [busca, setBusca] = useState('');
  const [filterRamo, setFilterRamo] = useState('todos');
  const [filterProduto, setFilterProduto] = useState('todos');
  const [filterAtivo, setFilterAtivo] = useState('ativos');
  const [filterEstado, setFilterEstado] = useState('todos');
  const [limite, setLimite] = useState(CLIENTES_POR_PAGINA);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [gerenciandoReajuste, setGerenciandoReajuste] = useState(null);
  const [filterFalta, setFilterFalta] = useState('todos');

  const clientes = data.clientes || [];
  const ramosNegocio = data.ramosNegocio || [];
  const indicesReajuste = data.indicesReajuste || [];
  const categoriasReceita = data.categories.filter((c) => c.tipo === 'receita');

  // Mapa de faltas por cliente, calculado uma vez: alimenta o aviso do topo, os
  // filtros e a linha de cada cliente.
  const faltasPorCliente = useMemo(() => {
    const m = new Map();
    clientes.forEach((c) => { const f = faltasDoCliente(c); if (f.length) m.set(c.id, f); });
    return m;
  }, [clientes]);
  const resumoFaltas = FALTAS_CLIENTE
    .map((f) => ({ ...f, quantos: clientes.filter((c) => f.falta(c)).length }))
    .filter((f) => f.quantos > 0);
  const totalIncompletos = faltasPorCliente.size;

  // Quais categorias/produtos cada cliente já comprou — cruzado pelo nome
  // (não existe vínculo por id entre venda e cadastro de cliente ainda).
  const produtosPorCliente = new Map();
  data.transactions.forEach((t) => {
    if (t.tipo !== 'receita' || !t.clienteNome) return;
    const chave = t.clienteNome.trim().toLowerCase();
    if (!produtosPorCliente.has(chave)) produtosPorCliente.set(chave, new Set());
    if (t.categoriaId) produtosPorCliente.get(chave).add(t.categoriaId);
  });

  // Estados presentes na base, pra oferecer só UF que existe de verdade.
  const estados = [...new Set(clientes.map((c) => c.estado).filter(Boolean))].sort();

  const termo = busca.trim().toLowerCase();
  const termoDigitos = soDigitos(busca);
  let list = clientes.filter((c) => {
    if (filterAtivo === 'ativos' && c.ativo === false) return false;
    if (filterAtivo === 'inativos' && c.ativo !== false) return false;
    if (filterRamo !== 'todos' && c.ramoNegocioId !== filterRamo) return false;
    if (filterEstado !== 'todos' && c.estado !== filterEstado) return false;
    if (filterProduto !== 'todos') {
      const produtos = produtosPorCliente.get((c.nomeFantasia || '').trim().toLowerCase());
      if (!produtos || !produtos.has(filterProduto)) return false;
    }
    if (filterFalta === 'incompletos' && !faltasPorCliente.has(c.id)) return false;
    if (filterFalta !== 'todos' && filterFalta !== 'incompletos') {
      const f = FALTAS_CLIENTE.find((x) => x.key === filterFalta);
      if (f && !f.falta(c)) return false;
    }
    if (termo) {
      // Se o que foi digitado tem 3+ dígitos, também vale como busca de
      // CNPJ/CPF — senão "10" acharia todo cliente com 10 no endereço.
      const porDocumento = termoDigitos.length >= 3 && soDigitos(c.documento).includes(termoDigitos);
      const alvo = `${c.nomeFantasia} ${c.razaoSocial} ${c.organizacaoRede} ${c.cidade}`.toLowerCase();
      if (!alvo.includes(termo) && !porDocumento) return false;
    }
    return true;
  });
  list = [...list].sort((a, b) => (a.nomeFantasia || '').localeCompare(b.nomeFantasia || ''));
  const visiveis = list.slice(0, limite);
  const totalConsiderado = clientes.filter((c) => (filterAtivo === 'ativos' ? c.ativo !== false : filterAtivo === 'inativos' ? c.ativo === false : true)).length;
  const filtrando = list.length !== totalConsiderado;

  const reajustePendente = role === 'admin' ? clientesComReajustePendente(clientes) : [];

  // Mexeu na busca ou num filtro, a lista volta pro começo — senão a pessoa
  // filtra e continua vendo "mostrar mais" de um resultado que já cabe todo.
  useEffect(() => { setLimite(CLIENTES_POR_PAGINA); }, [busca, filterRamo, filterProduto, filterAtivo, filterEstado, filterFalta]);

  function save(cliente) {
    const list2 = editing ? clientes.map((c) => (c.id === cliente.id ? cliente : c)) : [...clientes, cliente];
    persist({ ...data, clientes: list2 });
    setShowForm(false);
    setEditing(null);
  }
  function remove(id) {
    askConfirm('Remover este cliente? O histórico de vendas não é apagado.', () => {
      persist({ ...data, clientes: clientes.filter((c) => c.id !== id) });
      setShowForm(false);
      setEditing(null);
    });
  }
  // Reajuste aplicado: joga a próxima data 12 meses pra frente e limpa os
  // ajustes daquele ciclo (percentual/valor específico e a confirmação),
  // porque eles valiam só pro reajuste que acabou de acontecer.
  function marcarReajustado(cliente) {
    const proximo = toISODate(addMonths(parseISODate(cliente.proximoReajuste), 12));
    const atualizado = { ...cliente, proximoReajuste: proximo, reajusteConfirmado: false, reajustePercentual: null, reajusteValor: null, reajusteSuspensoAte: null };
    persist({ ...data, clientes: clientes.map((c) => (c.id === cliente.id ? atualizado : c)) });
  }
  function salvarReajuste(cliente) {
    persist({ ...data, clientes: clientes.map((c) => (c.id === cliente.id ? cliente : c)) });
    setGerenciandoReajuste(null);
  }

  return (
    <div style={{ paddingTop: 12 }}>
      {reajustePendente.length > 0 && (
        <Card style={{ marginBottom: 14, borderColor: 'var(--warning)', background: 'var(--warning-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: 'var(--warning-strong)' }}>
            <Clock size={16} /> {reajustePendente.length} cliente(s) com reajuste de contrato próximo ou atrasado
          </div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {reajustePendente.slice(0, 6).map((c) => {
              const indice = indicesReajuste.find((i) => i.id === c.indiceReajusteId);
              return (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--fs-body)', color: 'var(--warning-strong)', gap: 8 }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.nomeFantasia} · {c.reajustePercentual != null ? `${c.reajustePercentual}%` : c.reajusteValor != null ? formatCurrency(c.reajusteValor) : (indice?.nome || 'sem índice')} · {c.atrasado ? 'atrasado desde' : 'em'} {formatDateBR(c.proximoReajuste)}
                    {c.reajusteConfirmado ? ' · confirmado' : ''}
                  </span>
                  <span style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                    <button onClick={() => setGerenciandoReajuste(c)} style={{ background: 'none', border: 'none', color: 'var(--primary-text)', fontWeight: 700, fontSize: 'var(--fs-small)', cursor: 'pointer', textDecoration: 'underline' }}>
                      Gerenciar
                    </button>
                    <button onClick={() => marcarReajustado(c)} style={{ background: 'none', border: 'none', color: 'var(--primary-text)', fontWeight: 700, fontSize: 'var(--fs-small)', cursor: 'pointer', textDecoration: 'underline' }}>
                      Já reajustei
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Cadastro incompleto: a importação do sistema antigo não trouxe contato,
          ramo, cidade nem data de reajuste de todo mundo. Cada linha aqui é um
          buraco e um clique que já filtra a lista pra fechar aquele buraco —
          sem isso o admin teria que abrir 869 cadastros pra descobrir o que
          falta. É função permanente, não mutirão de importação: cliente novo
          cadastrado sem contato cai aqui do mesmo jeito. */}
      {role === 'admin' && totalIncompletos > 0 && (
        <Card style={{ marginBottom: 14, borderColor: 'var(--warning)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 'var(--fs-title)' }}>
                <FileText size={17} style={{ color: 'var(--warning-strong)', flexShrink: 0 }} />
                {totalIncompletos} de {clientes.length} cadastros incompletos
              </div>
              <div style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-soft)', marginTop: 3, lineHeight: 1.5 }}>
                Clique em um item para ver só os clientes que precisam daquele ajuste. Abrir o cliente já leva ao formulário.
              </div>
            </div>
            {filterFalta !== 'todos' && (
              <Button variant="secondary" onClick={() => setFilterFalta('todos')} style={{ flexShrink: 0 }}>Limpar filtro</Button>
            )}
          </div>

          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {resumoFaltas.map((f) => {
              const ativo = filterFalta === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilterFalta(ativo ? 'todos' : f.key)}
                  aria-pressed={ativo}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    padding: '10px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    border: ativo ? '1px solid var(--warning)' : '1px solid transparent',
                    background: ativo ? 'var(--warning-light)' : 'transparent',
                    color: 'var(--ink)',
                  }}
                  onMouseEnter={(e) => { if (!ativo) e.currentTarget.style.background = 'var(--surface-2)'; }}
                  onMouseLeave={(e) => { if (!ativo) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ minWidth: 54, fontWeight: 800, fontSize: 15, color: 'var(--warning-strong)', flexShrink: 0 }}>{f.quantos}</span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: 13 }}>{f.titulo}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.45 }}>{f.porque}</span>
                  </span>
                  <ChevronRight size={16} style={{ color: 'var(--ink-soft)', flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        </Card>
      )}

      <SearchInput value={busca} onChange={setBusca} placeholder="Buscar por nome, razão social, cidade ou CNPJ…" />

      <FilterGroup label="Situação">
        <Chip active={filterAtivo === 'ativos'} onClick={() => setFilterAtivo('ativos')}>Ativos</Chip>
        <Chip active={filterAtivo === 'inativos'} onClick={() => setFilterAtivo('inativos')}>Inativos</Chip>
        <Chip active={filterAtivo === 'todos'} onClick={() => setFilterAtivo('todos')}>Todos</Chip>
      </FilterGroup>

      {role === 'admin' && totalIncompletos > 0 && (
        <FilterGroup label="Cadastro">
          <Chip active={filterFalta === 'todos'} onClick={() => setFilterFalta('todos')}>Todos</Chip>
          <Chip active={filterFalta === 'incompletos'} onClick={() => setFilterFalta('incompletos')}>Incompletos ({totalIncompletos})</Chip>
          {resumoFaltas.map((f) => (
            <Chip key={f.key} active={filterFalta === f.key} onClick={() => setFilterFalta(f.key)}>Sem {f.label} ({f.quantos})</Chip>
          ))}
        </FilterGroup>
      )}

      <FilterGroup label={ramosNegocio.length > 0 ? 'Ramo, produto e estado' : 'Produto e estado'}>
        {/* O seletor de ramo só aparece quando existe ramo cadastrado. Sem
            isso ele fica na tela como um filtro que nunca filtra nada. */}
        {ramosNegocio.length > 0 && (
          <select value={filterRamo} onChange={(e) => setFilterRamo(e.target.value)} style={{ ...inputStyle, flex: '1 1 160px', width: 'auto' }}>
            <option value="todos">Todos os ramos</option>
            {ramosNegocio.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
        )}
        <select value={filterProduto} onChange={(e) => setFilterProduto(e.target.value)} style={{ ...inputStyle, flex: '1 1 160px', width: 'auto' }}>
          <option value="todos">Todos os produtos</option>
          {categoriasReceita.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        {estados.length > 1 && (
          <select value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)} style={{ ...inputStyle, flex: '0 1 120px', width: 'auto' }}>
            <option value="todos">Todos os estados</option>
            {estados.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
          </select>
        )}
      </FilterGroup>

      <div style={{ margin: '4px 2px 10px', fontSize: 'var(--fs-small)', color: 'var(--ink-soft)' }}>
        {filtrando
          ? `${list.length} de ${totalConsiderado} cliente(s)`
          : `${list.length} cliente(s)`}
        {list.length > visiveis.length ? ` · mostrando os ${visiveis.length} primeiros` : ''}
      </div>

      {list.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum cliente encontrado" desc="Ajuste os filtros ou cadastre um novo cliente." actionLabel={role === 'admin' ? '+ Novo cliente' : undefined} onAction={role === 'admin' ? () => { setEditing(null); setShowForm(true); } : undefined} />
      ) : (
        <Card style={{ padding: 0 }}>
          {visiveis.map((c, i) => {
            const ramo = ramosNegocio.find((r) => r.id === c.ramoNegocioId);
            // O documento entra na linha de apoio porque a base tem redes com
            // várias lojas de mesmo nome fantasia (Lojas Junitex, Brasil
            // Supermercados...) — sem o CNPJ as linhas ficam idênticas.
            const linha2 = [c.organizacaoRede || c.razaoSocial, [c.cidade, c.estado].filter(Boolean).join('/'), ramo?.nome, c.documento].filter(Boolean).join(' · ');
            return (
              <div
                key={c.id}
                onClick={role === 'admin' ? () => { setEditing(c); setShowForm(true); } : undefined}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: i === visiveis.length - 1 ? 'none' : '1px solid var(--border)', cursor: role === 'admin' ? 'pointer' : 'default' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nomeFantasia}</span>
                    {c.ativo === false && <span style={{ fontSize: 'var(--fs-micro)', fontWeight: 700, color: 'var(--ink-soft)', background: 'var(--surface-2)', borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>Inativo</span>}
                  </div>
                  {linha2 && <div style={{ fontSize: 12, color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linha2}</div>}
                  {(c.contatoTelefone || c.contatoEmail) && (
                    <div style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-soft)', marginTop: 2 }}>{[c.contatoTelefone, c.contatoEmail].filter(Boolean).join(' · ')}</div>
                  )}
                  {/* O que falta neste cadastro, na própria linha: assim o admin
                      vê o buraco sem abrir o cliente. */}
                  {role === 'admin' && faltasPorCliente.has(c.id) && (
                    <div style={{ fontSize: 'var(--fs-small)', color: 'var(--warning-strong)', marginTop: 3, fontWeight: 600 }}>
                      Falta: {faltasPorCliente.get(c.id).map((f) => f.label).join(', ')}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {list.length > visiveis.length && (
        <Button variant="secondary" onClick={() => setLimite((n) => n + CLIENTES_POR_PAGINA)} style={{ width: '100%', marginTop: 12 }}>
          Mostrar mais {Math.min(CLIENTES_POR_PAGINA, list.length - visiveis.length)} de {list.length - visiveis.length} restantes
        </Button>
      )}

      {role === 'admin' && list.length > 0 && (
        <Button variant="primary" onClick={() => { setEditing(null); setShowForm(true); }} style={{ width: '100%', marginTop: 16 }}>
          <Plus size={16} /> Novo cliente
        </Button>
      )}

      {showForm && (
        <Modal title={editing ? 'Editar cliente' : 'Novo cliente'} onClose={() => { setShowForm(false); setEditing(null); }}>
          <ClienteForm
            item={editing}
            ramosNegocio={ramosNegocio}
            indicesReajuste={indicesReajuste}
            onSubmit={save}
            onCancel={() => { setShowForm(false); setEditing(null); }}
            onDelete={editing ? () => remove(editing.id) : null}
          />
        </Modal>
      )}

      {gerenciandoReajuste && (
        <Modal title="Gerenciar reajuste" onClose={() => setGerenciandoReajuste(null)}>
          <ReajusteForm
            cliente={gerenciandoReajuste}
            indicesReajuste={indicesReajuste}
            onSubmit={salvarReajuste}
            onCancel={() => setGerenciandoReajuste(null)}
          />
        </Modal>
      )}
    </div>
  );
}

/* =========================================================================
   PÁGINA: VENCIMENTOS
   ========================================================================= */

function VencimentosPage({ data, onConfirmarRecebimento, onEditTransaction }) {
  const [busca, setBusca] = useState('');
  const [filterUrgencia, setFilterUrgencia] = useState('todos');

  const todasLinhas = buildRelatorioVencimentos(data.transactions);
  const termo = busca.trim().toLowerCase();

  const parados = contratosParados(todasLinhas);
  const idsParados = new Set(parados.map((l) => l.id));

  const linhas = todasLinhas.filter((l) => {
    if (termo && !(l.clienteNome || '').toLowerCase().includes(termo)) return false;
    if (filterUrgencia === 'parados') return idsParados.has(l.id);
    const urgencia = urgenciaAtraso(l.diasAtraso);
    if (filterUrgencia === 'criticos' && urgencia?.tone !== 'danger') return false;
    if (filterUrgencia === 'atencao' && urgencia?.tone !== 'warning') return false;
    return true;
  });

  const qtdCriticos = todasLinhas.filter((l) => urgenciaAtraso(l.diasAtraso)?.tone === 'danger').length;
  const qtdAtencao = todasLinhas.filter((l) => urgenciaAtraso(l.diasAtraso)?.tone === 'warning').length;
  const qtdEmDia = todasLinhas.length - qtdCriticos - qtdAtencao;
  const valorParado = round2(parados.reduce((s, l) => s + l.valor, 0));

  return (
    <div style={{ paddingTop: 12 }}>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 14, lineHeight: 1.5 }}>
        Cada recorrência ativa entra pelo ciclo do mês atual (dia de vencimento = dia da data original do contrato). Sem confirmação de recebimento desde esse dia, o atraso conta e a urgência sobe — é um sinal pro seu acompanhamento, o app não concilia banco automaticamente.
      </p>

      {/* Contrato parado é o problema mais caro desta tela e o mais fácil de
          passar batido: no atraso do ciclo ele aparece com os mesmos poucos dias
          de quem só atrasou essa semana. Por isso ganha aviso próprio no topo. */}
      {parados.length > 0 && (
        <Card style={{ marginBottom: 14, borderColor: 'var(--negative)', background: 'var(--negative-soft)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: 'var(--negative)' }}>
            <Clock size={16} /> {parados.length} contrato(s) ativo(s) sem receber há {MESES_PARA_CONTRATO_PARADO} meses ou mais — {formatCurrency(valorParado)} por mês
          </div>
          <div style={{ fontSize: 'var(--fs-small)', color: 'var(--negative)', marginTop: 6, lineHeight: 1.5 }}>
            Estão contando como receita recorrente ativa. Ou o pagamento parou e o contrato precisa ser cancelado, ou é cobrança a fazer.
          </div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {parados.slice(0, 8).map((l) => (
              <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 'var(--fs-body)', color: 'var(--negative)' }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.clienteNome || l.descricao || 'Sem cliente'} · último pagamento {formatDateBR(l.ultimoPagamento)}
                </span>
                <span style={{ flexShrink: 0, fontWeight: 700 }}>{l.mesesParado} meses · {formatCurrency(l.valor)}</span>
              </div>
            ))}
            {parados.length > 8 && (
              <button onClick={() => setFilterUrgencia('parados')} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--negative)', fontWeight: 700, fontSize: 'var(--fs-small)', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                Ver todos os {parados.length}
              </button>
            )}
          </div>
        </Card>
      )}

      <div className="lomuz-kpi-grid" style={{ marginBottom: 14 }}>
        <StatCard title="Parado" value={String(parados.length)} icon={Clock} tone={parados.length > 0 ? 'danger' : 'success'} footer={`sem receber há ${MESES_PARA_CONTRATO_PARADO}+ meses`} />
        <StatCard title="Crítico" value={String(qtdCriticos)} icon={Clock} tone={qtdCriticos > 0 ? 'danger' : 'neutral'} footer="mais de 10 dias em atraso" />
        <StatCard title="Atenção" value={String(qtdAtencao)} icon={Clock} tone={qtdAtencao > 0 ? 'warning' : 'neutral'} footer="até 10 dias em atraso" />
        <StatCard title="Em dia" value={String(qtdEmDia)} icon={Check} tone="success" footer="vencimento confirmado ou ainda não chegou" />
      </div>

      <SearchInput value={busca} onChange={setBusca} placeholder="Buscar por cliente…" />

      <FilterGroup label="Urgência">
        <Chip active={filterUrgencia === 'todos'} onClick={() => setFilterUrgencia('todos')}>Todos</Chip>
        <Chip active={filterUrgencia === 'parados'} onClick={() => setFilterUrgencia('parados')}>Parados ({parados.length})</Chip>
        <Chip active={filterUrgencia === 'criticos'} onClick={() => setFilterUrgencia('criticos')}>Críticos</Chip>
        <Chip active={filterUrgencia === 'atencao'} onClick={() => setFilterUrgencia('atencao')}>Atenção</Chip>
      </FilterGroup>

      {linhas.length === 0 ? (
        <EmptyState icon={Clock} title="Nada por aqui" desc="Nenhum vencimento encontrado com esse filtro." />
      ) : (
        <Card style={{ padding: 0 }}>
          {linhas.map((l, i) => {
            const urgencia = urgenciaAtraso(l.diasAtraso);
            return (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: i === linhas.length - 1 ? 'none' : '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {l.clienteNome || l.descricao || 'Sem cliente'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {l.descricao || (l.tipo === 'receita' ? 'Receita' : 'Despesa')} · vence {formatDateBR(l.vencimento)}{l.recorrente ? ' · recorrente' : ''}
                    {l.ultimoPagamento ? ` · último pagamento ${formatDateBR(l.ultimoPagamento)}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: l.tipo === 'receita' ? 'var(--success)' : 'var(--negative)' }}>{formatCurrency(l.valor)}</div>
                  {idsParados.has(l.id) ? (
                    <StatusBadge tone="danger">Parado · {l.mesesParado} meses</StatusBadge>
                  ) : urgencia ? (
                    <StatusBadge tone={urgencia.tone}>{urgencia.label} · {l.diasAtraso}d</StatusBadge>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Em dia</span>
                  )}
                </div>
                {l.recorrente ? (
                  <button
                    onClick={() => onConfirmarRecebimento(l)}
                    title="Confirmar recebimento deste ciclo"
                    style={{ ...iconBtnStyle, flexShrink: 0 }}
                  >
                    <Check size={15} />
                  </button>
                ) : (
                  <button
                    onClick={() => onEditTransaction(data.transactions.find((t) => t.id === l.id))}
                    title="Abrir lançamento"
                    style={{ ...iconBtnStyle, flexShrink: 0 }}
                  >
                    <Edit2 size={15} />
                  </button>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

/* =========================================================================
   PÁGINA: RELATÓRIOS
   Vencimentos entrou aqui como uma aba em vez de virar a 8ª seção do menu: o
   cabeçalho do desktop e a barra do celular comportam 7 seções, e vencimento
   é relatório do mesmo jeito que os outros. Assim a decisão de não ter menu
   lateral segue valendo.
   ========================================================================= */

const RELATORIOS_TABS = [
  { key: 'resultado', label: 'Resultado mês a mês' },
  { key: 'despesas', label: 'Despesas' },
  { key: 'receita', label: 'Receita' },
  { key: 'contratos', label: 'Contratos recorrentes' },
  { key: 'vencimentos', label: 'Vencimentos' },
];

function RelatoriosTabNav({ subTab, setSubTab }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      {RELATORIOS_TABS.map((t) => (
        <Chip key={t.key} active={subTab === t.key} onClick={() => setSubTab(t.key)}>{t.label}</Chip>
      ))}
    </div>
  );
}

// Tabela de relatório: rolagem horizontal só dentro do bloco (a página nunca
// rola de lado), totais no pé e um botão que baixa exatamente as linhas que
// estão na tela — mais as que ficaram fora do limite de exibição, quando houver.
function RelatorioTabela({ titulo, desc, colunas, linhas, rodape, onBaixar, vazioTexto }) {
  const cell = (align) => ({
    padding: '10px 14px', textAlign: align || 'left', whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--border)',
  });
  return (
    <Card style={{ padding: 0, marginBottom: 18 }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 240px' }}>
          <div style={{ fontWeight: 800, fontSize: 'var(--fs-title)' }}>{titulo}</div>
          {desc && <div style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-soft)', marginTop: 3, lineHeight: 1.5 }}>{desc}</div>}
        </div>
        {onBaixar && linhas.length > 0 && (
          <Button variant="secondary" onClick={onBaixar} style={{ flexShrink: 0 }}>
            <Download size={15} /> Baixar CSV
          </Button>
        )}
      </div>

      {linhas.length === 0 ? (
        <div style={{ padding: '20px 16px', fontSize: 'var(--fs-body)', color: 'var(--ink-soft)' }}>
          {vazioTexto || 'Nada lançado no período escolhido.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {colunas.map((c) => (
                  <th key={c.label} style={{ ...cell(c.align), fontSize: 'var(--fs-micro)', textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--ink-soft)', fontWeight: 700, background: 'var(--surface-2)' }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={l.chave ?? i}>
                  {l.celulas.map((v, j) => (
                    <td key={colunas[j].label} style={{ ...cell(colunas[j].align), fontWeight: j === 0 ? 600 : 400, color: l.tom || 'inherit' }}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
            {rodape && (
              <tfoot>
                <tr>
                  {rodape.map((v, j) => (
                    <td key={colunas[j].label} style={{ ...cell(colunas[j].align), borderBottom: 'none', fontWeight: 800, background: 'var(--surface-2)' }}>{v}</td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </Card>
  );
}

const LIMITE_LINHAS_RELATORIO = 30;

function RelatoriosPage({ data, subTab, setSubTab, onConfirmarRecebimento, onEditTransaction }) {
  // Últimos 12 meses como padrão: é a janela que responde "como foi o ano",
  // sem depender de o mês atual já ter movimento.
  const [period, setPeriod] = useState({ type: 'ultimos_12', start: '', end: '' });
  const [verTudoCliente, setVerTudoCliente] = useState(false);
  const [verTudoFornecedor, setVerTudoFornecedor] = useState(false);

  const txs = data.transactions;
  const fornecedores = data.fornecedores || [];

  const calc = useMemo(() => {
    // O relatório usa o período inteiro, igual ao painel: escolhendo o ano
    // corrente ele vai de janeiro a dezembro, com o realizado nos meses que já
    // passaram e a projeção dos contratos recorrentes nos que faltam. Assim o
    // mesmo mês dá o mesmo número nas duas telas. O que não pode faltar é dizer
    // quais meses são projeção — daí o marcador "previsto" e o aviso no topo.
    const r = getPeriodRange(period);
    const incluiFuturo = r.end > endOfMonth(new Date());
    const mesAtualKey = monthKey(new Date());
    const nomeCategoria = (id) => data.categories.find((c) => c.id === id)?.nome || 'Sem categoria';
    const nomeFornecedor = (id) => fornecedores.find((f) => f.id === id)?.nome || 'Sem fornecedor informado';

    const meses = buildPeriodMonthlyRows(txs, r).map((m) => ({
      ...m,
      margem: m.receitas > 0 ? (m.saldo / m.receitas) * 100 : null,
      // Mês corrente não é previsão — ele já está acontecendo.
      previsto: m.key > mesAtualKey,
    }));
    const totalReceita = round2(meses.reduce((s, m) => s + m.receitas, 0));
    const totalDespesa = round2(meses.reduce((s, m) => s + m.despesas, 0));

    const despCategoria = sumByKey(txs, 'despesa', r.start, r.end, (t) => t.categoriaId);
    const despFornecedor = sumByKey(txs, 'despesa', r.start, r.end, (t) => t.fornecedorId || '__sem__');
    const despTipoCusto = sumByKey(txs, 'despesa', r.start, r.end, (t) => (t.despesaFixa === true ? 'fixa' : t.despesaFixa === false ? 'variavel' : 'nao_classificada'));
    const recCategoria = sumByKey(txs, 'receita', r.start, r.end, (t) => t.categoriaId);
    const recCliente = sumByKey(txs, 'receita', r.start, r.end, (t) => (t.clienteNome || '').trim() || '__sem__');

    // Crescimento por produto: compara o período escolhido com a janela
    // imediatamente anterior do mesmo tamanho (a mesma base que os cartões do
    // painel usam no "vs período anterior"). É conta de tendência, não previsão
    // de modelo: ordena pela diferença em reais, porque um produto que saiu de
    // R$ 10 pra R$ 30 cresce 200% e não muda o caixa.
    const anterior = getPreviousPeriodRange(period);
    const recCategoriaAnterior = sumByKey(txs, 'receita', anterior.start, anterior.end, (t) => t.categoriaId);
    const antesPorCat = new Map(recCategoriaAnterior.rows.map((x) => [x.chave, x.valor]));
    const chavesCrescimento = new Set([...recCategoria.rows.map((x) => x.chave), ...recCategoriaAnterior.rows.map((x) => x.chave)]);
    const crescimento = [...chavesCrescimento].map((chave) => {
      const agora = recCategoria.rows.find((x) => x.chave === chave)?.valor || 0;
      const antes = antesPorCat.get(chave) || 0;
      return {
        chave, agora, antes,
        diferenca: round2(agora - antes),
        variacao: antes > 0 ? ((agora - antes) / antes) * 100 : null,
        novo: antes === 0 && agora > 0,
        sumiu: agora === 0 && antes > 0,
      };
    }).sort((a, b) => b.diferenca - a.diferenca);

    // Contratos recorrentes. MRR = quanto entra por mês se nada mudar; semanal e
    // anual são normalizados pra mês para poderem somar na mesma linha (hoje a
    // base só tem mensal, mas o cálculo não depende disso).
    const porMes = (t) => (t.frequencia === 'semanal' ? t.valor * (52 / 12) : t.frequencia === 'anual' ? t.valor / 12 : t.valor);
    const recorrentes = txs.filter((t) => t.tipo === 'receita' && t.recorrente && t.status === 'aprovado');
    const ativos = recorrentes.filter((t) => getRecurrenceStatus(t) === 'ativo');
    const mrr = round2(ativos.reduce((s, t) => s + porMes(t), 0));

    const novosNoPeriodo = recorrentes.filter((t) => { const d = parseISODate(t.data); return d >= r.start && d <= r.end; });
    const canceladosNoPeriodo = recorrentes.filter((t) => {
      if (!t.dataCancelamento) return false;
      const d = parseISODate(t.dataCancelamento);
      return d >= r.start && d <= r.end;
    });
    // Base do cálculo de cancelamento: contratos que já estavam valendo quando o
    // período começou. Sem essa base, "10 cancelamentos" não diz se é muito ou
    // pouco.
    const baseInicio = recorrentes.filter((t) => {
      if (parseISODate(t.data) > r.start) return false;
      return !t.dataCancelamento || parseISODate(t.dataCancelamento) >= r.start;
    });
    const taxaCancelamento = baseInicio.length > 0 ? (canceladosNoPeriodo.length / baseInicio.length) * 100 : null;

    const contratosPorMes = [];
    let cursor = startOfMonth(r.start);
    let safety = 0;
    while (cursor <= r.end && safety < 240) {
      const ms = cursor > r.start ? cursor : r.start;
      const fimMes = endOfMonth(cursor);
      const me = fimMes < r.end ? fimMes : r.end;
      const novos = recorrentes.filter((t) => { const d = parseISODate(t.data); return d >= ms && d <= me; });
      const cancel = recorrentes.filter((t) => { if (!t.dataCancelamento) return false; const d = parseISODate(t.dataCancelamento); return d >= ms && d <= me; });
      contratosPorMes.push({
        key: monthKey(cursor), label: mesAnoLabel(cursor),
        novos: novos.length, cancelados: cancel.length,
        mrrNovo: round2(novos.reduce((s, t) => s + porMes(t), 0)),
        mrrPerdido: round2(cancel.reduce((s, t) => s + porMes(t), 0)),
      });
      cursor = addMonths(cursor, 1);
      safety += 1;
    }

    return {
      r, incluiFuturo, meses, totalReceita, totalDespesa,
      nomeCategoria, nomeFornecedor,
      despCategoria, despFornecedor, despTipoCusto, recCategoria, recCliente,
      anterior, crescimento,
      mrr, ativos: ativos.length, totalRecorrentes: recorrentes.length,
      novosNoPeriodo, canceladosNoPeriodo, baseInicio, taxaCancelamento, contratosPorMes,
    };
  }, [txs, period, data.categories, fornecedores]);

  const sufixo = `${toISODate(calc.r.start)}_a_${toISODate(calc.r.end)}`;
  const pct = (v) => (v == null ? '—' : `${v.toFixed(1).replace('.', ',')}%`);
  // Rótulo honesto do que está na tela: quando o período entra no futuro, o
  // total soma realizado + projeção, e isso precisa estar escrito no cartão.
  const rotuloPeriodo = calc.incluiFuturo ? `${periodLabel(period)} · inclui previsão` : periodLabel(period);
  // Sufixo colado na explicação de cada tabela quando o período passa de hoje:
  // sem isso o número parece 100% realizado.
  const avisoPrevisao = calc.incluiFuturo ? ' Inclui a projeção dos meses que ainda não aconteceram.' : '';

  const NOME_TIPO_CUSTO = { fixa: 'Fixa (todo mês)', variavel: 'Variável (eventual)', nao_classificada: 'Não classificada' };

  function blocoResultado() {
    const linhas = calc.meses.map((m) => ({
      chave: m.key,
      celulas: [
        m.previsto
          ? <>{m.label}<span style={{ marginLeft: 6, fontSize: 'var(--fs-micro)', fontWeight: 700, color: 'var(--ink-soft)', background: 'var(--surface-2)', borderRadius: 999, padding: '2px 7px' }}>previsto</span></>
          : m.label,
        formatCurrency(m.receitas), formatCurrency(m.despesas), formatCurrency(m.saldo), pct(m.margem),
      ],
      tom: m.saldo < 0 ? 'var(--negative)' : undefined,
    }));
    const saldoTotal = round2(calc.totalReceita - calc.totalDespesa);
    const margemTotal = calc.totalReceita > 0 ? (saldoTotal / calc.totalReceita) * 100 : null;
    return (
      <>
        <div className="lomuz-kpi-grid" style={{ marginBottom: 16 }}>
          <StatCard title="Receita no período" value={formatCurrency(calc.totalReceita)} icon={ArrowUpCircle} tone="success" footer={rotuloPeriodo} />
          <StatCard title="Despesa no período" value={formatCurrency(calc.totalDespesa)} icon={ArrowDownCircle} tone="danger" footer={rotuloPeriodo} />
          <StatCard title="Resultado" value={formatCurrency(saldoTotal)} icon={Wallet} tone={saldoTotal >= 0 ? 'success' : 'danger'} footer={saldoTotal >= 0 ? 'sobrou no período' : 'faltou no período'} />
          <StatCard title="Margem" value={pct(margemTotal)} icon={TrendingUp} tone={margemTotal != null && margemTotal >= 0 ? 'success' : 'danger'} footer="do que entrou, quanto sobrou" />
        </div>
        <RelatorioTabela
          titulo="Resultado mês a mês"
          desc={`Receita e despesa de cada mês do período. Contratos recorrentes entram mês a mês, uma cobrança por mês ativo — é por isso que a soma aqui é maior que a soma dos valores de contrato.${calc.incluiFuturo ? ' Mês marcado como previsto ainda não aconteceu: é projeção dos contratos já cadastrados.' : ''}`}
          colunas={[{ label: 'Mês' }, { label: 'Receita', align: 'right' }, { label: 'Despesa', align: 'right' }, { label: 'Resultado', align: 'right' }, { label: 'Margem', align: 'right' }]}
          linhas={linhas}
          rodape={['Total', formatCurrency(calc.totalReceita), formatCurrency(calc.totalDespesa), formatCurrency(saldoTotal), pct(margemTotal)]}
          onBaixar={() => baixarCSV(`resultado-mes-a-mes_${sufixo}.csv`, calc.meses.map((m) => ({
            'Mês': m.label, 'Situação': m.previsto ? 'previsto' : 'realizado',
            Receita: numeroCSV(m.receitas), Despesa: numeroCSV(m.despesas),
            Resultado: numeroCSV(m.saldo), 'Margem %': m.margem == null ? '' : numeroCSV(m.margem),
          })))}
        />
      </>
    );
  }

  function blocoDespesas() {
    const cat = calc.despCategoria;
    const forn = calc.despFornecedor;
    const custo = calc.despTipoCusto;
    const fornVisiveis = verTudoFornecedor ? forn.rows : forn.rows.slice(0, LIMITE_LINHAS_RELATORIO);
    return (
      <>
        <RelatorioTabela
          titulo="Despesas por categoria"
          desc={`Para onde o dinheiro foi, agrupado pela categoria de cada lançamento.${avisoPrevisao}`}
          colunas={[{ label: 'Categoria' }, { label: 'Lançamentos', align: 'right' }, { label: 'Total', align: 'right' }, { label: '% do total', align: 'right' }]}
          linhas={cat.rows.map((row) => ({ chave: row.chave, celulas: [calc.nomeCategoria(row.chave), String(row.cobrancas), formatCurrency(row.valor), pct(row.pct)] }))}
          rodape={['Total', String(cat.rows.reduce((s, x) => s + x.cobrancas, 0)), formatCurrency(cat.total), '100,0%']}
          onBaixar={() => baixarCSV(`despesas-por-categoria_${sufixo}.csv`, cat.rows.map((row) => ({
            Categoria: calc.nomeCategoria(row.chave), 'Lançamentos': row.cobrancas, Total: numeroCSV(row.valor), 'Percentual': numeroCSV(row.pct),
          })))}
        />

        <RelatorioTabela
          titulo="Despesas por fornecedor"
          desc={`Quem mais recebeu no período.${forn.rows.length > fornVisiveis.length ? ` Mostrando os ${fornVisiveis.length} maiores de ${forn.rows.length} — o CSV traz todos.` : ''}${avisoPrevisao}`}
          colunas={[{ label: 'Fornecedor' }, { label: 'Lançamentos', align: 'right' }, { label: 'Total', align: 'right' }, { label: '% do total', align: 'right' }]}
          linhas={fornVisiveis.map((row) => ({ chave: row.chave, celulas: [calc.nomeFornecedor(row.chave), String(row.cobrancas), formatCurrency(row.valor), pct(row.pct)] }))}
          rodape={['Total (todos)', String(forn.rows.reduce((s, x) => s + x.cobrancas, 0)), formatCurrency(forn.total), '100,0%']}
          onBaixar={() => baixarCSV(`despesas-por-fornecedor_${sufixo}.csv`, forn.rows.map((row) => ({
            Fornecedor: calc.nomeFornecedor(row.chave), 'Lançamentos': row.cobrancas, Total: numeroCSV(row.valor), 'Percentual': numeroCSV(row.pct),
          })))}
        />
        {forn.rows.length > LIMITE_LINHAS_RELATORIO && (
          <Button variant="secondary" onClick={() => setVerTudoFornecedor((v) => !v)} style={{ width: '100%', marginTop: -6, marginBottom: 18 }}>
            {verTudoFornecedor ? 'Mostrar só os 30 maiores' : `Mostrar todos os ${forn.rows.length} fornecedores`}
          </Button>
        )}

        <RelatorioTabela
          titulo="Custo fixo x variável"
          desc="Custo fixo é o que se repete todo mês e você não controla no curto prazo; variável é o que dá pra apertar."
          colunas={[{ label: 'Tipo de custo' }, { label: 'Lançamentos', align: 'right' }, { label: 'Total', align: 'right' }, { label: '% do total', align: 'right' }]}
          linhas={custo.rows.map((row) => ({ chave: row.chave, celulas: [NOME_TIPO_CUSTO[row.chave] || row.chave, String(row.cobrancas), formatCurrency(row.valor), pct(row.pct)] }))}
          rodape={['Total', String(custo.rows.reduce((s, x) => s + x.cobrancas, 0)), formatCurrency(custo.total), '100,0%']}
          onBaixar={() => baixarCSV(`custo-fixo-x-variavel_${sufixo}.csv`, custo.rows.map((row) => ({
            'Tipo de custo': NOME_TIPO_CUSTO[row.chave] || row.chave, 'Lançamentos': row.cobrancas, Total: numeroCSV(row.valor), 'Percentual': numeroCSV(row.pct),
          })))}
        />
      </>
    );
  }

  function blocoReceita() {
    const cat = calc.recCategoria;
    const cli = calc.recCliente;
    const cliVisiveis = verTudoCliente ? cli.rows : cli.rows.slice(0, LIMITE_LINHAS_RELATORIO);
    const nomeCli = (chave) => (chave === '__sem__' ? 'Sem cliente informado' : chave);
    return (
      <>
        <RelatorioTabela
          titulo="Receita por produto"
          desc={`Cada categoria de receita, com o número de cobranças que ela gerou no período.${avisoPrevisao}`}
          colunas={[{ label: 'Produto / categoria' }, { label: 'Cobranças', align: 'right' }, { label: 'Contratos', align: 'right' }, { label: 'Total', align: 'right' }, { label: '% do total', align: 'right' }]}
          linhas={cat.rows.map((row) => ({ chave: row.chave, celulas: [calc.nomeCategoria(row.chave), String(row.cobrancas), String(row.lancamentos), formatCurrency(row.valor), pct(row.pct)] }))}
          rodape={['Total', String(cat.rows.reduce((s, x) => s + x.cobrancas, 0)), String(cat.rows.reduce((s, x) => s + x.lancamentos, 0)), formatCurrency(cat.total), '100,0%']}
          onBaixar={() => baixarCSV(`receita-por-produto_${sufixo}.csv`, cat.rows.map((row) => ({
            Produto: calc.nomeCategoria(row.chave), 'Cobranças': row.cobrancas, Contratos: row.lancamentos, Total: numeroCSV(row.valor), 'Percentual': numeroCSV(row.pct),
          })))}
        />

        <RelatorioTabela
          titulo="Receita por cliente"
          desc={`Quem mais faturou no período.${cli.rows.length > cliVisiveis.length ? ` Mostrando os ${cliVisiveis.length} maiores de ${cli.rows.length} — o CSV traz todos.` : ''}${avisoPrevisao}`}
          colunas={[{ label: 'Cliente' }, { label: 'Cobranças', align: 'right' }, { label: 'Contratos', align: 'right' }, { label: 'Total', align: 'right' }, { label: '% do total', align: 'right' }]}
          linhas={cliVisiveis.map((row) => ({ chave: row.chave, celulas: [nomeCli(row.chave), String(row.cobrancas), String(row.lancamentos), formatCurrency(row.valor), pct(row.pct)] }))}
          rodape={['Total (todos)', String(cli.rows.reduce((s, x) => s + x.cobrancas, 0)), String(cli.rows.reduce((s, x) => s + x.lancamentos, 0)), formatCurrency(cli.total), '100,0%']}
          onBaixar={() => baixarCSV(`receita-por-cliente_${sufixo}.csv`, cli.rows.map((row) => ({
            Cliente: nomeCli(row.chave), 'Cobranças': row.cobrancas, Contratos: row.lancamentos, Total: numeroCSV(row.valor), 'Percentual': numeroCSV(row.pct),
          })))}
        />
        {cli.rows.length > LIMITE_LINHAS_RELATORIO && (
          <Button variant="secondary" onClick={() => setVerTudoCliente((v) => !v)} style={{ width: '100%', marginTop: -6, marginBottom: 18 }}>
            {verTudoCliente ? 'Mostrar só os 30 maiores' : `Mostrar todos os ${cli.rows.length} clientes`}
          </Button>
        )}

        <RelatorioTabela
          titulo="Produtos em crescimento e em queda"
          desc={`Compara o período escolhido com o período anterior de igual tamanho (${formatDateBR(toISODate(calc.anterior.start))} a ${formatDateBR(toISODate(calc.anterior.end))}). A ordem é pela diferença em reais, não pelo percentual: um produto que sai de R$ 10 para R$ 30 cresce 200% e não muda o caixa. É cálculo de tendência sobre o que já foi faturado — não é previsão de modelo estatístico nem de inteligência artificial.`}
          colunas={[{ label: 'Produto / categoria' }, { label: 'Período anterior', align: 'right' }, { label: 'Período atual', align: 'right' }, { label: 'Diferença', align: 'right' }, { label: 'Variação', align: 'right' }]}
          linhas={calc.crescimento.map((c) => ({
            chave: c.chave,
            celulas: [
              <>
                {calc.nomeCategoria(c.chave)}
                {c.novo && <span style={{ marginLeft: 6, fontSize: 'var(--fs-micro)', fontWeight: 700, color: 'var(--success)', background: 'var(--positive-soft)', borderRadius: 999, padding: '2px 7px' }}>novo</span>}
                {c.sumiu && <span style={{ marginLeft: 6, fontSize: 'var(--fs-micro)', fontWeight: 700, color: 'var(--negative)', background: 'var(--negative-soft)', borderRadius: 999, padding: '2px 7px' }}>parou</span>}
              </>,
              formatCurrency(c.antes),
              formatCurrency(c.agora),
              (c.diferenca > 0 ? '+' : '') + formatCurrency(c.diferenca),
              c.variacao == null ? (c.novo ? 'novo' : '—') : `${c.variacao > 0 ? '+' : ''}${pct(c.variacao)}`,
            ],
            tom: c.diferenca < 0 ? 'var(--negative)' : undefined,
          }))}
          vazioTexto="Sem receita nos dois períodos para comparar."
          onBaixar={() => baixarCSV(`produtos-crescimento_${sufixo}.csv`, calc.crescimento.map((c) => ({
            Produto: calc.nomeCategoria(c.chave),
            'Período anterior': numeroCSV(c.antes),
            'Período atual': numeroCSV(c.agora),
            'Diferença': numeroCSV(c.diferenca),
            'Variação %': c.variacao == null ? '' : numeroCSV(c.variacao),
            'Situação': c.novo ? 'novo' : c.sumiu ? 'parou' : c.diferenca > 0 ? 'crescendo' : c.diferenca < 0 ? 'caindo' : 'estável',
          })))}
        />
      </>
    );
  }

  function blocoContratos() {
    const mrrNovoTotal = round2(calc.novosNoPeriodo.reduce((s, t) => s + (t.frequencia === 'semanal' ? t.valor * (52 / 12) : t.frequencia === 'anual' ? t.valor / 12 : t.valor), 0));
    const mrrPerdidoTotal = round2(calc.canceladosNoPeriodo.reduce((s, t) => s + (t.frequencia === 'semanal' ? t.valor * (52 / 12) : t.frequencia === 'anual' ? t.valor / 12 : t.valor), 0));
    return (
      <>
        <div className="lomuz-kpi-grid" style={{ marginBottom: 16 }}>
          <StatCard title="Receita recorrente por mês" value={formatCurrency(calc.mrr)} icon={Repeat} tone="success" footer={calc.ativos === 1 ? '1 contrato ativo hoje' : `${calc.ativos} contratos ativos hoje`} />
          <StatCard title="Novos no período" value={String(calc.novosNoPeriodo.length)} icon={Plus} tone="neutral" footer={`${formatCurrency(mrrNovoTotal)} por mês somados`} />
          <StatCard title="Cancelados no período" value={String(calc.canceladosNoPeriodo.length)} icon={X} tone={calc.canceladosNoPeriodo.length > 0 ? 'danger' : 'neutral'} footer={`${formatCurrency(mrrPerdidoTotal)} por mês perdidos`} />
          <StatCard title="Taxa de cancelamento" value={pct(calc.taxaCancelamento)} icon={TrendingUp} tone={calc.taxaCancelamento != null && calc.taxaCancelamento > 10 ? 'danger' : 'neutral'} footer={calc.baseInicio.length === 1 ? 'sobre 1 contrato que já valia no início' : `sobre ${calc.baseInicio.length} contratos que já valiam no início`} />
        </div>

        <RelatorioTabela
          titulo="Entradas e saídas de contrato, mês a mês"
          desc="Contrato novo assinado e contrato cancelado em cada mês, com o efeito de cada um na receita mensal. Saldo positivo é base crescendo."
          colunas={[{ label: 'Mês' }, { label: 'Novos', align: 'right' }, { label: 'Cancelados', align: 'right' }, { label: 'Saldo', align: 'right' }, { label: 'Efeito por mês', align: 'right' }]}
          linhas={calc.contratosPorMes.map((m) => {
            const saldo = m.novos - m.cancelados;
            const efeito = round2(m.mrrNovo - m.mrrPerdido);
            return {
              chave: m.key,
              celulas: [m.label, String(m.novos), String(m.cancelados), (saldo > 0 ? '+' : '') + String(saldo), (efeito > 0 ? '+' : '') + formatCurrency(efeito)],
              tom: efeito < 0 ? 'var(--negative)' : undefined,
            };
          })}
          rodape={[
            'Total',
            String(calc.contratosPorMes.reduce((s, m) => s + m.novos, 0)),
            String(calc.contratosPorMes.reduce((s, m) => s + m.cancelados, 0)),
            String(calc.contratosPorMes.reduce((s, m) => s + m.novos - m.cancelados, 0)),
            (mrrNovoTotal - mrrPerdidoTotal > 0 ? '+' : '') + formatCurrency(round2(mrrNovoTotal - mrrPerdidoTotal)),
          ]}
          onBaixar={() => baixarCSV(`contratos-mes-a-mes_${sufixo}.csv`, calc.contratosPorMes.map((m) => ({
            'Mês': m.label, Novos: m.novos, Cancelados: m.cancelados,
            'Receita mensal ganha': numeroCSV(m.mrrNovo), 'Receita mensal perdida': numeroCSV(m.mrrPerdido),
          })))}
        />

        <RelatorioTabela
          titulo="Cancelamentos do período, contrato por contrato"
          desc="Quem cancelou, quanto valia por mês e em que data — a lista pra ligar e tentar reverter."
          colunas={[{ label: 'Cliente' }, { label: 'Contrato' }, { label: 'Cancelado em', align: 'right' }, { label: 'Valia por mês', align: 'right' }]}
          linhas={[...calc.canceladosNoPeriodo]
            .sort((a, b) => (b.dataCancelamento || '').localeCompare(a.dataCancelamento || ''))
            .map((t) => ({ chave: t.id, celulas: [t.clienteNome || 'Sem cliente', t.descricao || calc.nomeCategoria(t.categoriaId), formatDateBR(t.dataCancelamento), formatCurrency(t.valor)] }))}
          rodape={['Total', `${calc.canceladosNoPeriodo.length} contrato(s)`, '', formatCurrency(mrrPerdidoTotal)]}
          vazioTexto="Nenhum contrato cancelado no período — boa notícia."
          onBaixar={() => baixarCSV(`cancelamentos_${sufixo}.csv`, calc.canceladosNoPeriodo.map((t) => ({
            Cliente: t.clienteNome || '', Contrato: t.descricao || calc.nomeCategoria(t.categoriaId),
            'Cancelado em': formatDateBR(t.dataCancelamento), 'Valor mensal': numeroCSV(t.valor),
          })))}
        />
      </>
    );
  }

  return (
    <div style={{ paddingTop: 12 }}>
      <RelatoriosTabNav subTab={subTab} setSubTab={setSubTab} />

      {/* Vencimentos fala do agora (o que está atrasado hoje), então o seletor
          de período não aparece nessa aba — filtro que não filtra confunde. */}
      {subTab !== 'vencimentos' && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 'var(--fs-micro)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--ink-soft)', marginBottom: 8 }}>Período do relatório</div>
          <PeriodSelector value={period} onChange={setPeriod} presets={PERIOD_PRESETS_RELATORIO} />
          {calc.incluiFuturo && (
            <div style={{ marginTop: 8, fontSize: 'var(--fs-small)', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
              Este período passa de hoje ({formatDateBR(toISODate(new Date()))}). Os meses marcados como <strong>previsto</strong> são
              projeção dos contratos recorrentes já cadastrados — os totais somam realizado mais previsão, e é o mesmo número
              que o painel Início mostra pro mesmo período.
            </div>
          )}
        </Card>
      )}

      {subTab === 'resultado' && blocoResultado()}
      {subTab === 'despesas' && blocoDespesas()}
      {subTab === 'receita' && blocoReceita()}
      {subTab === 'contratos' && blocoContratos()}
      {subTab === 'vencimentos' && (
        <VencimentosPage data={data} onConfirmarRecebimento={onConfirmarRecebimento} onEditTransaction={onEditTransaction} />
      )}
    </div>
  );
}

/* =========================================================================
   PÁGINA: AJUDA
   ========================================================================= */

// Conteúdo da ajuda: texto fixo, por seção, filtrado por papel — mesma
// estrutura de `todos: false` usada na página de Configurações.
const AJUDA_SECOES = [
  {
    key: 'inicio',
    icon: Home,
    titulo: 'Visão geral',
    todos: true,
    itens: [
      ['O que são os cartões do topo', 'São três números do período escolhido: Receitas (tudo que entrou), Despesas (tudo que saiu) e Resultado (receitas menos despesas). Tocar num cartão muda o gráfico abaixo para destacar aquele número.'],
      ['Trocar o período', 'Os botões "Este mês", "Últimos 3 meses", "Próx. 3 meses" e afins mudam todos os números e gráficos da tela de uma vez. Logo abaixo dos botões aparece escrito qual período está na tela — por exemplo "Julho 2026". Ao entrar, o sistema já mostra o mês atual.'],
      ['Ver mês a mês', 'Quando o período escolhido tem mais de um mês, aparece o botão "Ver mês a mês", que abre uma tabela com receitas, despesas e resultado de cada mês. A última linha da tabela fecha com os números dos cartões.'],
      ['Cartões coloridos de aviso', 'Amarelo é atenção, vermelho é urgente. Eles só aparecem quando existe algo de fato precisando de você — se não aparecerem, não há pendência.'],
      ['Ranking de produtos', 'Abaixo do gráfico de fluxo de caixa, a lista mostra os produtos do mais vendido ao menos vendido, pelo valor faturado no período, com o ticket médio de cada um.'],
    ],
  },
  {
    key: 'receitas',
    icon: Receipt,
    titulo: 'Receitas e Despesas',
    todos: true,
    itens: [
      ['Duas telas separadas', 'Receitas mostra tudo que entra, Despesas mostra tudo que sai. São entradas separadas no menu porque quem abre a tela já sabe o que quer ver, e cada lado tem filtros próprios.'],
      ['Como lançar', 'O botão fixo no canto inferior direito (no celular, o + no meio da barra de baixo) abre o menu para lançar cliente, venda, receita ou despesa de qualquer tela do sistema.'],
      ['Lançamento recorrente', 'Marque "Recorrente" quando a cobrança se repete todo mês (contrato de rádio, aluguel, assinatura). O sistema projeta os meses seguintes sozinho — não precisa lançar de novo a cada mês.'],
      ['Conta em aberto', 'Desligue "Já foi pago/recebido" e informe o vencimento quando a conta ainda não foi quitada. Ela passa a aparecer nos cartões de vencimento e atraso, e no filtro "Em aberto" das Despesas.'],
      ['Venda aguardando aprovação', 'Toda venda lançada por um vendedor entra como pendente e não conta em saldo, meta nem comissão até o administrador revisar e aprovar. O filtro "Aprovação" separa as três situações.'],
      ['Buscas em Receitas', 'Busca por texto (cliente, descrição ou categoria), período, forma de cobrança (recorrente ou venda única), situação do contrato (ativo, cancelado, em teste), aprovação, categoria, vendedor e ordem (mais recente, mais antiga, maior ou menor valor).'],
      ['Buscas em Despesas', 'Busca por texto (fornecedor, descrição ou categoria), período, pagamento (pagas ou em aberto), tipo de custo (fixo ou variável), categoria, fornecedor e ordem.'],
      ['Total do filtro', 'No fim de cada lista, o total do que está filtrado, a quantidade e o valor médio — com opção de ver por mês. E o botão "Baixar CSV" leva exatamente as linhas filtradas para o Excel.'],
      ['Por que o total de Receitas é menor que o dos Relatórios', 'Nesta lista cada contrato aparece uma vez, com o valor dele. Nos Relatórios o contrato recorrente é multiplicado pelos meses em que esteve ativo — é o faturamento de fato.'],
      ['Cadastro incompleto', 'Um aviso no topo de Receitas e Despesas mostra quantos lançamentos estão sem categoria, sem cliente/fornecedor, sem custo fixo/variável definido ou com valor de centavos — cada item diz por que aquilo importa e filtra a lista pra você corrigir. É a mesma ideia do aviso que existe em Clientes.'],
      ['Sugestão ao lançar uma despesa', 'Ao digitar o fornecedor, o sistema mostra o que você já lançou pra ele antes — a categoria mais usada, se costuma ser custo fixo ou variável, e o valor típico — com um botão para aplicar a sugestão. Também aparecem avisos quando o valor foge muito do padrão daquele fornecedor, quando a descrição parece retirada de sócio, empréstimo, compra de bem ou gasto pessoal (essas quatro coisas distorcem o resultado se forem lançadas junto com o custo normal da operação), ou quando falta categoria, fornecedor ou vencimento. Nenhum aviso impede de salvar — quem decide é você, o sistema só aponta o que costuma dar problema.'],
    ],
  },
  {
    key: 'previsao',
    icon: TrendingUp,
    titulo: 'Previsão',
    todos: true,
    itens: [
      ['Para que serve', 'Projeta quanto deve entrar nos próximos meses, somando os contratos recorrentes ativos com as vendas já lançadas para frente.'],
      ['Metas', 'A meta pode ser de cada vendedor ou da empresa inteira. Verde significa que bateu a meta, dourado que está perto, vinho que está longe.'],
    ],
  },
  {
    key: 'clientes',
    icon: Users,
    titulo: 'Clientes',
    todos: true,
    itens: [
      ['Buscar e filtrar', 'A busca procura por nome, razão social, cidade e também por CNPJ ou CPF — pode digitar com ou sem ponto e barra. Os filtros são por produto contratado, estado e clientes ativos ou inativos. O filtro de ramo de negócio só aparece depois que houver ramo cadastrado.'],
      ['Lista grande', 'A lista mostra 60 clientes por vez, com o total logo acima dela. Use "Mostrar mais" para carregar o próximo bloco, ou a busca para achar direto quem você procura.'],
      ['Clientes com o mesmo nome', 'Redes com várias lojas costumam repetir o nome fantasia. Por isso o CNPJ aparece na linha de baixo de cada cliente, para você saber qual é qual.'],
      ['Cliente inativo', 'Desligar "Cliente ativo" tira o cliente das listas do dia a dia, mas o histórico de vendas dele continua guardado.'],
      ['Aviso de reajuste', 'O sistema avisa 30 dias antes da data de reajuste do contrato. No aviso você pode clicar em "Gerenciar" para mudar a data, trocar o índice, colocar um percentual ou valor fixo, ou suspender o reajuste temporariamente.'],
      ['Já reajustei', 'Depois de aplicar o reajuste com o cliente, clique em "Já reajustei" — o sistema joga a próxima data para 12 meses à frente automaticamente.'],
    ],
  },
  {
    key: 'relatorios',
    icon: Clock,
    titulo: 'Relatórios',
    todos: false,
    itens: [
      ['Período', 'Todo relatório começa pelo período no alto da tela: este mês, mês passado, últimos 3, últimos 12, por ano (com setas para recuar ou avançar de ano) ou datas escolhidas por você. Tudo abaixo recalcula na hora.'],
      ['Mês previsto', 'Quando o período passa da data de hoje — o ano corrente, por exemplo, vai até dezembro — os meses que ainda não aconteceram aparecem marcados como "previsto": o valor é a projeção dos contratos recorrentes já cadastrados. O total soma o realizado mais essa previsão, e é o mesmo número que o painel Início mostra para o mesmo período.'],
      ['Resultado mês a mês', 'Quanto entrou, quanto saiu, quanto sobrou e a margem de cada mês. A margem é quanto sobrou de cada R$ 100 que entraram. Contrato recorrente entra uma vez por mês ativo, e é por isso que a soma aqui é maior que a soma dos valores de contrato.'],
      ['Despesas', 'Três olhares sobre o mesmo gasto: por categoria (para onde foi), por fornecedor (quem recebeu) e custo fixo x variável (o que se repete todo mês contra o que dá pra apertar).'],
      ['Receita', 'Por produto (o que mais vende) e por cliente (quem mais fatura). "Cobranças" é quantas vezes aquilo foi faturado no período; "contratos" é quantas vendas diferentes.'],
      ['Produtos em crescimento', 'Compara cada produto com o período anterior de igual tamanho e ordena pela diferença em reais — quem puxou o faturamento pra cima e quem puxou pra baixo. Produto que não existia antes aparece como "novo"; produto que faturava e parou aparece como "parou". É conta de tendência sobre o que já foi faturado, não adivinhação.'],
      ['Contratos recorrentes', 'Sua receita que se repete: quanto entra por mês hoje, quantos contratos entraram e saíram no período, a taxa de cancelamento e a lista de quem cancelou — com quanto cada um valia por mês.'],
      ['Vencimentos', 'Cada contrato recorrente vence todo mês no mesmo dia da data original dele. Sem confirmação de recebimento depois desse dia, o atraso começa a contar. Até 10 dias é Atenção (amarelo); acima disso é Crítico (vermelho). O botão de check marca o mês como recebido — o sistema não conversa com o banco, essa confirmação é sua.'],
      ['Contrato parado', 'Contrato ativo que não recebe há 3 meses ou mais aparece em vermelho no topo da tela de Vencimentos, com a data do último pagamento e há quantos meses parou. É o aviso mais importante ali: esse valor está contando como receita recorrente ativa e não está entrando. Ou é cobrança a fazer, ou o contrato já morreu e precisa ser cancelado.'],
      ['Baixar CSV', 'Cada tabela tem um botão que baixa aquele relatório num arquivo que abre direto no Excel, com os acentos e os centavos certos. Quando a tela mostra só os 30 maiores, o arquivo traz todos.'],
    ],
  },
  {
    key: 'cadastros',
    icon: Tag,
    titulo: 'Cadastros',
    todos: false,
    itens: [
      ['Categorias', 'Os grupos que organizam receitas e despesas nos relatórios (ex.: Rádio do Cliente, Aluguel, Folha de pagamento).'],
      ['Fornecedores', 'Quem a empresa paga — fornecedor, banco, imposto, salário. A lista mostra quanto já foi pago a cada um e quanto ainda está em aberto. Ao lançar uma despesa, digite o nome no campo Fornecedor: se ainda não existir, o cadastro é criado sozinho. Fornecedor com despesa lançada não pode ser excluído (isso apagaria o vínculo do histórico) — desative-o no lugar disso.'],
      ['Planos negociados', 'Combinações prontas de preço e comissão. Quando o vendedor escolhe um plano na venda, o valor e a comissão vêm preenchidos.'],
      ['Serviços', 'O que a empresa vende de fato. Todo plano aponta para um serviço.'],
      ['Ramos de negócio', 'Classificação do cliente (supermercado, farmácia, construção...), usada nos filtros de Clientes.'],
      ['Índices de reajuste', 'IPCA, IGP-M e afins, usados no aviso anual de reajuste de contrato. O padrão do sistema é o IPCA.'],
    ],
  },
  {
    key: 'config',
    icon: Settings,
    titulo: 'Configurações',
    todos: true,
    itens: [
      ['Aparência', 'Tema claro, escuro ou automático (acompanha o ajuste do seu celular ou computador).'],
      ['Usuários', 'Somente administrador. Define quem é administrador e quem é vendedor.'],
      ['Mural de orientação', 'Somente administrador. Recados e materiais em PDF que aparecem na tela inicial de toda a equipe.'],
    ],
  },
];

function AjudaSecao({ secao, aberta, onToggle }) {
  const Icon = secao.icon;
  return (
    <Card style={{ padding: 0, marginBottom: 10, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        aria-expanded={aberta}
        style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink)' }}
      >
        <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 'var(--radius)', background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={19} color="var(--primary-text)" />
        </span>
        <span style={{ flex: 1, fontWeight: 700, fontSize: 'var(--fs-title)' }}>{secao.titulo}</span>
        <ChevronRight size={17} style={{ color: 'var(--ink-soft)', flexShrink: 0, transform: aberta ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {aberta && (
        <div style={{ padding: '0 16px 16px' }}>
          {secao.itens.map(([titulo, texto]) => (
            <div key={titulo} style={{ paddingTop: 12, borderTop: '1px solid var(--border)', marginTop: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{titulo}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.6 }}>{texto}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function AjudaPage({ role }) {
  const [abertas, setAbertas] = useState({ inicio: true });
  const secoes = AJUDA_SECOES.filter((s) => s.todos || role === 'admin');

  function toggle(key) {
    setAbertas((cur) => ({ ...cur, [key]: !cur[key] }));
  }

  return (
    <div style={{ paddingTop: 12 }}>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 16, lineHeight: 1.6 }}>
        Toque em cada tema para abrir as explicações. Se ficar alguma dúvida que não está aqui, fale com o administrador do sistema.
      </p>
      {secoes.map((s) => (
        <AjudaSecao key={s.key} secao={s} aberta={!!abertas[s.key]} onToggle={() => toggle(s.key)} />
      ))}
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
              <span style={{ display: 'block', fontWeight: 700, fontSize: 'var(--fs-title)', marginBottom: 3 }}>{i.titulo}</span>
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
        <span style={{ fontSize: 'var(--fs-micro)', fontWeight: active ? 700 : 500 }}>{it.label}</span>
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
          {error && <div style={{ color: 'var(--negative)', fontSize: 'var(--fs-body)', marginBottom: 10, fontWeight: 600 }}>{error}</div>}
          {info && <div style={{ color: 'var(--positive)', fontSize: 'var(--fs-body)', marginBottom: 10, fontWeight: 600 }}>{info}</div>}
          <Button variant="primary" onClick={submit} style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Aguarde…' : mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link de redefinição'}
          </Button>
        </Card>

        {mode === 'login' && (
          <button
            onClick={() => trocarModo('reset')}
            style={{ display: 'block', margin: '14px auto 0', background: 'none', border: 'none', color: 'var(--ink-soft)', fontWeight: 600, fontSize: 'var(--fs-body)', cursor: 'pointer' }}
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
          {error && <div style={{ color: 'var(--negative)', fontSize: 'var(--fs-body)', marginBottom: 10, fontWeight: 600 }}>{error}</div>}
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
  const [period, setPeriod] = useState({ type: 'mes', mesOffset: 0, start: '', end: '' });
  const [cadastroTab, setCadastroTab] = useState('clientes');
  const [relatorioTab, setRelatorioTab] = useState('resultado');

  const [showAddTx, setShowAddTx] = useState(false);
  const [showImportCsv, setShowImportCsv] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [showMural, setShowMural] = useState(false);
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [showAddCliente, setShowAddCliente] = useState(false);
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

  useEffect(() => { if (role === 'vendedor' && (page === 'despesas' || page === 'relatorios')) setPage('inicio'); }, [role]); // eslint-disable-line react-hooks/exhaustive-deps
  // Vendedor não tem cadastros: se a aba tivesse ficado em outra, a página de
  // Clientes abriria vazia pra ele.
  useEffect(() => { if (role === 'vendedor') setCadastroTab('clientes'); }, [role]);

  async function loadData(s) {
    const userId = s.user.id;
    try {
      const [
        profileRes, catRes, vendRes, txRes, planoRes, orientRes, metaEqRes,
        servRes, ramoRes, indiceRes, clienteRes, clientePlanoRes,
        rankVendRes, rankTxRes, fornecedorRes,
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('categories').select('*').order('nome'),
        supabase.from('vendedores').select('*'),
        fetchAllRows('transactions'),
        supabase.from('planos').select('*').order('nome'),
        supabase.from('orientacoes').select('*'),
        supabase.from('metas_equipe').select('*'),
        supabase.from('servicos').select('*').order('nome'),
        supabase.from('ramos_negocio').select('*').order('nome'),
        supabase.from('indices_reajuste').select('*').order('nome'),
        fetchAllRows('clientes', { order: 'nome_fantasia' }),
        supabase.from('cliente_planos').select('*'),
        // Visões seguras: usadas pro ranking de vendas entre vendedores (nome,
        // comissão e vendas só de quem está ativo — nunca dados de admin).
        supabase.from('vendedores_publico').select('*'),
        supabase.from('transacoes_ranking_publico').select('*'),
        supabase.from('fornecedores').select('*').order('nome'),
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
        servicos: (servRes.data || []).map(rowToServico),
        ramosNegocio: (ramoRes.data || []).map(rowToRamo),
        indicesReajuste: (indiceRes.data || []).map(rowToIndice),
        clientes: (clienteRes.data || []).map(rowToCliente),
        clientePlanos: (clientePlanoRes.data || []).map(rowToClientePlano),
        fornecedores: (fornecedorRes.data || []).map(rowToFornecedor),
        rankingPublico: {
          vendedores: (rankVendRes.data || []).map((row) => ({ id: row.id, nome: row.nome, comissaoPercentual: Number(row.comissao_percentual) || 0 })),
          transacoes: (rankTxRes.data || []).map(rowToTx),
        },
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

      // serviços
      const prevServ = prev?.servicos || [];
      const newServ = newData.servicos || [];
      for (const s of newServ) {
        const before = prevServ.find((x) => x.id === s.id);
        if (!before) await supabase.from('servicos').insert(servicoToRow(s));
        else if (JSON.stringify(before) !== JSON.stringify(s)) await supabase.from('servicos').update(servicoToRow(s)).eq('id', s.id);
      }
      for (const s of prevServ) {
        if (!newServ.find((x) => x.id === s.id)) await supabase.from('servicos').delete().eq('id', s.id);
      }

      // fornecedores / credores
      const prevForn = prev?.fornecedores || [];
      const newForn = newData.fornecedores || [];
      for (const f of newForn) {
        const before = prevForn.find((x) => x.id === f.id);
        if (!before) await supabase.from('fornecedores').insert(fornecedorToRow(f));
        else if (JSON.stringify(before) !== JSON.stringify(f)) await supabase.from('fornecedores').update(fornecedorToRow(f)).eq('id', f.id);
      }
      for (const f of prevForn) {
        if (!newForn.find((x) => x.id === f.id)) await supabase.from('fornecedores').delete().eq('id', f.id);
      }

      // ramos de negócio
      const prevRamos = prev?.ramosNegocio || [];
      const newRamos = newData.ramosNegocio || [];
      for (const rm of newRamos) {
        const before = prevRamos.find((x) => x.id === rm.id);
        if (!before) await supabase.from('ramos_negocio').insert(ramoToRow(rm));
        else if (JSON.stringify(before) !== JSON.stringify(rm)) await supabase.from('ramos_negocio').update(ramoToRow(rm)).eq('id', rm.id);
      }
      for (const rm of prevRamos) {
        if (!newRamos.find((x) => x.id === rm.id)) await supabase.from('ramos_negocio').delete().eq('id', rm.id);
      }

      // índices de reajuste
      const prevIndices = prev?.indicesReajuste || [];
      const newIndices = newData.indicesReajuste || [];
      for (const ix of newIndices) {
        const before = prevIndices.find((x) => x.id === ix.id);
        if (!before) await supabase.from('indices_reajuste').insert(indiceToRow(ix));
        else if (JSON.stringify(before) !== JSON.stringify(ix)) await supabase.from('indices_reajuste').update(indiceToRow(ix)).eq('id', ix.id);
      }
      for (const ix of prevIndices) {
        if (!newIndices.find((x) => x.id === ix.id)) await supabase.from('indices_reajuste').delete().eq('id', ix.id);
      }

      // clientes
      const prevClientes = prev?.clientes || [];
      const newClientes = newData.clientes || [];
      for (const c of newClientes) {
        const before = prevClientes.find((x) => x.id === c.id);
        if (!before) await supabase.from('clientes').insert(clienteToRow(c));
        else if (JSON.stringify(before) !== JSON.stringify(c)) await supabase.from('clientes').update(clienteToRow(c)).eq('id', c.id);
      }
      for (const c of prevClientes) {
        if (!newClientes.find((x) => x.id === c.id)) await supabase.from('clientes').delete().eq('id', c.id);
      }

      // planos/serviços vinculados a cada cliente
      const prevClientePlanos = prev?.clientePlanos || [];
      const newClientePlanos = newData.clientePlanos || [];
      for (const cp of newClientePlanos) {
        const before = prevClientePlanos.find((x) => x.id === cp.id);
        if (!before) await supabase.from('cliente_planos').insert(clientePlanoToRow(cp));
        else if (JSON.stringify(before) !== JSON.stringify(cp)) await supabase.from('cliente_planos').update(clientePlanoToRow(cp)).eq('id', cp.id);
      }
      for (const cp of prevClientePlanos) {
        if (!newClientePlanos.find((x) => x.id === cp.id)) await supabase.from('cliente_planos').delete().eq('id', cp.id);
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

  function openAddTransaction(tipoPreset) {
    setEditingTx(null);
    setTxDraft({
      tipo: tipoPreset || (role === 'vendedor' ? 'receita' : 'despesa'),
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
      pago: true,
      dataVencimento: '',
      despesaFixa: false,
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

  // Botão central de ação rápida: abre um menu com os 4 lançamentos mais
  // comuns em vez de ir direto pro formulário de lançamento.
  function quickAdd(tipo) {
    setShowQuickMenu(false);
    if (tipo === 'cliente') { setShowAddCliente(true); return; }
    openAddTransaction(tipo === 'despesa' ? 'despesa' : 'receita');
  }
  function saveClienteQuick(cliente) {
    persist({ ...data, clientes: [...(data.clientes || []), cliente] });
    setShowAddCliente(false);
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
    // Em despesa, o texto do campo fornecedor vira vínculo com o cadastro:
    // nome que já existe é reaproveitado (sem duplicar), nome novo é cadastrado
    // na hora — assim o admin não precisa sair do lançamento pra criar o
    // fornecedor antes. O id sai resolvido daqui e não do draft, então uma
    // despesa que aponte pra fornecedor já removido se corrige ao ser salva.
    const nomeCredor = draft.tipo === 'despesa' ? (draft.clienteNome || '').trim() : '';
    let fornecedores = data.fornecedores || [];
    let fornecedorId = null;
    if (nomeCredor) {
      const jaExiste = fornecedores.find((f) => (f.nome || '').trim().toLowerCase() === nomeCredor.toLowerCase());
      if (jaExiste) {
        fornecedorId = jaExiste.id;
      } else {
        const novo = { id: uid(), nome: nomeCredor, documento: '', ativo: true };
        fornecedores = [...fornecedores, novo];
        fornecedorId = novo.id;
      }
    }
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
      fornecedorId,
      contratoMeses: draft.contratoMeses ? (parseInt(draft.contratoMeses, 10) || null) : null,
      formaPagamento: draft.formaPagamento || '',
      planoId: draft.planoId || null,
      comissaoPercentual: (draft.comissaoPercentual !== '' && draft.comissaoPercentual != null)
        ? (parseFloat(draft.comissaoPercentual) || 0)
        : null,
      // Recorrente não usa conta a pagar/receber: cada ocorrência é calculada
      // na hora, não existe uma linha guardada por mês pra marcar como paga.
      pago: draft.recorrente ? true : (draft.pago !== false),
      dataVencimento: (!draft.recorrente && draft.pago === false) ? (draft.dataVencimento || null) : null,
      despesaFixa: draft.tipo === 'despesa' ? draft.despesaFixa === true : null,
    };
    const list = editingTx ? data.transactions.map((t) => (t.id === tx.id ? tx : t)) : [...data.transactions, tx];
    persist({ ...data, transactions: list, fornecedores });
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
  function requestCancelRecurrence() {
    setTxStep('cancelRecurrence');
  }
  function confirmCancelRecurrence(dataCancelamento) {
    const updated = { ...editingTx, dataCancelamento };
    persist({ ...data, transactions: data.transactions.map((t) => (t.id === editingTx.id ? updated : t)) });
    closeTxModal();
  }
  function activateNow(tx) {
    const updated = { ...tx, ativacao: 'imediata', dataAtivacao: null, diasTeste: null };
    persist({ ...data, transactions: data.transactions.map((t) => (t.id === tx.id ? updated : t)) });
  }
  function confirmarRecebimento(linha) {
    const tx = data.transactions.find((t) => t.id === linha.id);
    if (!tx) return;
    const updated = { ...tx, ultimaConfirmacao: toISODate(new Date()) };
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
            <StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton />
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
  // Título da página de Clientes acompanha a aba aberta: a página abriga os
  // cadastros todos, e "Clientes" no cabeçalho enquanto a tela mostra Serviços
  // seria confuso.
  const tituloCadastro = CADASTROS_TABS.find((t) => t.key === cadastroTab)?.label || 'Clientes';
  const pageTitles = {
    inicio: 'Visão geral',
    receitas: role === 'vendedor' ? 'Suas vendas' : 'Receitas',
    despesas: 'Despesas',
    previsao: role === 'vendedor' ? 'Sua previsão' : 'Previsão',
    clientes: role === 'vendedor' ? 'Clientes' : tituloCadastro,
    relatorios: 'Relatórios',
    config: 'Configurações',
    ajuda: 'Ajuda',
  };
  const subtitulosCadastro = {
    clientes: 'Cadastro de clientes, com busca, filtros, aviso de cadastro incompleto e de reajuste de contrato.',
    fornecedores: 'Quem a empresa paga, com quanto já foi pago e quanto está em aberto para cada um.',
    categorias: 'Os grupos que organizam receitas e despesas nos relatórios.',
    planos: 'Combinações prontas de preço e comissão para agilizar o lançamento da venda.',
    servicos: 'O que a empresa vende de fato. Todo plano aponta para um serviço.',
    ramos: 'Classificação do cliente, usada nos filtros e na análise por segmento.',
    indices: 'Índices financeiros do reajuste anual de contrato.',
  };
  const pageSubtitles = {
    inicio: primeiroNome
      ? `Olá, ${primeiroNome}. Aqui está o resumo financeiro.`
      : 'Aqui está o resumo financeiro.',
    receitas: role === 'vendedor'
      ? 'Suas vendas lançadas e o status de aprovação de cada uma.'
      : 'Tudo que entra, com busca por cliente, período, categoria, contrato e vendedor.',
    despesas: 'Tudo que sai, com busca por fornecedor, período, categoria, pagamento e tipo de custo.',
    previsao: role === 'vendedor'
      ? 'Sua projeção de vendas, metas e comissão.'
      : 'Projeção financeira e panorama da equipe de vendas.',
    clientes: role === 'vendedor'
      ? 'Cadastro de clientes, com busca e filtros.'
      : subtitulosCadastro[cadastroTab] || subtitulosCadastro.clientes,
    relatorios: 'Resultado, despesas, receita, contratos e vencimentos — cada um com opção de baixar em CSV.',
    config: 'Aparência, usuários e mural de orientação.',
    ajuda: 'Como usar cada parte do sistema, explicado passo a passo.',
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
  if (role === 'admin') {
    const reajustes = clientesComReajustePendente(data.clientes);
    if (reajustes.length > 0) {
      const atrasados = reajustes.filter((c) => c.atrasado).length;
      alerts.push({
        tone: atrasados > 0 ? 'danger' : 'warning',
        page: 'clientes',
        text: `${reajustes.length} cliente(s) com reajuste de contrato próximo${atrasados > 0 ? ` (${atrasados} atrasado(s))` : ''}.`,
      });
    }
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
        onAlertClick={(a) => {
          // Aviso de cliente leva pra aba de clientes, não pra aba de cadastro
          // que estivesse aberta antes.
          if (a.page === 'clientes') setCadastroTab('clientes');
          setPage(a.page || 'inicio');
        }}
        submenus={role !== 'vendedor' ? { clientes: CADASTROS_TABS, relatorios: RELATORIOS_TABS } : {}}
        activeSubKey={{ clientes: cadastroTab, relatorios: relatorioTab }}
        onSubSelect={(secao, subKey) => (secao === 'relatorios' ? setRelatorioTab(subKey) : setCadastroTab(subKey))}
      >
        {page === 'inicio' && (
          <Dashboard data={data} role={role} currentVendedorId={currentVendedorId} period={period} setPeriod={setPeriod} onAddClick={openAddTransaction} onGoTo={setPage} onActivateNow={activateNow} onCustomizeClick={() => setShowCustomize(true)} onReviewSale={openEditTransaction} onEditMural={() => setShowMural(true)} />
        )}
        {page === 'receitas' && (
          <MovimentosPage
            data={data} role={role} currentVendedorId={currentVendedorId} tipo="receita"
            onEdit={openEditTransaction}
            onImportClick={() => setShowImportCsv(true)}
            onNovo={() => openAddTransaction('receita')}
          />
        )}
        {page === 'despesas' && role !== 'vendedor' && (
          <MovimentosPage
            data={data} role={role} currentVendedorId={currentVendedorId} tipo="despesa"
            onEdit={openEditTransaction}
            onImportClick={() => setShowImportCsv(true)}
            onNovo={() => openAddTransaction('despesa')}
          />
        )}
        {page === 'previsao' && (
          <PrevisaoPage data={data} role={role} currentVendedorId={currentVendedorId} persist={persist} askConfirm={askConfirm} />
        )}
        {/* Clientes é a casa dos cadastros: a aba "Clientes" mostra a lista de
            clientes, as outras mostram os cadastros de apoio. Vendedor só vê a
            primeira, então nem a barra de abas aparece pra ele. */}
        {page === 'clientes' && (
          <div>
            {/* Sem paddingTop aqui: ClientesPage e CategoriasPage já abrem com
                o próprio espaçamento — um wrapper com padding duplicaria o
                respiro no topo da tela. */}
            {role !== 'vendedor' && <CadastrosTabNav subTab={cadastroTab} setSubTab={setCadastroTab} />}
            {(role === 'vendedor' || cadastroTab === 'clientes')
              ? <ClientesPage data={data} role={role} persist={persist} askConfirm={askConfirm} />
              : <CategoriasPage data={data} persist={persist} askConfirm={askConfirm} subTab={cadastroTab} setSubTab={setCadastroTab} />}
          </div>
        )}
        {page === 'relatorios' && role !== 'vendedor' && (
          <RelatoriosPage
            data={data}
            subTab={relatorioTab}
            setSubTab={setRelatorioTab}
            onConfirmarRecebimento={confirmarRecebimento}
            onEditTransaction={openEditTransaction}
          />
        )}
        {page === 'ajuda' && (
          <AjudaPage role={role} />
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
        <BottomNav page={page} setPage={setPage} onAdd={() => setShowQuickMenu(true)} role={role} />
      </div>
      <div style={{ height: 96 }} className="lomuz-bottomnav" aria-hidden="true" />

      {/* No desktop não havia atalho nenhum pra lançar: o botão de ação rápida
          existia só dentro da barra inferior, que fica escondida acima de 900px.
          Agora ele acompanha o rodapé em toda página. Menu próprio (popover
          ancorado no botão), separado do bottom sheet do celular abaixo. */}
      <DesktopQuickAddFab role={role} onQuickAdd={quickAdd} />

        {showQuickMenu && (
          <Modal title="O que você quer lançar?" onClose={() => setShowQuickMenu(false)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Vendedor só lança venda: cadastrar cliente e lançar despesa são
                  bloqueados pela permissão do banco, então oferecer as opções
                  daria um erro silencioso depois de preencher o formulário. */}
              <QuickAddButton icon={ArrowUpCircle} label="Venda" desc="Lançar uma venda para um cliente" onClick={() => quickAdd('venda')} />
              {role !== 'vendedor' && (
                <>
                  <QuickAddButton icon={Users} label="Cliente" desc="Cadastrar um novo cliente" onClick={() => quickAdd('cliente')} />
                  <QuickAddButton icon={ArrowUpCircle} label="Receita" desc="Lançar uma entrada que não é venda" onClick={() => quickAdd('receita')} />
                  <QuickAddButton icon={ArrowDownCircle} label="Despesa" desc="Lançar uma saída" onClick={() => quickAdd('despesa')} />
                </>
              )}
            </div>
          </Modal>
        )}

        {showAddCliente && (
          <Modal title="Novo cliente" onClose={() => setShowAddCliente(false)}>
            <ClienteForm
              ramosNegocio={data.ramosNegocio}
              indicesReajuste={data.indicesReajuste}
              onSubmit={saveClienteQuick}
              onCancel={() => setShowAddCliente(false)}
            />
          </Modal>
        )}

        {showAddTx && (
          <Modal
            title={
              txStep === 'cancelRecurrence' ? 'Cancelar recorrência'
                : (editingTx && role === 'admin' && editingTx.status === 'pendente') ? 'Revisar venda'
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
                fornecedores={data.fornecedores}
                transactions={data.transactions}
                onSubmit={handleFormSubmit}
                onCancel={closeTxModal}
                onDelete={editingTx ? () => requestDeleteTransaction(editingTx) : null}
                onCancelRecurrence={(editingTx && editingTx.recorrente && getRecurrenceStatus(editingTx) === 'ativo') ? requestCancelRecurrence : null}
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
            {txStep === 'cancelRecurrence' && (
              <CancelRecurrenceStep onBack={() => setTxStep('form')} onConfirm={confirmCancelRecurrence} />
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
