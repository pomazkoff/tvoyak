-- Публичное имя ведущего для подписи на финале.
-- null — имени нет (комната без входа или старая комната).
-- В ссылки это поле не подставляется. Почту сюда не пишем.

alter table public.rooms
  add column if not exists host_label text;

alter table public.rooms drop constraint if exists rooms_host_label_len;

alter table public.rooms
  add constraint rooms_host_label_len
  check (host_label is null or char_length(btrim(host_label)) between 1 and 40);

comment on column public.rooms.host_label is
  'Как подписать «Вас приглашает …» на финале. Не email, в URL не попадает.';

grant select (host_label) on table public.rooms to anon, authenticated;
