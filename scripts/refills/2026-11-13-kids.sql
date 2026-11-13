-- «Детский рисунок», волна 6, 13.11.2026 (scripts/picture-tasks/kids.ts 6).
-- Новые фильмы/мультфильмы; ИИ-рисунки без текста и логотипов.
-- Аддитивно: добавляем 6 заданий ВЫКЛЮЧЕННЫМИ (enabled = false) — включает Илья на /admin/pictures.

insert into public.question_bank (category, prompt, answer, variants, kind, image_url, curtain, value, picture, picture_spec, reveal_seconds, image_credit, image_license, image_page, enabled) values
  ('Детский рисунок', 'Детский рисунок № 93: мультфильм.', 'Русалочка', array['Маленькая русалочка', 'The Little Mermaid', 'Ариэль']::text[], 'image', '/pictures/k/864225f5352b5a128cac.jpg', false, 300, 'kids', '{"effect":"blur"}'::jsonb, 10, 'Рисунок нарисован ИИ для «Твояка»', 'ИИ-рисунок (фан-арт)', null, false),
  ('Детский рисунок', 'Детский рисунок № 94: мультфильм.', 'Дамбо', array['Dumbo']::text[], 'image', '/pictures/k/d324750db7d42afc14f3.jpg', false, 300, 'kids', '{"effect":"blur"}'::jsonb, 10, 'Рисунок нарисован ИИ для «Твояка»', 'ИИ-рисунок (фан-арт)', null, false),
  ('Детский рисунок', 'Детский рисунок № 95: мультфильм.', 'Кот в сапогах', array['Puss in Boots', 'Кот в сапогах: Последнее желание']::text[], 'image', '/pictures/k/06ce1f6c66c46c9972a2.jpg', false, 300, 'kids', '{"effect":"blur"}'::jsonb, 10, 'Рисунок нарисован ИИ для «Твояка»', 'ИИ-рисунок (фан-арт)', null, false),
  ('Детский рисунок', 'Детский рисунок № 96: фильм.', 'Чарли и шоколадная фабрика', array['Чарли и шоколадная фабрика', 'Вонка', 'Charlie and the Chocolate Factory', 'Wonka']::text[], 'image', '/pictures/k/4438f6cd4c00d11addf9.jpg', false, 300, 'kids', '{"effect":"blur"}'::jsonb, 10, 'Рисунок нарисован ИИ для «Твояка»', 'ИИ-рисунок (фан-арт)', null, false),
  ('Детский рисунок', 'Детский рисунок № 97: фильм.', 'Морозко', array['Морозко']::text[], 'image', '/pictures/k/20cc3f79c61481ca502a.jpg', false, 300, 'kids', '{"effect":"blur"}'::jsonb, 10, 'Рисунок нарисован ИИ для «Твояка»', 'ИИ-рисунок (фан-арт)', null, false),
  ('Детский рисунок', 'Детский рисунок № 98: фильм.', 'Хроники Нарнии', array['Хроники Нарнии: Лев, колдунья и волшебный шкаф', 'Нарния', 'Narnia']::text[], 'image', '/pictures/k/e68a3ca0a727457d932f.jpg', false, 300, 'kids', '{"effect":"blur"}'::jsonb, 10, 'Рисунок нарисован ИИ для «Твояка»', 'ИИ-рисунок (фан-арт)', null, false)
on conflict (category, prompt) do nothing;
