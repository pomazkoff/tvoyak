-- «Детский рисунок», 23.11.2026 (№ 105–112); ИИ-рисунки без текста и логотипов (встроенная генерация).
-- Аддитивно: добавляем 8 заданий ВЫКЛЮЧЕННЫМИ (enabled = false) — включает Илья на /admin/pictures.
-- kids.ts не менялся: ветка content/refill-2026-11-16 (волна 7) ещё не влита.

insert into public.question_bank (category, prompt, answer, variants, kind, image_url, curtain, value, picture, picture_spec, reveal_seconds, image_credit, image_license, image_page, enabled) values
  ('Детский рисунок', 'Детский рисунок № 105: мультфильм.', 'Питер Пэн', array['Peter Pan']::text[], 'image', '/pictures/k/43f19219cd4898a0bfb1.jpg', false, 300, 'kids', '{"effect":"blur"}'::jsonb, 10, 'Рисунок нарисован ИИ для «Твояка»', 'ИИ-рисунок (фан-арт)', null, false),
  ('Детский рисунок', 'Детский рисунок № 106: мультфильм.', '101 далматинец', array['Сто один далматинец', '101 Dalmatians']::text[], 'image', '/pictures/k/fee479880260545b1845.jpg', false, 300, 'kids', '{"effect":"blur"}'::jsonb, 10, 'Рисунок нарисован ИИ для «Твояка»', 'ИИ-рисунок (фан-арт)', null, false),
  ('Детский рисунок', 'Детский рисунок № 107: мультфильм.', 'Бэмби', array['Bambi']::text[], 'image', '/pictures/k/8c7c88f7cea573818357.jpg', false, 300, 'kids', '{"effect":"blur"}'::jsonb, 10, 'Рисунок нарисован ИИ для «Твояка»', 'ИИ-рисунок (фан-арт)', null, false),
  ('Детский рисунок', 'Детский рисунок № 108: мультфильм.', 'Умка', array[]::text[], 'image', '/pictures/k/368fb505414854e1bc48.jpg', false, 300, 'kids', '{"effect":"blur"}'::jsonb, 10, 'Рисунок нарисован ИИ для «Твояка»', 'ИИ-рисунок (фан-арт)', null, false),
  ('Детский рисунок', 'Детский рисунок № 109: мультфильм.', 'Вовка в Тридевятом царстве', array['Вовка в тридевятом царстве']::text[], 'image', '/pictures/k/6b6e6bb3650b90a4e69d.jpg', false, 300, 'kids', '{"effect":"blur"}'::jsonb, 10, 'Рисунок нарисован ИИ для «Твояка»', 'ИИ-рисунок (фан-арт)', null, false),
  ('Детский рисунок', 'Детский рисунок № 110: мультфильм.', 'Тайна третьей планеты', array[]::text[], 'image', '/pictures/k/5e32afae147655c6907a.jpg', false, 300, 'kids', '{"effect":"blur"}'::jsonb, 10, 'Рисунок нарисован ИИ для «Твояка»', 'ИИ-рисунок (фан-арт)', null, false),
  ('Детский рисунок', 'Детский рисунок № 111: фильм.', 'Джентльмены удачи', array[]::text[], 'image', '/pictures/k/ecb913c8a84ad35e059f.jpg', false, 300, 'kids', '{"effect":"blur"}'::jsonb, 10, 'Рисунок нарисован ИИ для «Твояка»', 'ИИ-рисунок (фан-арт)', null, false),
  ('Детский рисунок', 'Детский рисунок № 112: мультфильм.', 'Остров сокровищ', array['Treasure Island']::text[], 'image', '/pictures/k/d097d122d3e953d764b3.jpg', false, 300, 'kids', '{"effect":"blur"}'::jsonb, 10, 'Рисунок нарисован ИИ для «Твояка»', 'ИИ-рисунок (фан-арт)', null, false)
on conflict (category, prompt) do nothing;
