-- Утечки ответа в тексте вопроса (аудит 2026-10-29): ответ, его часть, транслит
-- или название звучащего трека прямо в вопросе. Старые миграции не трогаем.
-- Резервная копия строк до правки: /workspace/tvoyak-qa/leak-backup.json (вне репозитория).

update public.question_bank
set prompt = 'Как называется автоматический плейлист YouTube, куда попадают ролики, которым вы поставили палец вверх?',
    variants = array['Понравившиеся видео', 'Liked videos']::text[]
where category = 'YouTube'
  and prompt = 'Как называется автоматический плейлист из роликов, которым пользователь поставил отметку «нравится»?';

update public.question_bank
set prompt = 'Какая группа сняла этот клип?'
where category = 'YouTube'
  and prompt = 'Какая группа сняла клип Thunder?';

update public.question_bank
set prompt = 'Кто исполняет песню из этого клипа?'
where category = 'YouTube'
  and prompt = 'Кто исполняет Can''t Stop the Feeling?';

update public.question_bank
set prompt = 'Кто поёт в этом клипе? Назовите британского певца.'
where category = 'YouTube'
  and prompt = 'Кто поёт в клипе Perfect?';

update public.question_bank
set prompt = 'Кто поёт в этом клипе? Назовите британскую певицу.'
where category = 'YouTube'
  and prompt = 'Кто поёт в этом клипе Hello?';

update public.question_bank
set prompt = 'Кто снимается в этом клипе в джунглях?'
where category = 'YouTube'
  and prompt = 'Кто снимается в клипе Roar?';

update public.question_bank
set prompt = 'Чей клип на экране?'
where category = 'YouTube'
  and prompt = 'Чей клип Shake It Off на экране?';

update public.question_bank
set prompt = 'Как зовут певицу, чей тур The Eras Tour стал самым кассовым концертным туром в истории?'
where category = 'Артисты'
  and prompt = 'Как зовут певицу, фанатов которой называют свифти?';

update public.question_bank
set prompt = 'Как зовут блогерку, которая в начале 2010-х стала одной из самых популярных девушек русского YouTube благодаря видеодневнику?'
where category = 'Блогеры'
  and prompt = 'Как зовут блогерку, которая вела видеодневник и чья фамилия созвучна английскому слову clap?';

update public.question_bank
set prompt = 'Какая настоящая фамилия у детского блогера Влада А4?',
    variants = array['Бумага']::text[]
where category = 'Блогеры'
  and prompt = 'Какой детский блогер носит прозвище А4?';

update public.question_bank
set prompt = 'Как называется формат ролика, где автор снимает свой обычный день и разговаривает со зрителями в камеру? Одно слово.',
    variants = array['Vlog', 'Видеоблог']::text[]
where category = 'Блогеры'
  and prompt = 'Какой формат ролика: автор говорит в камеру и отвечает на вопросы зрителей? Одно слово.';

update public.question_bank
set prompt = 'Как зовут летсплейщика, чей игровой канал с приставкой Play знаменит прохождениями хорроров?'
where category = 'Блогеры'
  and prompt = 'Кто ведёт игровой канал Kuplinov Play?';

update public.question_bank
set prompt = 'Как зовут ведущего интернет-шоу «+100500» с приколами из сети?',
    variants = array['Голополосов', 'Макс Голополосов']::text[]
where category = 'Блогеры'
  and prompt = 'Кто вёл интернет-шоу с приколами из сети, в названии которого плюс и число сто пятьсот?';

update public.question_bank
set prompt = 'Как зовут жителя ананаса на дне океана, который работает поваром в «Красти Крабе»?'
where category = 'Мультфильмы'
  and prompt = 'Как зовут жёлтого губку, который живёт в ананасе под водой?';

update public.question_bank
set prompt = 'Как называется мультфильм DreamWorks, где неуклюжий По становится Воином Дракона?'
where category = 'Мультфильмы'
  and prompt = 'Как называется мультфильм про панду, которая учит кунг-фу?';

update public.question_bank
set prompt = 'Как называется профиль в соцсети, посты которого видят только одобренные подписчики?',
    variants = array['Приватный аккаунт', 'Закрытый профиль']::text[]
where category = 'Соцсети'
  and prompt = 'Как называется закрытый профиль, куда пускают по запросу?';

update public.question_bank
set prompt = 'Какую российскую соцсеть Павел Дуров основал в 2006 году?'
where category = 'Соцсети'
  and prompt = 'Как называется российская соцсеть с синим логотипом «вк»?';

update public.question_bank
set variants = array['Твиттер']::text[]
where category = 'Соцсети'
  and prompt = 'Как называется соцсеть с птичкой, которую переименовали в X?';

update public.question_bank
set prompt = 'Как называется вид спорта, где бойцы в восьмиугольной клетке сочетают удары и борьбу?'
where category = 'Спорт'
  and prompt = 'Как называется единоборство в восьмиугольной клетке?';

update public.question_bank
set prompt = 'Какой турнир сборных ФИФА проводит раз в четыре года — в 2022 году он прошёл в Катаре?'
where category = 'Спорт'
  and prompt = 'Как называется турнир, где сборные мира раз в четыре года играют в футбол?';

update public.question_bank
set variants = array['Миджорни', 'Мидджорни']::text[]
where category = 'Технологии'
  and prompt = 'Какой сервис рисует картинки по текстовому запросу и известен командой /imagine?';

update public.question_bank
set prompt = 'Какой российский музыкальный стриминг подбирает треки в бесконечной «Моей волне»?'
where category = 'Чарты'
  and prompt = 'Какой российский стриминг входит в экосистему Яндекса?';

update public.question_bank
set prompt = 'Кто записал этот электронный трек? Назовите диджея.'
where category = 'Чарты'
  and prompt = 'Кто записал Faded?';

update public.question_bank
set prompt = 'Кто исполняет эту песню в стиле синти-попа 80-х?'
where category = 'Чарты'
  and prompt = 'Кто исполняет Blinding Lights?';

update public.question_bank
set prompt = 'Кто поёт эту испаноязычную песню? Назовите главного исполнителя.'
where category = 'Чарты'
  and prompt = 'Кто поёт Despacito вместе с Дэдди Янки?';

update public.question_bank
set prompt = 'Чей это хит? Назовите британского певца.'
where category = 'Чарты'
  and prompt = 'Кто поёт Shape of You?';

update public.question_bank
set prompt = 'Кто автор этого фанк-хита? Назовите продюсера, а не вокалиста.'
where category = 'Чарты'
  and prompt = 'Кто поёт вместе с Бруно Марсом в Uptown Funk?';

update public.question_bank
set prompt = 'Чей это трек? Назовите исполнителя.'
where category = 'Чарты'
  and prompt = 'Чей это трек Gangnam Style?';

update public.question_bank
set prompt = 'Чья это песня? Назовите американскую певицу.'
where category = 'Чарты'
  and prompt = 'Чья это песня Blank Space?';

-- Ответ совпадает с темой или с самим описанием — честно переписать нельзя, убираем из ротации.
delete from public.question_bank
where category = 'YouTube'
  and prompt = 'Как коротко называют человека, который снимает и выкладывает ролики на видеохостинг?';

delete from public.question_bank
where category = 'Блогеры'
  and prompt = 'Как называется канал скетчей, в названии которого есть слово Maps?';

delete from public.question_bank
where category = 'Блогеры'
  and prompt = 'Как называется командный проект обзоров гаджетов, чьё имя по-русски звучит как «розетка»? Напишите латиницей.';

delete from public.question_bank
where category = 'Мемы'
  and prompt = 'Как называется мем, где девушка орёт на белого кота за столом?';

delete from public.question_bank
where category = 'Соцсети'
  and prompt = 'Какой мессенджер от «ВКонтакте» для переписок?';

delete from public.question_bank
where category = 'Чарты'
  and prompt = 'Как коротко называют музыкальный раздел «ВКонтакте»?';

delete from public.question_bank
where category = 'Чарты'
  and prompt = 'Как называется музыкальный сервис Apple?';

delete from public.question_bank
where category = 'Чарты'
  and prompt = 'Как называется подборка «топ дня» или «хиты» в стриминге, где собраны самые популярные треки прямо сейчас?';
