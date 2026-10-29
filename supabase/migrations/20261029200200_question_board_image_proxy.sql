-- Имя файла картинки (Statue_of_Liberty.jpg, Colosseo.jpg …) выдавало ответ при долгом
-- нажатии или «открыть картинку». Игроки получают только адрес прокси по id вопроса,
-- настоящий URL читает сервер (service role) и только когда вопрос уже открыт.
create or replace view public.question_board
with (security_barrier = true, security_invoker = false) as
 SELECT q.id,
    q.room_id,
    q.round,
    q.category,
    q.value,
    q.row_index,
    q.col_index,
    q.status,
        CASE
            WHEN (q.status = 'hidden'::text) THEN NULL::text
            ELSE q.prompt
        END AS prompt,
        CASE
            WHEN (q.status = 'hidden'::text) THEN NULL::text
            ELSE q.special
        END AS special,
        CASE
            WHEN (q.status = 'hidden'::text) THEN NULL::uuid
            ELSE q.assigned_player_id
        END AS assigned_player_id,
        CASE
            WHEN (q.status = 'answered'::text) THEN s.answer
            ELSE NULL::text
        END AS revealed_answer,
        CASE
            WHEN (q.status = 'hidden'::text) THEN 'text'::text
            ELSE q.kind
        END AS kind,
        CASE
            WHEN (q.status = 'hidden'::text) THEN NULL::text
            ELSE q.youtube_id
        END AS youtube_id,
        CASE
            WHEN (q.status = 'hidden'::text) THEN NULL::text
            ELSE q.vk_url
        END AS vk_url,
        CASE
            WHEN (q.status = 'hidden'::text) THEN NULL::text
            ELSE q.rutube_url
        END AS rutube_url,
        CASE
            WHEN (q.status = 'hidden'::text) OR (q.image_url IS NULL) THEN NULL::text
            ELSE ('/api/media/image/'::text || (q.id)::text)
        END AS image_url,
        CASE
            WHEN (q.status = 'hidden'::text) THEN NULL::integer
            ELSE q.start_seconds
        END AS start_seconds,
        CASE
            WHEN (q.status = 'hidden'::text) THEN NULL::integer
            ELSE q.end_seconds
        END AS end_seconds,
        CASE
            WHEN (q.status = 'hidden'::text) THEN false
            ELSE q.curtain
        END AS curtain
   FROM (questions q
     LEFT JOIN question_secrets s ON ((s.question_id = q.id)));

grant select on public.question_board to anon, authenticated, service_role;

notify pgrst, 'reload schema';
