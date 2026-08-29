-- Migration 009: Super Admin Role
-- Governance V6: introduz role='super_admin' como substituto de 'admin'
-- @project JMeter Performance Dashboard

-- Remove constraint existente, se houver
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS user_role_check;

-- Adiciona constraint atualizada incluindo super_admin
ALTER TABLE "user" ADD CONSTRAINT user_role_check
  CHECK (role IN ('user', 'admin', 'super_admin'));

-- Promove admins existentes para super_admin
UPDATE "user" SET role = 'super_admin' WHERE role = 'admin';
