-- Экран ведущего читает rooms вместе с host_starts_media.
-- В init select на rooms выдан по колонкам, а media.sql добавил host_starts_media
-- без grant. Запрос anon тогда падает целиком: 42501 permission denied for table rooms.
-- Колонки id, code, status, host_mode, created_at уже выданы и здесь не трогаются.

grant select (host_starts_media) on table public.rooms to anon, authenticated;

notify pgrst, 'reload schema';
