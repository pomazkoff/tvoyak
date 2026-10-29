-- Realtime: канал клиента подписан на players, game_states, buzzes и rooms.
-- Если хоть одной таблицы нет в публикации, Supabase Realtime молча не шлёт
-- в этот канал НИЧЕГО — даже события по players и game_states. Так комната
-- SXNJ застряла на лобби: start_game прошёл, а экраны не узнали.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'buzzes'
  ) then
    alter publication supabase_realtime add table public.buzzes;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;
end;
$$;
