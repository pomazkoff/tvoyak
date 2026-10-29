-- Отдельный проход ревью «утечка ответа»: детерминированная проверка + LLM-проверки.
alter table public.pack_reviews drop constraint pack_reviews_pass_check;
alter table public.pack_reviews
  add constraint pack_reviews_pass_check check (
    pass in ('safety', 'fact', 'freshness', 'difficulty', 'duplicates', 'leak')
  );
