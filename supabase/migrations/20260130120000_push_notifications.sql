-- Migration skipped because it is already included in 20260128195430_remote_schema.sql
-- This file is kept to maintain migration history order.

-- Grants
grant all on table public.push_subscriptions to authenticated;
grant all on table public.push_subscriptions to service_role;
