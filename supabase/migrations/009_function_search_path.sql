-- Trigger function does not depend on caller-controlled schemas.
alter function public.set_updated_at() set search_path = '';
