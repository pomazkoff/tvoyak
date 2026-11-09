-- «Детский рисунок», волна 5, 09.11.2026 (scripts/picture-tasks/kids.ts 4).
-- Новые фильмы/мультфильмы; ИИ-рисунки без текста и логотипов.
-- Аддитивно: добавляем 6 заданий ВЫКЛЮЧЕННЫМИ (enabled = false) — включает Илья на /admin/pictures.

insert into public.question_bank (category, prompt, answer, variants, kind, image_url, curtain, value, picture, picture_spec, reveal_seconds, image_credit, image_license, image_page, enabled) values
  ('Детский рисунок', 'Детский рисунок № 87: мультфильм.', 'Тайна Коко', array['Коко', 'Coco']::text[], 'image', '/pictures/k/758708dd423862e6de5c.jpg', false, 300, 'kids', '{"effect":"blur"}'::jsonb, 10, 'Рисунок нарисован ИИ для «Твояка»', 'ИИ-рисунок (фан-арт)', null, false),
  ('Детский рисунок', 'Детский рисунок № 88: мультфильм.', 'Рапунцель: Запутанная история', array['Рапунцель', 'Запутанная история', 'Tangled']::text[], 'image', '/pictures/k/df181acccd5a0645a691.jpg', false, 300, 'kids', '{"effect":"blur"}'::jsonb, 10, 'Рисунок нарисован ИИ для «Твояка»', 'ИИ-рисунок (фан-арт)', null, false),
  ('Детский рисунок', 'Детский рисунок № 89: фильм.', 'Гринч', array['Гринч — похититель Рождества', 'The Grinch', 'Grinch']::text[], 'image', '/pictures/k/0fe4ea1b80de78c01f0e.jpg', false, 300, 'kids', '{"effect":"blur"}'::jsonb, 10, 'Рисунок нарисован ИИ для «Твояка»', 'ИИ-рисунок (фан-арт)', null, false),
  ('Детский рисунок', 'Детский рисунок № 90: мультфильм.', 'Зверопой', array['Sing']::text[], 'image', '/pictures/k/18d40c4c98d366681dfe.jpg', false, 300, 'kids', '{"effect":"blur"}'::jsonb, 10, 'Рисунок нарисован ИИ для «Твояка»', 'ИИ-рисунок (фан-арт)', null, false),
  ('Детский рисунок', 'Детский рисунок № 91: мультфильм.', 'Мулан', array['Mulan']::text[], 'image', '/pictures/k/389dcff13cd7236b13da.jpg', false, 300, 'kids', '{"effect":"blur"}'::jsonb, 10, 'Рисунок нарисован ИИ для «Твояка»', 'ИИ-рисунок (фан-арт)', null, false),
  ('Детский рисунок', 'Детский рисунок № 92: мультфильм.', 'Три богатыря', array['Три богатыря на дальних берегах', 'Богатыри']::text[], 'image', '/pictures/k/98c4a3b096b7f71dcd52.jpg', false, 300, 'kids', '{"effect":"blur"}'::jsonb, 10, 'Рисунок нарисован ИИ для «Твояка»', 'ИИ-рисунок (фан-арт)', null, false)
on conflict (category, prompt) do nothing;
