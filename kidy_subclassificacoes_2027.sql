-- Executar no SQL Editor do Supabase antes de instalar a interface.
create table if not exists public.kidy_cliente_classificacoes (
  codigo_cliente text primary key,
  classificacoes text[] not null default '{}',
  atualizado_por text not null,
  atualizado_em timestamptz not null default now(),
  constraint kidy_classificacoes_validas check (
    classificacoes <@ array[
      'COMPRA_EM_DIA','SEM_COMPRA_ULTIMA_COLECAO','BLOQUEADA',
      'LIMITE_SEM_PEDIDO','REDUCAO_COMPRA','CADASTRO_VALIDAR',
      'POTENCIAL_EXPANSAO'
    ]::text[]
  )
);
create table if not exists public.kidy_cliente_classificacoes_log (
  id bigint generated always as identity primary key,
  codigo_cliente text not null,
  classificacoes_anteriores text[] not null default '{}',
  classificacoes_novas text[] not null default '{}',
  alterado_por text not null,
  alterado_em timestamptz not null default now()
);
create index if not exists kidy_classificacoes_log_cliente_idx
  on public.kidy_cliente_classificacoes_log (codigo_cliente,alterado_em desc);
alter table public.kidy_cliente_classificacoes enable row level security;
alter table public.kidy_cliente_classificacoes_log enable row level security;
-- Sem policies para anon/authenticated: acesso somente pelo servidor com service_role.
