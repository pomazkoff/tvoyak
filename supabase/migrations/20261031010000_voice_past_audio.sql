-- «Голос из прошлого» не открывался у ведущего: все 17 вопросов были только
-- на YouTube (без VK и без своего звука), а YouTube в России без VPN не грузится —
-- на экране «Ролик не открылся». Вопросы под шторкой (только звук), поэтому
-- кладём свой звук: public/media/voice-past/<youtube_id>.m4a — та же дорожка,
-- до start_seconds тишина, так что окно start/end совпадает с YouTube.
-- Плеер берёт свой звук первым для вопросов под шторкой; youtube_id остаётся.

alter table public.question_bank drop constraint if exists question_bank_audio_check;
alter table public.question_bank add constraint question_bank_audio_check
  check (
    audio_url is null
    or audio_url ~ '^https://audio-ssl\.itunes\.apple\.com/'
    or audio_url ~ '^/media/voice-past/[A-Za-z0-9_-]+\.m4a$'
  );

update public.question_bank
set audio_url = '/media/voice-past/' || youtube_id || '.m4a'
where category = 'Голос из прошлого'
  and youtube_id in (
    'kcinaQXzTlU',
    '01HV5o2xoUE',
    't3yh7fMfxnk',
    'kY4iToWbTcE',
    'GK55ElsVzxM',
    'qZAejyN9Hxo',
    'y1UVoJ4Wp-o',
    'ZY9kR-antsI',
    'XYl3k_q5GTI',
    'B-JMkYBQsuY',
    '56X9AP6R8v8',
    'qR9MJYRla_Q',
    'Q-vn3rf2ZOk',
    'u10AiRA5rDc',
    'KV8NUn4S6UQ',
    '3omJPklVDHs',
    'u_-LDuDpvB0'
  )
  and audio_url is null;

-- Уже созданные комнаты (в том числе идущие игры) — тот же звук.
update public.questions q
set audio_url = b.audio_url
from public.question_bank b
where q.category = 'Голос из прошлого'
  and b.category = q.category
  and b.youtube_id = q.youtube_id
  and b.audio_url is not null
  and q.audio_url is null;
