-- «Один пиксель»: у «Девятого вала» Commons отдал в подпись всю биографию автора.
update public.question_bank
set image_credit = 'Ivan Aivazovsky · Public domain · Wikimedia Commons'
where category = 'Один пиксель' and answer = 'Девятый вал'
  and image_credit like 'Hovhannes Aivazovsky (1817 - 1900)%';
