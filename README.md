# Lomuz Control — Web App

Aplicativo de controle financeiro com login real, múltiplos usuários (admin e vendedores) e banco de dados na nuvem (Supabase). Funciona em qualquer navegador — celular, tablet ou computador.

## 1. Configurar o banco de dados (Supabase)

1. Crie uma conta grátis em **supabase.com** → "New project"
2. No menu lateral, abra **SQL Editor** → "New query"
3. Cole o conteúdo do arquivo `lomuz-control-schema.sql` (na pasta acima desta) → clique em **Run**
4. Vá em **Settings → API** e copie: **Project URL** e **anon public key**

## 2. Configurar o projeto

1. Instale as dependências:
   ```
   npm install
   ```
2. Abra `src/supabaseClient.js` e troque os dois valores pelos seus:
   ```js
   const SUPABASE_URL = 'sua-project-url-aqui';
   const SUPABASE_ANON_KEY = 'sua-anon-key-aqui';
   ```

## 3. Testar localmente

```
npm run dev
```
Abre em `http://localhost:5173`. Crie sua conta pela tela de login ("Criar conta").

Depois, no SQL Editor do Supabase, rode (trocando o e-mail pelo seu) pra virar administrador:
```sql
update profiles set role = 'admin' where id = (
  select id from auth.users where email = 'seu@email.com'
);
```
Saia do app e entre de novo pra a mudança valer.

## 4. Publicar (deixar no ar pra sua equipe acessar)

Suba esta pasta para um repositório no GitHub e conecte em:
- **vercel.com** (New Project → importar do GitHub) — ou —
- **netlify.com** (Add new site → importar do GitHub)

Ambos detectam automaticamente que é um projeto Vite e publicam sozinhos. Em poucos minutos você tem uma URL pra compartilhar com a equipe.

## 5. Convidar vendedores

Na tela **Previsão → Equipe de vendas**, cadastre cada vendedor com nome, e-mail e comissão. Peça pra cada um criar a própria conta no app usando **exatamente esse e-mail** — a conta deles é vinculada automaticamente ao cadastro.

## O que mudou em relação à versão de teste

- Login de verdade (cada pessoa com sua própria conta e senha)
- Os dados ficam no Supabase, acessíveis de qualquer aparelho
- O papel (Admin/Vendedor) agora vem do cadastro de cada pessoa, não é mais um botão de troca
- Segurança aplicada no próprio banco: um vendedor nunca consegue ver dados de outro, mesmo tentando pela força
