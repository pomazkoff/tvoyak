-- Голос ведущего дочитывает вопрос, и только потом стартует трек/видео.
--
-- Раньше в режиме автозапуска сервер ставил media_started_at сразу при
-- открытии вопроса, и экран ведущего тут же включал трек — поверх голоса.
-- Теперь, если в комнате включён голос ведущего (по умолчанию — у бота),
-- экран ведущего держит медиа до конца чтения (со страховкой по времени) и
-- сам отмечает старт через mark_media_started. Телефоны «не у экрана»
-- стартуют с этой отметки, как и раньше.
--
-- ПОРЯДОК ВЫКАТКИ: сначала код (экран ведущего, который сам ставит отметку),
-- потом эта миграция. Без миграции новый код тоже работает: телефоны
-- просто переотмечаются после чтения вопроса.

create or replace function public.game_states_mark_media()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.current_question_id is null
     or new.phase in ('lobby', 'board', 'cat_pick', 'finished') then
    return new;
  end if;
  update public.questions q
  set media_started_at = clock_timestamp()
  from public.rooms r
  where q.id = new.current_question_id
    and r.id = q.room_id
    and q.media_started_at is null
    and q.kind in ('video', 'music')
    and not (r.host_mode = 'human' and r.host_starts_media)
    -- Голос ведущего включён: отметку поставит экран ведущего после чтения.
    and not coalesce(r.host_voice, r.host_mode = 'bot');
  return new;
end;
$$;

revoke all on function public.game_states_mark_media() from public, anon, authenticated;
