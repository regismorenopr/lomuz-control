-- ===================================================================
-- LOMUZ CONTROL — Esquema do banco de dados (Supabase / PostgreSQL)
-- Versão 2 — use esta versão (substitui a anterior).
-- Como usar: no seu projeto Supabase, vá em "SQL Editor" > "New query",
-- cole este arquivo inteiro e clique em "Run".
-- Se você já rodou a versão anterior, apague as 4 tabelas antes
-- (Table Editor > selecionar cada uma > Delete table) ou crie um projeto novo.
-- ===================================================================

-- Perfis: todo mundo que faz login tem um perfil com um papel (admin ou vendedor)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  role text not null default 'vendedor' check (role in ('admin', 'vendedor')),
  dashboard_widgets jsonb not null default '{}'::jsonb,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  created_at timestamptz default now()
);

-- Vendedores: dados de comissão e meta, ligados a um perfil (quando a pessoa já tem login).
-- "ativo=false" mantém o histórico (vendas antigas continuam contando) mas
-- tira a pessoa do ranking visível entre vendedores e da lista de convite.
create table vendedores (
  id text primary key,
  profile_id uuid unique references profiles(id) on delete set null,
  convite_email text,
  nome text not null,
  comissao_percentual numeric not null default 0,
  meta_padrao numeric not null default 0,
  metas jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  created_at timestamptz default now()
);

-- Categorias
create table categories (
  id text primary key,
  nome text not null,
  tipo text not null check (tipo in ('receita', 'despesa')),
  icone text not null default 'MoreHorizontal',
  cor text not null default '#7A6A58',
  created_at timestamptz default now()
);

-- Serviços: o que a empresa efetivamente vende, com a forma de cobrança
-- natural de cada um. Planos sempre apontam pra um serviço.
create table servicos (
  id text primary key,
  nome text not null,
  tipo_cobranca text not null default 'unitaria' check (tipo_cobranca in ('recorrente', 'unitaria', 'por_hora')),
  ativo boolean not null default true,
  created_at timestamptz default now()
);

-- Ramos de negócio: classificação do cliente (comércio, indústria, etc.).
create table ramos_negocio (
  id text primary key,
  nome text not null,
  created_at timestamptz default now()
);

-- Índices de reajuste financeiro (IPCA, IGP-M...) usados no aviso anual de
-- reajuste de contrato do cliente.
create table indices_reajuste (
  id text primary key,
  nome text not null,
  descricao text,
  created_at timestamptz default now()
);

-- Planos negociados: cada plano tem preço e comissão pré-definidos pelo admin.
-- O vendedor escolhe o plano ao lançar a venda e os campos vêm preenchidos;
-- o admin pode alterar tudo antes de aprovar. categoria_id é só pra
-- contabilidade/relatório; servico_id é o que está sendo vendido de fato.
create table planos (
  id text primary key,
  nome text not null,
  valor numeric not null default 0,
  categoria_id text references categories(id) on delete set null,
  servico_id text references servicos(id) on delete set null,
  comissao_percentual numeric not null default 0,
  contrato_meses int,
  recorrente boolean not null default false,
  frequencia text,
  ativo boolean not null default true,
  created_at timestamptz default now()
);

-- Cadastro de clientes.
create table clientes (
  id text primary key,
  nome_fantasia text not null,
  razao_social text,
  organizacao_rede text,
  ramo_negocio_id text references ramos_negocio(id) on delete set null,
  cidade text,
  estado text,
  endereco text,
  contato_nome text,
  contato_telefone text,
  contato_email text,
  indice_reajuste_id text references indices_reajuste(id) on delete set null,
  -- Data da próxima correção de contrato pelo índice acima. O admin atualiza
  -- (+1 ano) depois de aplicar o reajuste; o dashboard avisa quando essa data
  -- está a 30 dias ou menos, ou já passou.
  proximo_reajuste date,
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz default now()
);

-- Planos/serviços vinculados a cada cliente, cada um com seu próprio
-- ativo/inativo e desde quando o cliente tem aquele plano.
create table cliente_planos (
  id text primary key,
  cliente_id text not null references clientes(id) on delete cascade,
  plano_id text references planos(id) on delete set null,
  servico_id text references servicos(id) on delete set null,
  ativo boolean not null default true,
  cliente_desde date,
  created_at timestamptz default now()
);

-- Mural de orientação: recados que o admin escreve e todo vendedor lê.
-- "anexos" guarda uma lista [{ nome, path }] apontando para PDFs no bucket
-- "documentos" do Storage (o link é gerado na hora, não fica salvo aqui).
create table orientacoes (
  id text primary key,
  titulo text not null,
  conteudo text not null default '',
  anexos jsonb not null default '[]'::jsonb,
  fixado boolean not null default false,
  created_at timestamptz default now()
);

-- Meta da empresa por mês (formato 'YYYY-MM'), definida pelo admin. Quando
-- existe meta para o mês, ela vale no painel da equipe; quando não existe,
-- vale a soma das metas individuais dos vendedores.
create table metas_equipe (
  mes text primary key,
  valor numeric not null default 0
);

-- Lançamentos (receitas e despesas)
create table transactions (
  id text primary key,
  tipo text not null check (tipo in ('receita', 'despesa')),
  valor numeric not null,
  categoria_id text references categories(id) on delete set null,
  descricao text default '',
  data date not null,
  recorrente boolean not null default false,
  frequencia text,
  repeticoes int,
  ativacao text default 'imediata',
  data_ativacao date,
  dias_teste int,
  vendedor_id text references vendedores(id) on delete set null,
  data_cancelamento date,
  created_by uuid references profiles(id),
  -- Fluxo de revisão de vendas: o vendedor lança a venda com os dados do
  -- contrato, mas ela só "vale" (conta em vendido/comissão/dashboard) depois
  -- que o admin revisa, ajusta se precisar e aprova.
  status text not null default 'aprovado' check (status in ('pendente', 'aprovado', 'rejeitado')),
  cliente_nome text,
  contrato_meses int,
  forma_pagamento text,
  -- Plano negociado escolhido pelo vendedor. A comissão efetiva da venda é
  -- comissao_percentual (ajuste do admin) > comissão do plano > comissão padrão
  -- do vendedor. O vendedor não pode escrever comissao_percentual (ver trigger).
  plano_id text references planos(id) on delete set null,
  comissao_percentual numeric,
  -- Marca vendas antigas importadas em lote cuja data real não foi
  -- preservada na origem (ex.: contratos recorrentes legados, todos
  -- carimbados com a mesma data genérica). Usada pra excluir essas linhas
  -- da evolução mês a mês (evitaria um pico artificial num único mês),
  -- mantendo-as nos totais gerais/acumulados.
  data_estimada boolean not null default false,
  -- Contas a pagar/receber: por padrão todo lançamento já está liquidado
  -- (pago = true), como sempre foi. Só fica false quando alguém registra uma
  -- conta em aberto (com vencimento no futuro) — aí ela some do "pago"
  -- normal e passa a contar nos cartões de vencimento/atraso do dashboard.
  -- Lançamento recorrente não usa isso: cada ocorrência é calculada na hora,
  -- não fica guardada, então recorrente sempre é pago = true.
  pago boolean not null default true,
  data_vencimento date,
  created_at timestamptz default now()
);

-- Cria um perfil automaticamente (papel "vendedor") sempre que alguém se cadastra,
-- e vincula a um vendedor pendente se o e-mail bater com um convite feito pelo admin.
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nome, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', new.email), 'vendedor');

  update public.vendedores
  set profile_id = new.id
  where convite_email = new.email and profile_id is null;

  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Segurança: cada pessoa só acessa o que faz sentido pra ela
alter table profiles enable row level security;
alter table vendedores enable row level security;
alter table categories enable row level security;
alter table servicos enable row level security;
alter table ramos_negocio enable row level security;
alter table indices_reajuste enable row level security;
alter table planos enable row level security;
alter table clientes enable row level security;
alter table cliente_planos enable row level security;
alter table orientacoes enable row level security;
alter table metas_equipe enable row level security;
alter table transactions enable row level security;

-- Função auxiliar pra checar "é admin?" sem causar recursão de RLS.
-- IMPORTANTE: nunca faça "exists (select 1 from profiles ...)" direto dentro
-- de uma policy da própria tabela profiles — o Postgres detecta isso como
-- recursão infinita e a consulta falha com erro 500 (foi exatamente o bug
-- que quebrou o app em produção: todo mundo aparecia como "vendedor" porque
-- a consulta ao próprio perfil sempre falhava). Use sempre public.is_admin().
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create policy "Ver o próprio perfil, ou tudo se for admin" on profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "Atualizar o próprio perfil" on profiles
  for update using (id = auth.uid());
create policy "Admin atualiza qualquer perfil" on profiles
  for update using (public.is_admin());

create policy "Admin gerencia vendedores, vendedor vê o próprio" on vendedores
  for all using (public.is_admin() or profile_id = auth.uid());

create policy "Todo mundo logado vê categorias" on categories
  for select using (auth.uid() is not null);
create policy "Só admin cria categorias" on categories
  for insert with check (public.is_admin());
create policy "Só admin edita categorias" on categories
  for update using (public.is_admin());
create policy "Só admin apaga categorias" on categories
  for delete using (public.is_admin());

create policy "Todo mundo logado vê serviços" on servicos
  for select using (auth.uid() is not null);
create policy "Só admin gerencia serviços" on servicos
  for insert with check (public.is_admin());
create policy "Só admin edita serviços" on servicos
  for update using (public.is_admin());
create policy "Só admin apaga serviços" on servicos
  for delete using (public.is_admin());

create policy "Todo mundo logado vê ramos" on ramos_negocio
  for select using (auth.uid() is not null);
create policy "Só admin gerencia ramos" on ramos_negocio
  for insert with check (public.is_admin());
create policy "Só admin edita ramos" on ramos_negocio
  for update using (public.is_admin());
create policy "Só admin apaga ramos" on ramos_negocio
  for delete using (public.is_admin());

create policy "Todo mundo logado vê índices" on indices_reajuste
  for select using (auth.uid() is not null);
create policy "Só admin gerencia índices" on indices_reajuste
  for insert with check (public.is_admin());
create policy "Só admin edita índices" on indices_reajuste
  for update using (public.is_admin());
create policy "Só admin apaga índices" on indices_reajuste
  for delete using (public.is_admin());

create policy "Todo mundo logado vê planos" on planos
  for select using (auth.uid() is not null);
create policy "Só admin cria planos" on planos
  for insert with check (public.is_admin());
create policy "Só admin edita planos" on planos
  for update using (public.is_admin());
create policy "Só admin apaga planos" on planos
  for delete using (public.is_admin());

create policy "Todo mundo logado vê clientes" on clientes
  for select using (auth.uid() is not null);
create policy "Só admin gerencia clientes" on clientes
  for insert with check (public.is_admin());
create policy "Só admin edita clientes" on clientes
  for update using (public.is_admin());
create policy "Só admin apaga clientes" on clientes
  for delete using (public.is_admin());

create policy "Todo mundo logado vê cliente_planos" on cliente_planos
  for select using (auth.uid() is not null);
create policy "Só admin gerencia cliente_planos" on cliente_planos
  for insert with check (public.is_admin());
create policy "Só admin edita cliente_planos" on cliente_planos
  for update using (public.is_admin());
create policy "Só admin apaga cliente_planos" on cliente_planos
  for delete using (public.is_admin());

-- Visões seguras pro ranking de vendas entre vendedores: expõem só nome,
-- comissão padrão e vendas aprovadas de vendedores ATIVOS — nada de e-mail
-- de convite, metas, nem qualquer outra tabela. Criadas pelo dono (postgres,
-- que ignora RLS) de propósito: é a exceção controlada que deixa um vendedor
-- ver as vendas de outro sem abrir a tabela transactions inteira via policy.
create or replace view public.vendedores_publico as
select id, nome, comissao_percentual
from vendedores
where ativo = true;

create or replace view public.transacoes_ranking_publico as
select
  t.id, t.valor, t.data, t.recorrente, t.frequencia, t.repeticoes,
  t.ativacao, t.data_ativacao, t.dias_teste, t.data_cancelamento,
  t.vendedor_id, t.plano_id, t.comissao_percentual,
  t.tipo, t.status
from transactions t
join vendedores v on v.id = t.vendedor_id
where t.tipo = 'receita' and t.status = 'aprovado' and v.ativo = true;

grant select on public.vendedores_publico to authenticated;
grant select on public.transacoes_ranking_publico to authenticated;

create policy "Todo mundo logado vê orientações" on orientacoes
  for select using (auth.uid() is not null);
create policy "Só admin cria orientações" on orientacoes
  for insert with check (public.is_admin());
create policy "Só admin edita orientações" on orientacoes
  for update using (public.is_admin());
create policy "Só admin apaga orientações" on orientacoes
  for delete using (public.is_admin());

create policy "Todo mundo logado vê meta da equipe" on metas_equipe
  for select using (auth.uid() is not null);
create policy "Só admin define meta da equipe" on metas_equipe
  for all using (public.is_admin());

-- Bucket privado para os PDFs do mural. Leitura para qualquer pessoa logada,
-- envio e remoção só para admin. Só aceita PDF, até 10 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('documentos', 'documentos', false, 10485760, array['application/pdf'])
  on conflict (id) do nothing;

create policy "Logado lê documentos" on storage.objects
  for select using (bucket_id = 'documentos' and auth.uid() is not null);
create policy "Admin envia documentos" on storage.objects
  for insert with check (bucket_id = 'documentos' and public.is_admin());
create policy "Admin apaga documentos" on storage.objects
  for delete using (bucket_id = 'documentos' and public.is_admin());

create policy "Admin vê tudo, vendedor vê só o próprio" on transactions
  for select using (
    public.is_admin()
    or vendedor_id in (select id from vendedores where profile_id = auth.uid())
  );
create policy "Admin insere qualquer, vendedor insere só o próprio pendente" on transactions
  for insert with check (
    public.is_admin()
    or (
      vendedor_id in (select id from vendedores where profile_id = auth.uid())
      and status = 'pendente'
      and comissao_percentual is null
    )
  );
create policy "Admin edita tudo, vendedor edita só o próprio pendente" on transactions
  for update using (
    public.is_admin()
    or (
      vendedor_id in (select id from vendedores where profile_id = auth.uid())
      and status = 'pendente'
    )
  );
create policy "Admin apaga tudo, vendedor apaga só o próprio" on transactions
  for delete using (
    public.is_admin()
    or vendedor_id in (select id from vendedores where profile_id = auth.uid())
  );

-- Trava extra: mesmo numa edição permitida, só admin pode mudar o status da
-- venda ou definir a comissão daquela venda especificamente (o vendedor pode
-- editar os outros campos da própria venda pendente, mas não se auto-aprovar).
create or replace function public.protect_transaction_review_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.status := old.status;
    new.comissao_percentual := old.comissao_percentual;
  end if;
  return new;
end;
$$;

create trigger trg_protect_transaction_review_fields
  before update on transactions
  for each row execute function public.protect_transaction_review_fields();

-- ===================================================================
-- DEPOIS DE RODAR O SCRIPT ACIMA:
-- 1) Crie sua conta pelo app (tela de login, "Criar conta").
-- 2) Rode o comando abaixo (trocando o e-mail) pra virar administrador:
--
-- update profiles set role = 'admin' where id = (
--   select id from auth.users where email = 'seu@email.com'
-- );
--
-- 3) Pra convidar um vendedor: cadastre-o na tela "Previsão > Equipe de
--    vendas" com o e-mail dele. Peça pra essa pessoa criar a conta no
--    app usando EXATAMENTE esse e-mail — ela vira vendedor automaticamente
--    e já aparece vinculada.
-- ===================================================================
