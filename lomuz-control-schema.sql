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

-- Vendedores: dados de comissão e meta, ligados a um perfil (quando a pessoa já tem login)
create table vendedores (
  id text primary key,
  profile_id uuid unique references profiles(id) on delete set null,
  convite_email text,
  nome text not null,
  comissao_percentual numeric not null default 0,
  meta_padrao numeric not null default 0,
  metas jsonb not null default '{}'::jsonb,
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

create policy "Admin vê tudo, vendedor vê só o próprio" on transactions
  for select using (
    public.is_admin()
    or vendedor_id in (select id from vendedores where profile_id = auth.uid())
  );
create policy "Admin insere qualquer, vendedor insere só o próprio" on transactions
  for insert with check (
    public.is_admin()
    or vendedor_id in (select id from vendedores where profile_id = auth.uid())
  );
create policy "Admin edita tudo, vendedor edita só o próprio" on transactions
  for update using (
    public.is_admin()
    or vendedor_id in (select id from vendedores where profile_id = auth.uid())
  );
create policy "Admin apaga tudo, vendedor apaga só o próprio" on transactions
  for delete using (
    public.is_admin()
    or vendedor_id in (select id from vendedores where profile_id = auth.uid())
  );

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
