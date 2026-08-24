-- Migration 007: Super Admin role
-- Adiciona campo de role ao usuário para controle de acesso administrativo

alter table "user" add column role varchar(20) not null default 'user' check (role in ('user', 'admin'));

-- Índice para consultas rápidas de admins
create index user_role_idx on "user" (role) where role = 'admin';

-- Comentários
comment on column "user".role is 'Role do usuário: user (normal) ou admin (super admin com acesso ao painel administrativo)';
