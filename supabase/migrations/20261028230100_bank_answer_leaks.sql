-- Вопросы, в тексте которых уже был засчитанный ответ. Старые миграции не трогаем:
-- на удалённой базе они уже применены, правки приходят отдельным update.

update public.question_bank
set prompt = 'Какой сертификационный статус в музыкальных чартах выше золотого?'
where category = 'Чарты'
  and prompt = 'Какой значок ставят в чартах, когда песня набирает очень много прослушиваний: золото или платина? Назовите более высокий статус.';

update public.question_bank
set prompt = 'Какую награду YouTube вручает каналу, набравшему 100 тысяч подписчиков?'
where category = 'YouTube'
  and prompt = 'Какой значок получает канал после 100 тысяч подписчиков: серебряная кнопка или золотая? Назовите награду за 100 тысяч.';

update public.question_bank
set prompt = 'Как называют картинку, по которой кликают, чтобы открыть ролик?'
where category = 'YouTube'
  and prompt = 'Как называют картинку-превью, по которой кликают в ролик?';

update public.question_bank
set prompt = 'Какой значок включает оповещения о новых роликах?'
where category = 'YouTube'
  and prompt = 'Как называется колокольчик, который включает уведомления о новых роликах?';

update public.question_bank
set prompt = 'Как называется автоматический плейлист из роликов, которым пользователь поставил отметку «нравится»?'
where category = 'YouTube'
  and prompt = 'Как называется плейлист, куда YouTube сам собирает понравившиеся ролики пользователя?';

update public.question_bank
set prompt = 'Как коротко называют человека, который снимает и выкладывает ролики на видеохостинг?'
where category = 'YouTube'
  and prompt = 'Как коротко называют автора роликов на YouTube?';

update public.question_bank
set prompt = 'Как зовут техноблогера, который снимает обзоры гаджетов и чьё прозвище совпадает с названием его канала?'
where category = 'Блогеры'
  and prompt = 'Как зовут техноблогера, чей канал называется Wylsacom?';

update public.question_bank
set prompt = 'Как называется командный проект обзоров гаджетов, чьё имя по-русски звучит как «розетка»? Напишите латиницей.',
    variants = '{}'::text[]
where category = 'Блогеры'
  and prompt = 'Как называется канал обзоров гаджетов Rozetked? Напишите имя проекта.';

update public.question_bank
set prompt = 'Какой формат ролика снимают на выходных, когда живут в необычном месте целые сутки?'
where category = 'Блогеры'
  and prompt = 'Какой формат ролика снимают на выходных, когда живут в необычном месте целые сутки? Начните со слов «24 часа».';

update public.question_bank
set variants = array['Recap']::text[]
where category = 'Блогеры'
  and prompt = 'Как называется обзор, где блогер пересказывает фильм и вставляет свои шутки? Одно слово на английском.';

update public.question_bank
set prompt = 'Кто вёл интернет-шоу с приколами из сети, в названии которого плюс и число сто пятьсот?'
where category = 'Блогеры'
  and prompt = 'Кто вёл шоу «+100500» с приколами из интернета?';

update public.question_bank
set prompt = 'Как зовут блогера, с которого начинался российский YouTube для подростков?'
where category = 'Блогеры'
  and prompt = 'Как зовут блогера Ивангая, с которого начинался российский YouTube для подростков?';

update public.question_bank
set prompt = 'Кто ведёт на YouTube мистические расследования и квесты в заброшенных местах?'
where category = 'Блогеры'
  and prompt = 'Кто ведёт мистические расследования и квесты под именем Дмитрий Масленников?';

update public.question_bank
set prompt = 'Как зовут блогерку, которая вела видеодневник и чья фамилия созвучна английскому слову clap?'
where category = 'Блогеры'
  and prompt = 'Как зовут блогерку Катю Клэп?';

update public.question_bank
set prompt = 'Как называется экранизация романа Фрэнка Герберта о пустынной планете, которую Дени Вильнёв выпустил в 2021 году?'
where category = 'Кино'
  and prompt = 'Как называется первая часть «Дюны» Дени Вильнёва, вышедшая в 2021 году? Достаточно «Дюна».';

update public.question_bank
set prompt = 'Как называется общая киновселенная фильмов про Мстителей?'
where category = 'Кино'
  and prompt = 'Как называется киновселенная фильмов Marvel?';

update public.question_bank
set prompt = 'Какой фильм сделал Киану Ривза символом молчаливого киллера с собакой?'
where category = 'Кино'
  and prompt = 'Какой фильм про Джона Уика сделал Киану Ривза символом экшен-киллерa?';

update public.question_bank
set prompt = 'Как называется мокьюментари про сотрудников бумажной компании Дандер Миффлин?'
where category = 'Сериалы'
  and prompt = 'Как называется мокьюментари про офис бумажной компании Дандер Миффлин?';

update public.question_bank
set prompt = 'В каком мультсериале дед-учёный и его внук путешествуют по вселенным?'
where category = 'Сериалы'
  and prompt = 'В каком сериале Рик и Морти путешествуют по вселенным?';

update public.question_bank
set prompt = 'Как называется медицинская драма про язвительного диагноста с тростью?'
where category = 'Сериалы'
  and prompt = 'Как называется медицинская драма про доктора Хауса?';

update public.question_bank
set prompt = 'Какой сериал про дочь семейства Аддамс стал хитом Netflix?'
where category = 'Сериалы'
  and prompt = 'Какой сериал про семью Аддамс в виде подростковой Уэнсдей стал хитом Netflix?';

update public.question_bank
set prompt = 'Как зовут собаку породы сиба-ину, от которой пошёл мем с подписями вроде such wow?'
where category = 'Мемы'
  and prompt = 'Как зовут собаку породы сиба-ину, от которой пошёл мем Doge?';

update public.question_bank
set prompt = 'Какая крылатая фраза с мема про полный провал стала популярной в рунете? Напишите её целиком.'
where category = 'Мемы'
  and prompt = 'Какая фраза завершает провал в меме «это фиаско, братан»? Напишите всю фразу.';

update public.question_bank
set prompt = 'Как зовут вечно недовольного кота с мемов, у которого опущены уголки рта?'
where category = 'Мемы'
  and prompt = 'Как зовут вечно недовольного кота с мемов, которого звали Grumpy Cat?';

update public.question_bank
set prompt = 'Как называется мем-слово, когда кто-то резко исчез или сделал ловкий трюк?'
where category = 'Мемы'
  and prompt = 'Как называется мем-слово, когда кто-то резко исчез или сделал ловкий трюк: «вжух»?';

update public.question_bank
set prompt = 'Кто многократно получал «Золотой мяч» и играет за сборную Аргентины?'
where category = 'Спорт'
  and prompt = 'Кто выигрывал золотые мячи и играет за сборную Аргентины: Месси или Роналду? Назовите аргентинца.';

update public.question_bank
set prompt = 'Как называется единоборство в восьмиугольной клетке?'
where category = 'Спорт'
  and prompt = 'Как называется единоборство в восьмиугольной клетке, лига UFC?';

update public.question_bank
set prompt = 'Как называется предмет, который в хоккее забивают в ворота клюшками?'
where category = 'Спорт'
  and prompt = 'Как называется шайба в хоккее? Нет: предмет, который забивают в ворота клюшками.';

update public.question_bank
set prompt = 'В каком олимпийском виде спорта на льду исполняют четверные прыжки?'
where category = 'Спорт'
  and prompt = 'Какой вид спорта на Олимпиаде включает четверные прыжки: фигурное катание или биатлон? Назовите про прыжки.';

update public.question_bank
set prompt = 'Какой симметричный разъём заменил Lightning у новых iPhone?'
where category = 'Технологии'
  and prompt = 'Как называется разъём, который заменил Lightning у новых iPhone: USB-C или micro-USB? Назовите современный.';

update public.question_bank
set prompt = 'Какой сервис рисует картинки по текстовому запросу и известен командой /imagine?'
where category = 'Технологии'
  and prompt = 'Как называется нейросеть, которая генерирует картинки по тексту? Назовите любой массовый сервис: Midjourney или «Шедеврум».';

update public.question_bank
set prompt = 'Какая игра про охотника на чудовищ Геральта вышла студией CD Projekt?'
where category = 'Игры'
  and prompt = 'Какая игра про ведьмака Геральта вышла студией CD Projekt?';

update public.question_bank
set prompt = 'Как называют короткий текст под фото в соцсети?'
where category = 'Соцсети'
  and prompt = 'Как называют короткую подпись под фото в соцсети?';

update public.question_bank
set prompt = 'Как называют бесконечный поток постов, который листают пальцем?'
where category = 'Соцсети'
  and prompt = 'Как называют бесконечную ленту постов, которую листают пальцем?';

update public.question_bank
set prompt = 'Как называется способ отметить человека на фото через символ @?'
where category = 'Соцсети'
  and prompt = 'Как называется отметка друга на фото через @?';

update public.question_bank
set prompt = 'Как зовут косолапого друга Маши в российском мультфильме?'
where category = 'Мультфильмы'
  and prompt = 'Как зовут медведя, с которым дружит Маша?';
