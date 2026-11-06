-- Дополнительные написания правильных ответов (scripts/answer-variants/enrich.ts):
-- оригинал/русское название, транслит, фамилия, сокращение, старое название.
-- Только добавляет: уже имеющиеся варианты и эталон не меняются, повторный
-- запуск ничего не дублирует.
update public.question_bank as b
set variants = coalesce(b.variants, '{}'::text[]) || array(
  select x from unnest(v.add) as x
  where not (lower(x) = any (select lower(y) from unnest(coalesce(b.variants, '{}'::text[]) || array[b.answer]) as y))
)
from (values
  ('027f6726-feb2-4d13-8451-8d8205ec2855', array['Жак Берман Уэбстер II']::text[]), -- Трэвис Скотт
  ('03a0488d-dd72-438d-8f3e-9a390d44fab0', array['Национальная хоккейная лига']::text[]), -- НХЛ
  ('0421e844-7f75-4ad7-8873-cafea9f71ee4', array['Кардан']::text[]), -- Карданный вал
  ('067b7fad-8d18-4267-9658-e9f07223ae72', array['Crème brûlée']::text[]), -- Крем-брюле
  ('08a362e9-4739-4576-807f-56dd9489f5f9', array['Facilier']::text[]), -- Фасилье
  ('0a1b99fd-9ef3-46f8-9fec-9068b475344e', array['Виар']::text[]), -- Виртуальная реальность
  ('0b7b8a6d-3652-46c6-9a2a-4ce7a6886f1c', array['Home Alone']::text[]), -- Один дома
  ('0d085fde-0bf9-4af0-a0d3-753c1f63bda0', array['DC Universe']::text[]), -- Вселенная DC
  ('133c0c47-2a9b-472e-b123-126c987425b4', array['Тум Райдер']::text[]), -- Tomb Raider
  ('16f63960-983b-4c5b-b62a-2f40bc27641d', array['Westworld']::text[]), -- Мир Дикого Запада
  ('195fa36f-8ce3-47c4-87ad-d1a7a49a1610', array['Playlists']::text[]), -- Плейлисты
  ('19ed7e93-940e-4c86-885c-48cf2336cd6e', array['The Walking Dead']::text[]), -- Ходячие мертвецы
  ('1a372878-11b3-41a0-8ceb-2ae1b835bc5b', array['Easy']::text[]), -- Изи
  ('1b060bb0-4f70-4f75-bf06-1a9871a3c974', array['Отпусти и забудь']::text[]), -- Let It Go
  ('1dd28650-bbb7-4c58-a60d-84387cb11922', array['Рэймонд Чарльз Робинсон']::text[]), -- Рэй Чарльз
  ('23ecc30e-7a0b-4bf6-b356-840238bf6b77', array['Московский международный деловой центр']::text[]), -- Москва-Сити
  ('25c730a5-a9e9-487e-abdd-88cb581e3199', array['Джеймс Дуглас Моррисон']::text[]), -- Джим Моррисон
  ('26b31f86-775a-4ce4-bdd4-451884767933', array['Brandenburger Tor']::text[]), -- Бранденбургские ворота
  ('26c91737-7faa-4856-b2b9-94db2e843be4', array['The Lion King']::text[]), -- Король Лев
  ('2720158d-7552-4d37-85e0-161d27a0fecd', array['The Creation of Adam']::text[]), -- Сотворение Адама
  ('27ed351a-4de5-45f0-8a37-7bbffc89113f', array['Mixed Martial Arts']::text[]), -- Смешанные единоборства
  ('2b838e8d-9878-42ab-88e1-d82e6e06b25c', array['Пожаловаться']::text[]), -- Жалоба
  ('2c61f4f8-bb86-4b49-82dc-d2e88f5f8325', array['Массовая многопользовательская ролевая онлайн-игра', 'Massively Multiplayer Online Role-Playing Game']::text[]), -- MMORPG
  ('2e5458eb-5dab-467d-9098-23e416b7b545', array['Ангел']::text[]), -- Анхель
  ('2ee44685-5ec4-46a3-be3d-06e057e4bc36', array['Pirates of the Caribbean']::text[]), -- Пираты Карибского моря
  ('2f867e11-d18b-466a-a6c1-a29277b87dfe', array['Шведская Хаус Мафия']::text[]), -- Swedish House Mafia
  ('3025b0c7-3fde-4315-9c95-dee02b70f1c0', array['Абель Тесфайе']::text[]), -- The Weeknd
  ('314ce7cc-ca03-4f32-a469-9ee3de8228b3', array['Иоганн С. Бах']::text[]), -- Иоганн Себастьян Бах
  ('35c6219a-8996-4731-b264-ed0ffad4fbcf', array['Joe Hisaishi']::text[]), -- Дзё Хисаиси
  ('36b8591a-9d22-4469-adba-cf054d6115f6', array['Random']::text[]), -- Рандомный
  ('38e8ab39-1a4b-457c-a772-bbd5419970f9', array['The Incredibles']::text[]), -- Суперсемейка
  ('398ebcda-9e13-4e2d-9cfa-4d59e5e6fbba', array['Wylsacom']::text[]), -- Валентин
  ('445ad670-a3e0-44db-bdeb-2fbb4d3e351d', array['BadComedian']::text[]), -- Евгений Баженов
  ('46d5db1f-194c-4f0c-807c-a190532d23b9', array['НФС']::text[]), -- NFC
  ('4a877c80-4c9f-4120-bddf-51411f992c9b', array['Бантан Сонёндан', 'Bangtan Sonyeondan']::text[]), -- BTS
  ('4cc6f735-cb36-440c-8ded-738c4052547b', array['Дасковская']::text[]), -- Татьяна
  ('4f0c10ee-6c7f-4b2f-bc34-fa3ed8426a46', array['Ice Age']::text[]), -- Ледниковый период
  ('4f5c8d08-f9a3-417f-b65d-ba338b310e14', array['Уолл', 'Стена']::text[]), -- The Wall
  ('50f6cb8f-68df-4958-be97-c5ef19600e0c', array['Tower Bridge']::text[]), -- Тауэрский мост
  ('5367b829-c33a-4bab-966e-6f6b099cabd9', array['George Michael']::text[]), -- Джордж Майкл
  ('557d3806-7df5-47ee-9f01-9139b0b5b25c', array['Multiplayer Online Battle Arena']::text[]), -- MOBA
  ('567adc70-0328-4e4f-a65d-6c33110e73c5', array['Miguel']::text[]), -- Мигель
  ('56835a94-fcaa-461f-882e-1754a75bb8e3', array['Harry Potter and the Philosopher''s Stone']::text[]), -- Гарри Поттер и философский камень
  ('56f3d586-a24b-4bcd-bc7f-0ae0b7cfe855', array['АБС']::text[]), -- Антиблокировочная система
  ('6575888f-528b-487d-b5f6-3397ec79a5d4', array['The Thinker']::text[]), -- Мыслитель
  ('6580fbec-e744-4485-8a77-5a9f063f70a8', array['Jurassic Park']::text[]), -- Парк Юрского периода
  ('66462a31-a103-4500-ac45-248da4dbd01a', array['Блэк Стар']::text[]), -- Black Star
  ('66ca1365-1338-40f8-9083-27bebebe3e67', array['Трэмэр Диллард']::text[]), -- Flo Rida
  ('6738c7ef-cb15-4a8b-ab40-7e3ab87befa3', array['Middle-earth']::text[]), -- Средиземье
  ('69d3231e-0226-49ef-8c1b-30ffd8193ff7', array['Мирон Фёдоров']::text[]), -- Оксимирон
  ('69f0be83-884b-4ef3-aa33-292908a988fc', array['Girl with a Pearl Earring']::text[]), -- Девушка с жемчужной серёжкой
  ('6ba61cca-35cd-4c9f-a440-9c8033b3ed17', array['Brave New World']::text[]), -- О дивный новый мир
  ('6e9cec16-2acd-4971-aa01-4cd1160bb4e9', array['Алексей Долматов']::text[]), -- Гуф
  ('6eb3c757-3759-4781-b775-89be62b001b5', array['Приватный профиль']::text[]), -- Закрытый аккаунт
  ('7104baa4-8f2b-4fc1-b313-516ec9d73f65', array['Sunflowers']::text[]), -- Подсолнухи
  ('74333839-d549-4403-b737-7fae7018ce2d', array['Peter Pan']::text[]), -- Питер Пэн
  ('749e1163-3130-4f8f-9203-bdc448afb8ca', array['Cillian Murphy']::text[]), -- Киллиан Мёрфи
  ('7609076b-1031-4b0a-9f60-4099899d02af', array['Ярослав Дронов']::text[]), -- Шаман
  ('76934825-c6b0-4231-ac7e-bec068db679c', array['E.T. the Extra-Terrestrial']::text[]), -- Инопланетянин
  ('76a303f9-e47c-40a4-94dd-eec4c35c1058', array['Уай Джи Энтертейнмент', 'Уай Джи']::text[]), -- YG Entertainment
  ('79dd2cf0-17ce-466c-8954-904e1d26d3b1', array['Tangled']::text[]), -- Рапунцель
  ('7af280ef-a28a-41dd-9801-ef702317bdd0', array['Pulp Fiction']::text[]), -- Криминальное чтиво
  ('7dc8b212-8565-4a91-ad8a-efa733379282', array['Scar']::text[]), -- Шрам
  ('7dcba582-ac9b-49b0-be3a-3b636c769eaf', array['Финал Фэнтези VII Реберс']::text[]), -- Final Fantasy VII Rebirth
  ('8012d694-2c50-4708-9e49-bc8029b8d590', array['Harry Potter']::text[]), -- Гарри Поттер
  ('84732607-3a9d-48a0-92cc-a596cae99b6d', array['Алла Перфилова']::text[]), -- Валерия
  ('84e3a88f-f3db-484f-a862-36c1fb1c1b7b', array['Miles Davis']::text[]), -- Майлз Дэвис
  ('84e92abf-5c3e-4e07-9c07-df625afb1ee3', array['Hype']::text[]), -- Хайповый
  ('866ea978-64da-4609-a524-e6d9a2dd38e4', array['Tom Yum']::text[]), -- Том ям
  ('8a38727d-191d-4e68-b5fb-9efeee40e32f', array['Parasite', 'Gisaengchung']::text[]), -- Паразиты
  ('8abe4f1c-84dc-42a6-b73f-86caf55c92ba', array['Екатерина Трофимова']::text[]), -- Катя Клэп
  ('8c437437-1d1a-4142-8f46-45e887928676', array['Джон Кристофер Депп Второй']::text[]), -- Джонни Депп
  ('8c5cbe19-4744-4899-9987-78c1f84eb190', array['John Williams']::text[]), -- Джон Уильямс
  ('9050390e-94af-4790-b335-af1249e7fe19', array['Wes Montgomery']::text[]), -- Уэс Монтгомери
  ('94f8f42a-3d84-4d13-9c89-8aa020b94688', array['Puss in Boots']::text[]), -- Кот в сапогах
  ('95764978-c92b-45c9-a70b-0f67e95110b2', array['Эпл Вижн Про']::text[]), -- Apple Vision Pro
  ('95cfa1ab-14fd-40a5-82ac-4f48b2dbdfa2', array['Nintendo']::text[]), -- Баста
  ('96e3aaa6-904b-4d8a-b409-7ae792e6cee3', array['Neuschwanstein']::text[]), -- Нойшванштайн
  ('97d0d4cf-80bc-4cc8-8d9d-b849dee8a5c8', array['Iron Man']::text[]), -- Железный человек
  ('9c2a2a7d-ebe6-4771-b28e-d09cb3911ed3', array['Little Red Riding Hood']::text[]), -- Красная Шапочка
  ('9d6f0c93-1d0c-4435-9d52-6d1c5af3ea2f', array['Ice tea']::text[]), -- Айс ти
  ('9d9e6d30-7bea-49a4-b276-3ed9845d4450', array['Лузе Юрселф']::text[]), -- Эминем
  ('a29c7988-6dd6-45ee-846a-d304c3212a0e', array['Марина Абросимова']::text[]), -- МакSим
  ('a5b7ff2b-df22-4478-b521-44fe51bb46b3', array['Бедра не лгут', 'Бедра не врут']::text[]), -- Hips Don't Lie
  ('a8ea08ef-51e8-4609-82e7-0b43af294cd2', array['Джон Кристофер Депп Второй', 'Johnny Depp']::text[]), -- Джонни Депп
  ('ab8a5fcc-85ce-4d2a-8f39-8e4a1dca1b03', array['The Witcher']::text[]), -- Ведьмак
  ('ac169208-d787-4993-9ba9-dc0ef31cba8f', array['Юнис Кэтлин Уэймон']::text[]), -- Нина Симон
  ('b0608680-f073-40f6-a73f-dbbdcb73dddd', array['Дарья Зотеева']::text[]), -- Инстасамка
  ('b4ad1a28-cf27-4167-b4c8-4982aea08ac1', array['Golden Gate Bridge']::text[]), -- Мост Золотые Ворота
  ('b6a0df5c-8608-4be5-9ac1-290415517955', array['Денис Устименко-Вайнштейн']::text[]), -- Джиган
  ('b6dba718-96e0-4a18-9aa5-527c51ce942e', array['Roujiamo']::text[]), -- Роуцзямо
  ('b80b6195-9dca-44b6-b479-97f95ae6a865', array['Eiffel Tower']::text[]), -- Эйфелева башня
  ('bb295ef6-73ec-40c4-ac66-54769be49d9e', array['Hercule Poirot']::text[]), -- Эркюль Пуаро
  ('bbfe5ea4-0206-4b60-a32c-ac779f9bb0d3', array['Castle Rock']::text[]), -- Касл-Рок
  ('bc1e639a-aafd-4a69-970f-8f770427d671', array['Каролина Куек']::text[]), -- Ани Лорак
  ('bd4107f5-9a3d-41c1-a5b9-ab704e46e620', array['Alice in Wonderland']::text[]), -- Алиса в Стране чудес
  ('bf1a12d7-ca7f-404b-a2a1-ce6b432a1932', array['Стивленд Хардэуэй Моррис']::text[]), -- Стиви Уандер
  ('c04872ef-23f1-451c-96c6-cb0f16baef5e', array['Михаил Медведев']::text[]), -- Мот
  ('c0621d89-56ac-4783-ba5c-f25014fccb9e', array['The Last Supper']::text[]), -- Тайная вечеря
  ('c0b1517f-2957-4e06-aca6-2b4e95c2180d', array['Джей Уай Пи Энтертейнмент', 'Джей Уай Пи']::text[]), -- JYP Entertainment
  ('c252b589-e219-466d-93b7-800a3aacbf41', array['Плейстейшн 2']::text[]), -- PlayStation 2
  ('c30a8c5d-01f1-452c-902c-a382663c5689', array['ЮСБ-С']::text[]), -- USB-C
  ('c7cc2dac-3e08-4632-9e73-92441dc00263', array['The Birth of Venus']::text[]), -- Рождение Венеры
  ('c9bbd011-8382-4dfb-8464-cb8655e2f570', array['Кэтрин Хадсон']::text[]), -- Кэти Перри
  ('c9c7ded6-09fc-40fb-b5c9-e3676a14e860', array['Екатерина Лель']::text[]), -- Катя Лель
  ('ca02824d-7fa9-49ff-bccc-638e4f2c7545', array['Бэд Бэланс']::text[]), -- Bad Balance
  ('cca6d69d-8a24-47fd-84f5-2d1f13598fc8', array['Frozen']::text[]), -- Холодное сердце
  ('d0c42b46-0b00-4e10-9655-45b483376b0c', array['Succession']::text[]), -- Наследники
  ('d2a589d3-8159-4c7a-a0fa-5acfcac88284', array['ЧМ']::text[]), -- Чемпионат мира
  ('d330e175-f156-4b3e-b399-056c3b7f60ec', array['Нат Кинг Коул', 'Nat King Cole']::text[]), -- Нэт Кинг Коул
  ('d367088b-f7aa-4876-8650-7ba3a4edd89b', array['Twitter']::text[]), -- X
  ('d630a8f3-ff57-43e2-9b75-34c89fb03997', array['House']::text[]), -- Хаус
  ('d676df52-7167-4a61-b226-5f761fe5fdaf', array['Harry Potter']::text[]), -- Гарри Поттер
  ('d7280454-c018-404c-8a20-8696b37dd23a', array['Антиблокировочная система']::text[]), -- АБС
  ('d7b3278d-b41d-4837-ba25-1d09f3f2d4b1', array['Alice']::text[]), -- Алиса
  ('d91ce899-23ca-47af-b4d2-050d5e6d72a2', array['Шаверма']::text[]), -- Шаурма
  ('da23e980-3f91-459d-bc49-119e600c3d8b', array['Иван Рудской']::text[]), -- Ивангай
  ('dc86a3bc-9154-438f-b31b-f6af23e376af', array['Pisa Tower']::text[]), -- Пизанская башня
  ('dcefd49e-44ee-4893-bb1e-61d36c483387', array['Sam Cooke']::text[]), -- Сэм Кук
  ('dd29814d-00b4-4e1f-a610-2067edcb5b56', array['Боку но Хиро Академия']::text[]), -- Моя геройская академия
  ('dd90ec87-d0e4-44be-87a2-7f3e178fb75c', array['Finding Nemo']::text[]), -- В поисках Немо
  ('de848fd4-2a72-4e8f-8466-6bb8b34b4c3c', array['George Martin']::text[]), -- Джордж Мартин
  ('e0123af8-e3bb-4009-9947-f7c26e9aea59', array['Эмтиви']::text[]), -- MTV
  ('e0eccac2-b9a8-428e-bbfb-2da531d7921d', array['Рандомный']::text[]), -- Рандом
  ('e166d6ce-9460-4a25-aaeb-935365b559d0', array['Advanced RISC Machines']::text[]), -- ARM
  ('e1aa91c7-e0a5-4824-9319-c15dbdecd891', array['Stranger Things']::text[]), -- Очень странные дела
  ('e2d6b3e6-cfdb-4971-8a43-28d8b5228984', array['Национальная баскетбольная ассоциация']::text[]), -- НБА
  ('e5a27ea1-8176-4d11-8738-7590a846dc8d', array['Эдвард Ширан']::text[]), -- Эд Ширан
  ('e6955861-4bcf-4c26-895d-ca2d417f1b27', array['Snowball']::text[]), -- Снежок
  ('e7bfb3ec-69ce-4778-b2bb-c97a24e0ecdf', array['Эдсон Арантис ду Насименту', 'Pele']::text[]), -- Пеле
  ('e81919b1-1234-4e8d-8615-9bf2c543afae', array['Ричард Мелвилл Холл', 'Richard Melville Hall']::text[]), -- Moby
  ('e94ec05f-f364-4f28-adb0-7c88da944d19', array['Прокрастинация']::text[]), -- Прокрастинатор
  ('e95d0a8f-3b54-430d-9193-312813d3a89d', array['Toy Story']::text[]), -- История игрушек
  ('ea4e0ba3-88f0-4686-8494-00399c8ee0a8', array['The Scream']::text[]), -- Крик
  ('ea78ff3f-f250-4911-954b-7c8a2620964e', array['Каннам стайл']::text[]), -- PSY
  ('eaf48b3a-16af-4a12-99cf-3f04bdc0d9ee', array['Cinderella']::text[]), -- Золушка
  ('ebe71066-6d6b-453c-b734-ea74f664fafe', array['The Princess and the Frog']::text[]), -- Принцесса и лягушка
  ('ecedaa5c-ad52-4cd0-925d-bff5e53e98fa', array['Куин']::text[]), -- Queen
  ('ed6ac74f-96ca-49c5-94b5-b4741940b332', array['Hans Zimmer']::text[]), -- Ханс Циммер
  ('edf3ec45-27b1-47c0-9d5b-8b81924da833', array['Kiki''s Delivery Service']::text[]), -- Ведьмина служба доставки
  ('f0e5ee25-3d96-445d-a32e-c859b7315f3a', array['Night Watch']::text[]), -- Ночной дозор
  ('f38e2d2b-418c-45ac-a67c-82afd3255618', array['Анна Шурочкина']::text[]), -- Нюша
  ('f69620ca-d318-4f44-8b3a-e8dce5be7d84', array['The Starry Night']::text[]) -- Звёздная ночь
) as v(id, add)
where b.id = v.id::uuid;
