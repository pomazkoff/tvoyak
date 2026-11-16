-- «Детский рисунок», волна 7, 16.11.2026 (scripts/picture-tasks/kids.ts 7).
-- Новые фильмы/мультфильмы; ИИ-рисунки без текста и логотипов.
-- Аддитивно: добавляем 6 заданий ВЫКЛЮЧЕННЫМИ (enabled = false) — включает Илья на /admin/pictures.

insert into public.question_bank (category, prompt, answer, variants, kind, image_url, curtain, value, picture, picture_spec, reveal_seconds, image_credit, image_license, image_page, enabled) values
  ('Детский рисунок', 'Детский рисунок № 99: мультфильм.', 'Пиноккио', array['Pinocchio']::text[], 'image', '/pictures/k/c553a4864efcfa4b07f5.jpg', false, 300, 'kids', '{"effect":"blur"}'::jsonb, 10, 'Рисунок нарисован ИИ для «Твояка»', 'ИИ-рисунок (фан-арт)', null, false),
  ('Детский рисунок', 'Детский рисунок № 100: мультфильм.', 'Энканто', array['Encanto', 'Энканто: Мир магии']::text[], 'image', '/pictures/k/106a59be73bd4c7b26a1.jpg', false, 300, 'kids', '{"effect":"blur"}'::jsonb, 10, 'Рисунок нарисован ИИ для «Твояка»', 'ИИ-рисунок (фан-арт)', null, false),
  ('Детский рисунок', 'Детский рисунок № 101: мультфильм.', 'Тарзан', array['Tarzan']::text[], 'image', '/pictures/k/3ee684283e11f7904ac6.jpg', false, 300, 'kids', '{"effect":"blur"}'::jsonb, 10, 'Рисунок нарисован ИИ для «Твояка»', 'ИИ-рисунок (фан-арт)', null, false),
  ('Детский рисунок', 'Детский рисунок № 102: мультфильм.', 'Маугли', array['Книга джунглей', 'The Jungle Book']::text[], 'image', '/pictures/k/ff1d867daf44a9e49fc5.jpg', false, 300, 'kids', '{"effect":"blur"}'::jsonb, 10, 'Рисунок нарисован ИИ для «Твояка»', 'ИИ-рисунок (фан-арт)', null, false),
  ('Детский рисунок', 'Детский рисунок № 103: фильм.', 'Мэри Поппинс', array['Мэри Поппинс, до свидания', 'Mary Poppins']::text[], 'image', '/pictures/k/fc0a90f348265e77bf92.jpg', false, 300, 'kids', '{"effect":"blur"}'::jsonb, 10, 'Рисунок нарисован ИИ для «Твояка»', 'ИИ-рисунок (фан-арт)', null, false),
  ('Детский рисунок', 'Детский рисунок № 104: фильм.', 'Кавказская пленница', array['Кавказская пленница, или Новые приключения Шурика']::text[], 'image', '/pictures/k/a14f3ae62eca57198748.jpg', false, 300, 'kids', '{"effect":"blur"}'::jsonb, 10, 'Рисунок нарисован ИИ для «Твояка»', 'ИИ-рисунок (фан-арт)', null, false)
on conflict (category, prompt) do nothing;
