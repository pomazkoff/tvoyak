-- «Сюрпризы»: ответ не в том формате (КАПС / одно слово) засчитывается как
-- неверный с method = 'format'. Расширяем допустимые значения.
alter table public.answers drop constraint if exists answers_method_check;
alter table public.answers
  add constraint answers_method_check
  check (method is null or method in ('exact', 'fuzzy', 'llm', 'host', 'timeout', 'format'));
