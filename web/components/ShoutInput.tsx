import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import EmojiPicker, { GifPickerSelection } from './EmojiPicker';
import MentionInput, { MentionInputHandle, effectiveLength } from './MentionInput';
import PollEditor, { PollPayload, PollEditorHandle } from './PollEditor';
import { Shout } from '../types';
import { useMediaAttachments, SUBMIT_FAILED_MESSAGE } from '../hooks/useMediaAttachments';
import PendingMediaStrip from './PendingMediaStrip';
import { useGta6 } from '../hooks/useGta6';

interface ShoutInputProps {
  onShoutCreated: (shout: Shout) => void;
}

const SHOUT_MAX_LENGTH = 1000;
const NEWLINE_CHAR_COST = 40;

const GTA6_RANDOM_SHOUTS = [
  'Купил PS5 ради ГТА 6. Нищие с ПК, держитесь там.',
  'Пекари будут смотреть прохождение ГТА 6 на ютубе в 4К и называть это геймингом',
  'Я не собираюсь платить 100 долларов за ГТА 6. Я заплачу 120 за Deluxe',
  'Ради ГТА 6 купил телевизор за две тысячи евро. Денег на саму игру нет. Пидоры подарите',
  'Только конченый будет проходить ГТА 6 с включёнными субтитрами',
  'Я гей',
  'Если в ГТА 6 опять будут миссии с йогой, я разобью геймпад нахуй',
  'Я не хейтер ГТА 6, просто заебали эти фанатики с предзаказами',
  'Не понимаю хайпа вокруг ГТА 6. Обычная игра про американских долбоёбов',
  'Сонибои называют 30 фпс кинематографичностью. Клоуны ебаные',
  'Если ГТА 6 окажется говном, я всё равно никому не признаюсь.',
  'Я не буду читать обзоры ГТА 6. Журналисты и так нихуя не понимают в играх',
  'Не хочу реализма в ГТА 6. Хочу украсть вертолёт и приземлиться на проститутку',
  'Если ГТА 6 получит меньше 10/10, значит обзорщик просто конченый',
  'Жаль кот Марио не дожил до релиза',
  'Так-то похуй, но жду, но на пк',
  'Порно с карликами онлайн скачать',
  'Sex gifs',
  'Пидоры подарите гта',
  'Пидоры подарите плойку',
  'Пидоры подарите гта и плойку',
  'Пекари будут смотреть на ГТА 6 через окно Twitch, как нищие на витрину ресторана',
  'Как же хочеца сладкие булочки Люсии',
  'Как же хочеца сладкие булочки Джейсона',
  'Мне одному похуй на гта6?))))',
  'Пекари в 2027 будут рассказывать, что ждали ради модов. Ага, конечно',
  'ПК-бояре, как там ваш первый квартал 2027?',
  'Буду играть в ГТА 6 на ПК. В 2027. Через пиратку. В 2028',
  'Сонибои, расскажите ещё раз про 30 фпс и погружение',
  'Хуящик опять в пролёте. Как и всегда',
  'Купил Xbox ради ГТА 6. Понял ошибку только сейчас',
  'На PS5 Pro 30 фпс, на обычной PS5 — 30 фпс и стыд',
  'Продал почку на PS5 Pro, вторую оставлю на ПК-версию',
  'Пекарь — это человек, который ждёт ГТА на год дольше и гордится этим',
  'Консольщики радуются 30 фпс, как будто им зарплату подняли',
  'ПК-версия выйдет, когда все уже пройдут и забудут',
  'Пекари, вы же всё равно на ютубе посмотрите, хули ноете',
  'Моя RTX 4060 смотрит на ГТА 6 как собака на телевизор',
  'Плойка гудит как самолёт, значит ГТА 6 уже скачивается',
  '210 гигов. Удалил всё, включая семейные фото',
  'Удалил Call of Duty, чтобы влезла ГТА 6. Лучшее решение года',
  'На свиче ГТА 6 выйдет в виде текстового квеста',
  'Свичебои, вам Марио хватит, не плачьте',
  'Купил телевизор 85 дюймов. Комната 9 квадратов. Сижу в коридоре',
  'Взял плойку в кредит под 40%. Это инвестиция в себя',
  'Мамка спросила, зачем мне вторая плойка. Сказал — для резерва',
  'Геймпад заряжен, холодильник забит, совесть отключена',
  'Пекари в ноябре: «игра для быдла». Пекари в 2027: «ГДЕ КЛЮЧ ДЕШЕВЛЕ»',
  'Если ГТА 6 на ПК выйдет в Epic Store, я выйду на улицу. Ненадолго',
  'Пекари будут скринить чужие стримы и ставить себе на обои',
  'Знаю пекаря, который купил PS5 ради ГТА и теперь молчит в чатах',
  'Консоль за 800 баксов, чтобы играть в 30 фпс. Гении маркетинга',
  'Rockstar не выпускает на ПК сразу, потому что знает вас, пиратов',
  'Мой ноутбук не тянет даже трейлер ГТА 6',
  'Включил трейлер ГТА 6 на рабочем ноуте, IT-отдел уже едет',
  'Ждать ГТА 6 на ПК — это как ждать автобус, который уехал в 2027',
  'Сонибои платят за онлайн, чтобы с ними там никто не играл',
  'Хуящик-боярам соболезную. Опять ждать Game Pass',
  'Через год пекари скажут, что ГТА 6 — переоценённое говно, но с модами норм',
  'Когда выйдет на ПК, на неё уже будет 400 модов с голыми бабками',
  'Взял отпуск на две недели. Жене сказал, что командировка',
  'Взял больничный заранее. Температура будет 19 ноября',
  'Девушка ушла, потому что я выбрал ГТА 6. Остался в плюсе',
  '10 млн предзаказов. Перепись взрослых мужиков без личной жизни',
  'Предзаказал Deluxe, Ultimate и Collector\'s. На всякий случай',
  'Я не ждал ГТА 6. Я просто случайно предзаказал её три года назад',
  'Ждал ГТА 6 дольше, чем длились мои отношения',
  'Когда анонсили ГТА 6, у меня были волосы. Теперь у меня ГТА 6',
  'Начинал ждать ГТА 6 школьником, дождался с ипотекой',
  'Ребёнок родился и пошёл в школу, пока я ждал ГТА 6',
  'Рокстар делали игру 12 лет, а я за это время даже диплом не дописал',
  'В 21:30 по Мск я умер для общества',
  'Не звоните мне до декабря. И в декабре тоже',
  'Друзья, если не выйду из дома до Нового года — я в Вайс-Сити',
  'Отключил уведомления, телефон, интернет-банк. Оставил только ГТА',
  'Купил энергетиков на 15 тысяч. Готов к релизу',
  'Доширак куплен коробками. Голодный месяц начинается',
  'Уволился, чтобы спокойно поиграть в ГТА 6. Потом найду работу. Наверное',
  'Начальник тоже взял отпуск на 19-е. Значит, всё правильно делаю',
  'Весь офис взял отпуск на 19 ноября. Бухгалтерия в шоке',
  'Сегодня последняя ночь, когда я нормально сплю',
  'Ну что, вопли, увидимся через месяц. Или никогда',
  'До релиза меньше суток, а я уже устал её ждать',
  'Если ГТА 6 перенесут ещё раз, я перенесу свою жизнь на 2028',
  'Пятый раз пересматриваю трейлер. Нашёл новую жопу на 1:12',
  'Разобрал трейлер покадрово. Теперь знаю номер каждой машины',
  'Купил ГТА 6. Признался, что быдло. Мне норм',
  'Перепись быдла объявляется открытой. Я первый',
  'Ради ГТА 6 продал велосипед. Теперь катаюсь только в игре',
  'Жена сказала: «Или я, или ГТА». Скучаю по ней иногда',
  'Мне 35, у меня двое детей, и я взял отпуск ради ГТА. Не осуждайте',
  'Отложил свадьбу на после ГТА 6. Невеста поймёт. Не поняла',
  'Поставил будильник на 21:29. На 21:30 как-то рискованно',
  'Буду в ГТА 6 до первой зарплаты, потом продам плойку',
  'Мама, я в отпуске. Нет, не на море. Да, опять игры',
  'Если ГТА 6 получит 9/10, значит журналист продался Сони',
  'Обзоры читают только те, у кого нет денег на игру',
  'Метакритик: 97. Мой отзыв: всё равно говно, но я играю',
  'Журналисты прошли ГТА 6 за три дня. На лёгком. С гайдом',
  'Ни одного обзора от Xbox-журналистов. Rockstar знает, кому доверять',
  'Не поверю в ГТА 6, пока сам не увижу машину в небе',
  'Обычная игра про американских долбоёбов. Беру Deluxe',
  'ГТА 6 официально не нужна. Предзаказал на всякий',
  'Хайп как у Киберпанка. Надеюсь, хоть машины в текстурах не будут',
  'Если в ГТА 6 будет баг с бессмертными голубями, я её полюблю ещё сильнее',
  'Мне похуй на ГТА 6. Пишу это из очереди за плойкой',
  'Ненавижу хайп вокруг ГТА 6. Поэтому пишу про неё десятый вопль за день',
  'Я не фанат, я просто 40 раз посмотрел трейлер',
  'ГТА 6 — переоценённое говно. Сейчас доиграю и подтвержу',
  'Первые 20 часов скучно, но потом можно украсть велосипед',
  'Юбисофт смотрит на ГТА 6 и тихо выключает свет в офисе',
  'Ubisoft срочно анонсирует Assassin\'s Creed в Майами',
  'В ГТА 6 детализация такая, что видно поры на жопе у Люсии',
  'Говорят, в ГТА 6 можно зайти в каждое здание. Как в ипотеку',
  'Пять звёзд розыска за украденный сникерс — я в деле',
  'Сюжет ГТА 6: Джейсон предаст Люсию, Люсия предаст Джейсона, игрок предаст семью',
  'Спойлер: в конце все умерли, кроме моего кошелька. Он умер в начале',
  'Слил финал ГТА 6: Джейсон всё это время был Нико',
  'Самый реалистичный момент в ГТА 6 — пробки',
  'Ограбить банк в ГТА 6 проще, чем получить кредит в реальном',
  'В ГТА 6 копы стреляют первыми. Реализм!',
  'В ГТА 6 бензин дешевле, чем в жизни. Фантастика',
  'Люсия — новая вайфу всех консольщиков',
  'Джейсон выглядит как тренер по кроссфиту, который должен тебе денег',
  'Джейсон из ГТА 6 просто быдло спортик. Я тоже',
  'Люсия дала бы пизды половине воплестана',
  'Хочу в ГТА 6 мод, где Люсию заменят на кота',
  'Первым делом в ГТА 6 перекрашу машину в розовый',
  'Купил ГТА 6 только ради шорт Люсии. Не стыдно',
  'Джейсон с бородой — это я через месяц после релиза',
  'Люсия и Джейсон — Бонни и Клайд для бедных',
  'Флоридский мужик в ГТА 6 реалистичнее, чем в новостях',
  'Флорида — единственный штат, который в ГТА не нужно преувеличивать',
  'Вайс-Сити вернулся, а я всё ещё живу в Саратове',
  'Аллигатор в бассейне — лучший NPC года',
  'Флоридский дед с пистолетом — мой будущий персонаж в ГТА Онлайн',
  'Квартира в Вайс-Сити стоит дешевле, чем однушка в Москве',
  'Майами в ГТА 6 — мой последний шанс увидеть море',
  'ГТА 6 стоит 80 долларов. Шарк-карта — 80 долларов. Совпадение?',
  'Rockstar зарабатывает 7 млн в неделю на шарк-картах. На мне — ноль. Горжусь',
  'ГТА Онлайн 2 будет продавать воздух за 20 долларов. Куплю',
  'В ГТА 6 Онлайн будет подписка на подписку',
  'Ждите в ГТА 6 Онлайн ограбление ограблений за 1999 рублей',
  'Купил шарк-карту, чтобы купить квартиру в игре. В реальности квартиры нет',
  'В ГТА Онлайн меня снова убьёт десятилетний ребёнок на Оппрессоре',
  'Школьники на летающих мотоциклах вернутся в 2027',
  'В ГТА 6 Онлайн будет батл-пасс. Не сомневайтесь',
  'Take-Two ждёт 8 млрд прибыли. 80 долларов из них мои',
  'Мой вклад в 8 миллиардов Take-Two — сломанный геймпад',
  'Цена ГТА 6 — 80 баксов. Цена моего достоинства — меньше',
  'Дорого? Не покупай. А я куплю, ибо быдло',
  '80 долларов за игру — это нормально, говорит человек, который уже купил',
  'Ради ГТА 6 перестал донатить стримершам. Они в трауре',
  'Деньги на ГТА 6 есть, на коммуналку нет. Приоритеты',
  'Банк одобрил кредит на ГТА 6. Теперь можно и квартиру',
  'Купил ГТА на всю зарплату. Буду питаться NPC',
  'Пидоры подарите Deluxe',
  'Пидоры подарите телевизор',
  'Пидоры подарите отпуск',
  'Ну кто-нибудь подарите гта, я ж свой',
  'Подарите гта, я на ПК, но всё равно подарите',
  'Скидываемся на ГТА для воплестана, я первый в очереди на получение',
  'Подарите гта — отыграю за всех',
  'Кто подарит ГТА 6, тому лайк. Один, не наглейте',
  'Я гетеро',
  'Это не я написал, это кубик',
  'Кубик выбрал этот вопль за меня, я не при делах',
  'Нажал на кубик. Теперь стыдно',
  'Мне одному не похуй на гта6?))))',
  'Мой кот уже прошёл ГТА 6, пока я спал',
  'Кот Марио, ты бы зашёл в ГТА 6',
  'Скачать ГТА 6 бесплатно без смс и регистрации',
  'ГТА 6 торрент рабочий 100% без вирусов',
  'Как пройти первую миссию в ГТА 6 помогите срочно',
  'Будет ли ГТА 6 на Денди',
  'ГТА 6 на калькуляторе запустил кто-нибудь?',
  'Где скачать ГТА 6 для андроид 5.1',
  'Есть ли в ГТА 6 русский язык? Если нет — пойду учить английский. Нет',
  'Мама купила мне ГТА 6, а я её подвёл',
  'Бабушка спросила, что такое ГТА. Сказал — симулятор Флориды',
  'Батя сказал, что в его время ГТА была на кассетах',
  'Отец впервые за 10 лет попросил геймпад. Это была ГТА 6',
  'Сосед играет в ГТА 6 за стенкой. Слышу каждую погоню',
  'Ваш рейтинг ожидания ГТА 6 от 1 до «взял отпуск»',
  'Вопли только про гта — это мощно',
  'Воплестан на неделю превращается в фан-клуб Рокстар',
  'Зайду в вопли через месяц, расскажите потом, что тут было',
  'Вопли после релиза ГТА: тишина и ни одного нового вопля',
  'Игра десятилетия вышла, а воплестан всё равно срётся про консоли',
  'Слушаю радио из трейлера ГТА 6 по кругу третий день',
  'Саундтрек ГТА 6 лучше, чем мой плейлист за 10 лет',
  'В ГТА 6 опять будет Raining Blood. И мои слёзы',
  'Если кто-то спросит — меня здесь не было',
  'Хочу удалить аккаунт, но сначала ГТА',
  'Скилл ишью',
  'Гит гуд, консольщик',
  'Пекари опять доказывают, что 144 фпс важнее друзей',
  'Купил RTX 5090, играю в косынку',
  'Лучшая графика — это мутная плойка через телек на кухне',
  'Сначала сделайте нормальную оптимизацию, потом просите 80 баксов',
  'Опять Unreal Engine 5, опять статтеры, опять я счастлив',
  'Ремастер ремастера трилогии в 2032',
  'Rockstar выпустит ГТА 7 в 2045, если доживём',
  'ГТА 7 анонсируют, когда у меня будут внуки. Они и поиграют',
  'RDR 3 мы уже не застанем',
  'Half-Life 3 выйдет раньше ПК-версии ГТА 6',
  'TES 6 выйдет на PS7, и то по подписке',
  'Киберпанк чинили 3 года. ГТА мододелы сломают за 3 дня',
  'Ванильная ГТА 6 — это демка перед модами',
  'Майнкрафт всё равно популярнее, смиритесь',
  'Тарков всё ещё лучше. В плане того, как он меня ненавидит',
  'В доту играют те, кто не может себе позволить ГТА',
  'Лучше бы зарелизили TES6. Хотя кого я обманываю',
  'Стал мужиком, когда купил вторую плойку. Первая для пыли',
  'Помню, в Сан-Андреас было веселее. Помню, что был моложе',
  'Вайс-Сити на пиратском диске от Фаргуса — вот это была игра',
  'Ведьмак 4 хайпанёт сильнее? Нет. Ну и всё',
  'Хардкорные геймеры проходят ГТА 6 без мини-карты. Я без работы',
  'Сначала пройду сюжет, потом ещё раз сюжет, потом сдохну',
  'ГТА 6 — единственная игра, ради которой я протёр экран телевизора',
  'Кто первый найдёт пасхалку с Нико — тот и папа',
  'Rockstar, верните Томми Версетти, мы всё простим',
  'Если в ГТА 6 нет Bigfoot, я требую возврат',
  'Ждём ГТА 6 VR, чтобы блевать в 4К',
  'Новая игра от Rockstar: 100 гб кат-сцен и 10 гб геймплея',
  'Пока вы спорите про фпс, я уже угнал самолёт',
  'Пока вы тут вопите, Люсия уже ограбила банк',
];
// MEDIA_MAX_MB now lives in useMediaAttachments — single source for both composers.

const YT_PATTERNS = [
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?[^\s]*v=([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
];

function detectYouTubeId(text: string): string | null {
  for (const p of YT_PATTERNS) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return null;
}

const ShoutInput: React.FC<ShoutInputProps> = ({ onShoutCreated }) => {
  const { user, openModal } = useAuth();
  const gta6 = useGta6();
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Media state — shared with the reply composer in ShoutCard via this hook so
  // both behave identically (FR-031, research D9).
  const media = useMediaAttachments({ mediaAllowed: user?.mediaAllowed, logPrefix: 'ShoutInput' });
  const { items: mediaItems, isUploading } = media;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mentionInputRef = useRef<MentionInputHandle>(null);

  // Drag-and-drop state
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  // YouTube auto-detection
  const [detectedYtId, setDetectedYtId] = useState<string | null>(null);

  // Content flag — mutually exclusive: only one tag per shout
  type ContentTag = 'spoiler' | 'nsfw' | 'politics' | null;
  const [activeTag, setActiveTag] = useState<ContentTag>(null);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const tagMenuRef = useRef<HTMLDivElement>(null);
  const isSpoiler = activeTag === 'spoiler';
  const isNsfw = activeTag === 'nsfw';
  const isPolitics = activeTag === 'politics';

  const [gta6AutoSubmit, setGta6AutoSubmit] = useState(false);
  const [diceCooldown, setDiceCooldown] = useState(() => {
    try {
      const until = Number(localStorage.getItem('vopley_dice_cd'));
      return until > Date.now();
    } catch { return false; }
  });
  const diceCooldownTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!diceCooldown) return;
    try {
      const until = Number(localStorage.getItem('vopley_dice_cd'));
      const remaining = until - Date.now();
      if (remaining <= 0) { setDiceCooldown(false); return; }
      diceCooldownTimer.current = setTimeout(() => setDiceCooldown(false), remaining);
      return () => clearTimeout(diceCooldownTimer.current);
    } catch { setDiceCooldown(false); }
  }, [diceCooldown]);


  // Poll state
  const [showPollEditor, setShowPollEditor] = useState(false);
  const [pollPayload, setPollPayload] = useState<PollPayload | null>(null);
  const pollEditorRef = useRef<PollEditorHandle>(null);

  // Close tag menu on outside click
  useEffect(() => {
    if (!tagMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (tagMenuRef.current && !tagMenuRef.current.contains(e.target as Node)) setTagMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tagMenuOpen]);

  const selectTag = useCallback((tag: ContentTag) => {
    setActiveTag(prev => prev === tag ? null : tag);
    setTagMenuOpen(false);
  }, []);

  const charCount = effectiveLength(content, NEWLINE_CHAR_COST);
  const isOverLimit = charCount > SHOUT_MAX_LENGTH;
  const hasMedia = media.hasMedia || !!detectedYtId;

  // FR-035 — PERMANENT (2026-07-31): galleries are images-only. A GIF picker
  // stays unavailable once any image or another GIF is already attached (this
  // caps GIF attachment at exactly one, closing the "stack multiple GIFs" gap
  // — see research D19), and image attachment stays unavailable once a GIF is
  // attached. Twin gate lives in ShoutCard's reply composer.
  const gifPickerBlocked = media.hasImages || media.hasVideo || media.isFull || media.hasGif;
  const imageAttachBlocked = media.hasGif || media.hasVideo || media.isFull;
  const hasPoll = !!pollPayload && pollPayload.options.length > 0;
  const canSubmit = (content.trim() || hasMedia) && (!hasPoll || content.trim()) && !isOverLimit && !isSubmitting && !isUploading;

  // Detect YouTube URLs in content (only when no image is attached)
  useEffect(() => {
    if (media.hasMedia) {
      setDetectedYtId(null);
      return;
    }
    const id = detectYouTubeId(content);
    setDetectedYtId(id);
  }, [content, media.hasMedia]);

  // Upload orchestration lives in useMediaAttachments — capacity gate (FR-033),
  // per-file error reporting (FR-034) and the video rule (FR-028) are all there.
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    e.target.value = '';
    await media.addFiles(list);
  };

  // Drag-and-drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

    if (isUploading) return;

    // Multi-file drop (FR-005). The hook enforces the 5-item cap.
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      await media.addFiles(files);
    }
  };

  const handleGifSelect = async (gif: GifPickerSelection) => {
    if (gif.kind === 'mygif') {
      // Reusing an already-uploaded personal GIF isn't gated by mediaAllowed —
      // only uploading a *new* one is (see GifPicker's uploadAllowed prop).
      media.addExisting({ mediaId: gif.mediaId, previewUrl: gif.url, isGif: true });
      return;
    }
    media.setError(null);
    try {
      const res = await fetch('/api/v1/gifs/reference', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ giphyId: gif.giphyId, giphyUrl: gif.url, giphyStill: gif.still, width: gif.width, height: gif.height }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
      media.addExisting({ mediaId: data.mediaId, previewUrl: gif.url, isGif: true });
    } catch (err: unknown) {
      media.setError(err instanceof Error ? err.message : 'Не удалось прикрепить GIF');
    }
  };

  // Per-item removal (FR-024, pulled forward from Stage 3 on 2026-07-30).
  const removeMediaItem = (localId: string) => {
    media.removeItem(localId);
    // NSFW and СПОЙЛЕР only make sense with media — clear them if this was the last item.
    if (mediaItems.length <= 1 && (activeTag === 'nsfw' || activeTag === 'spoiler')) {
      setActiveTag(null);
    }
  };

  const submitShout = async () => {
    if (!canSubmit || !user) return;

    // Validate poll options if poll editor is open
    if (showPollEditor && pollEditorRef.current && !pollEditorRef.current.validate()) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Upload deferred from selection to now (FR-041, research D14). Atomic:
      // `null` means at least one file failed — nothing is posted, and
      // media.error/media.failures already show what went wrong so the user
      // can hit "Отправить" again (which re-enters here and, per research D16,
      // skips re-uploading whatever already succeeded).
      const uploadResult = await media.submit();
      if (!uploadResult) return;
      const { mediaIds } = uploadResult;

      console.log('[ShoutInput] Submitting:', content.substring(0, 50), mediaIds.length > 0 ? `media=${mediaIds.length}` : detectedYtId ? `yt=${detectedYtId}` : '');

      const body: Record<string, unknown> = { content: content.trim() };
      if (mediaIds.length > 1) {
        // Gallery — order of the pending list is the published order (FR-006).
        body.mediaIds = mediaIds;
      } else if (mediaIds.length === 1) {
        body.mediaId = mediaIds[0];
      } else if (detectedYtId) {
        const ytMatch = content.match(/https?:\/\/[^\s]+/);
        if (ytMatch) body.youtubeUrl = ytMatch[0];
      }
      if (activeTag) body.visibilityTag = activeTag;
      if (pollPayload && pollPayload.options.length > 0) body.poll = pollPayload;

      const res = await fetch('/api/v1/shouts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(result.error || `Ошибка ${res.status}`);
      }

      console.log('[ShoutInput] Shout created successfully');
      mentionInputRef.current?.clear(); // also calls onContentChange('') → setContent('')
      media.clear();
      setDetectedYtId(null);
      setError(null);
      setActiveTag(null);
      setShowPollEditor(false);
      setPollPayload(null);
      onShoutCreated(result.shout as Shout);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось отправить вопль';
      console.error('[ShoutInput] Error:', msg);
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (gta6AutoSubmit && content.trim()) {
      setGta6AutoSubmit(false);
      submitShout();
    }
  }, [gta6AutoSubmit, content]);

  return (
    <div className="mb-6">
      <form
        onSubmit={(e) => { e.preventDefault(); submitShout(); }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`${gta6 ? 'neon-frame ' : ''}bg-th-card rounded-lg p-4 shadow-sm border transition-colors ${isDragging ? 'border-[#0087ff] bg-[#0087ff]/5' : 'border-th-border-2/50'}`}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="flex items-center justify-center py-6 text-[#0087ff] text-sm font-medium pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
            </svg>
            Отпустите для загрузки изображения
          </div>
        )}

        <div className={isDragging ? 'hidden' : ''}>
            <div className="flex gap-4">
              <div className="grow flex flex-col min-w-0">
                {user ? (
                    <div className="flex flex-col w-full gap-2">
                        <MentionInput
                            ref={mentionInputRef}
                            placeholder="Расскажите, что нового?"
                            disabled={isSubmitting}
                            onContentChange={(text) => { setContent(text); setError(null); }}
                            onSubmit={submitShout}
                            onImagePaste={async (file) => {
                              if (!isUploading) await media.addFiles([file]);
                            }}
                            size="md"
                        />
                        <div className="flex items-center gap-2 justify-end flex-wrap">
                          <div className="flex items-center gap-1 shrink-0">
                            {gta6 && (diceCooldown ? (
                              <span className="p-1 neon-dice-charging" title="Перезарядка...">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="1" y="6" width="18" height="12" rx="2" />
                                  <line x1="23" y1="10" x2="23" y2="14" />
                                  <line x1="7" y1="10" x2="7" y2="14" />
                                  <line x1="11" y1="10" x2="11" y2="14" />
                                </svg>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  const text = GTA6_RANDOM_SHOUTS[Math.floor(Math.random() * GTA6_RANDOM_SHOUTS.length)];
                                  mentionInputRef.current?.clear();
                                  mentionInputRef.current?.insertText(text);
                                  setContent(text);
                                  setGta6AutoSubmit(true);
                                  const cd = 60000 + Math.random() * 60000;
                                  try { localStorage.setItem('vopley_dice_cd', String(Date.now() + cd)); } catch {}
                                  setDiceCooldown(true);
                                }}
                                className="neon-dice p-1"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="2" y="2" width="20" height="20" rx="3" />
                                  <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
                                  <circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none" />
                                  <circle cx="8" cy="16" r="1.5" fill="currentColor" stroke="none" />
                                  <circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none" />
                                  <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
                                </svg>
                              </button>
                            ))}
                            <EmojiPicker onSelect={(emoji) => mentionInputRef.current?.insertText(emoji)} onSelectGif={!detectedYtId && !gifPickerBlocked ? handleGifSelect : undefined} />
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={isUploading || imageAttachBlocked || user?.mediaAllowed === false}
                              className={`p-1 transition-colors ${media.hasMedia ? 'text-[#0087ff]' : 'text-th-text-4 hover:text-th-text-2'} disabled:opacity-40`}
                              title={user?.mediaAllowed === false ? 'Вам запрещено прикреплять медиафайлы' : media.isFull ? 'Достигнут лимит в 5 файлов' : media.hasGif ? 'GIF нельзя совмещать с изображениями' : 'Прикрепить изображения (или перетащите)'}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => mentionInputRef.current?.wrapSpoiler()}
                              className="p-1 text-th-text-4 hover:text-th-text-2 transition-colors"
                              title="Спойлер (||текст||)"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                                <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowPollEditor(v => !v)}
                              className={`p-1 transition-colors ${showPollEditor ? 'text-[#0087ff]' : 'text-th-text-4 hover:text-th-text-2'}`}
                              title="Опрос"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                              </svg>
                            </button>
                            <div className="relative" ref={tagMenuRef}>
                              <button
                                type="button"
                                onClick={() => setTagMenuOpen(o => !o)}
                                className={`p-1 transition-colors rounded ${activeTag ? (isSpoiler ? 'text-amber-400' : isNsfw ? 'text-red-400' : 'text-blue-400') : 'text-th-text-4 hover:text-th-text-2'}`}
                                title="Тег контента"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                </svg>
                              </button>
                              {tagMenuOpen && (
                                <div className="absolute right-0 bottom-full mb-2 w-52 bg-th-card border border-th-border rounded-xl shadow-lg z-50 overflow-hidden">
                                  <div className="px-3 py-2 text-[10px] font-bold text-th-text-4 uppercase tracking-wider border-b border-th-border-2">Тег контента</div>
                                  <button
                                    type="button"
                                    onClick={() => hasMedia && selectTag('spoiler')}
                                    className={`flex items-center gap-3 w-full px-3 py-2.5 text-left transition-colors ${!hasMedia ? 'opacity-30 cursor-not-allowed' : isSpoiler ? 'bg-amber-500/10' : 'hover:bg-th-elevated/50'}`}
                                  >
                                    <span className={`text-xs font-bold ${isSpoiler ? 'text-amber-400' : 'text-th-text-3'}`}>СПОЙЛЕР</span>
                                    <span className="text-[10px] text-th-text-4">{hasMedia ? '' : 'нужно медиа'}</span>
                                    {isSpoiler && <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-amber-400 ml-auto" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => hasMedia && selectTag('nsfw')}
                                    className={`flex items-center gap-3 w-full px-3 py-2.5 text-left transition-colors ${!hasMedia ? 'opacity-30 cursor-not-allowed' : isNsfw ? 'bg-red-500/10' : 'hover:bg-th-elevated/50'}`}
                                  >
                                    <span className={`text-xs font-bold ${isNsfw ? 'text-red-400' : 'text-th-text-3'}`}>NSFW</span>
                                    <span className="text-[10px] text-th-text-4">{hasMedia ? '18+' : 'нужно медиа'}</span>
                                    {isNsfw && <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-red-400 ml-auto" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => selectTag('politics')}
                                    className={`flex items-center gap-3 w-full px-3 py-2.5 text-left transition-colors ${isPolitics ? 'bg-blue-500/10' : 'hover:bg-th-elevated/50'}`}
                                  >
                                    <span className={`text-xs font-bold ${isPolitics ? 'text-blue-400' : 'text-th-text-3'}`}>ПОЛИТИКА</span>
                                    {isPolitics && <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-blue-400 ml-auto" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4"
                            className="hidden"
                            onChange={handleFileSelect}
                          />
                          {(content.trim() || hasMedia || hasPoll) && (
                              <>
                                <span className={`text-xs whitespace-nowrap ${isOverLimit ? 'text-red-400 font-semibold' : charCount > SHOUT_MAX_LENGTH * 0.9 ? 'text-yellow-400' : 'text-th-text-4'}`}>
                                  {charCount}/{SHOUT_MAX_LENGTH}
                                </span>
                                <button
                                    type="submit"
                                    disabled={!canSubmit}
                                    className="text-[#0087ff] hover:text-blue-400 text-sm font-bold whitespace-nowrap disabled:opacity-50"
                                >
                                    {isSubmitting ? '...' : 'Отправить'}
                                </button>
                              </>
                          )}
                        </div>
                    </div>
                ) : (
                    <div className="text-th-text-3 text-sm">
                        Чтобы оставить Вопль, <button type="button" onClick={openModal} className="text-th-text hover:underline font-medium">Войдите</button> или <button type="button" onClick={openModal} className="text-th-text hover:underline font-medium">Зарегистрируйтесь</button>
                    </div>
                )}
              </div>
            </div>

            {/* Media preview (2026-07-30: bordered horizontal-scroll strip, unified 80px, per-item remove + click-to-preview) */}
            {mediaItems.length > 0 && (
              <div className="relative">
                {isUploading && (
                  <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center z-10">
                    <div className="w-6 h-6 border-2 border-th-text-4 border-t-th-text rounded-full animate-spin" />
                  </div>
                )}
                <PendingMediaStrip items={mediaItems} onRemove={removeMediaItem} disabled={isUploading} edgeToEdge />
              </div>
            )}

            {/* YouTube auto-detect preview */}
            {!media.hasMedia && detectedYtId && (
              <div className="mt-3 flex items-center gap-3 bg-th-inset/50 rounded-lg p-2 border border-th-border-2">
                <img
                  src={`https://img.youtube.com/vi/${detectedYtId}/default.jpg`}
                  alt="YouTube"
                  className="w-20 h-15 rounded object-cover shrink-0"
                />
                <div className="text-xs text-th-text-3">
                  YouTube видео будет встроено в вопль
                </div>
              </div>
            )}

            {/* Poll editor */}
            {showPollEditor && (
              <PollEditor
                ref={pollEditorRef}
                onClose={() => { setShowPollEditor(false); setPollPayload(null); }}
                onChange={setPollPayload}
              />
            )}
        </div>
      </form>
      {(error || media.error) && (
        <div className="mt-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error || media.error}
        </div>
      )}
      {media.failures.length > 0 && (
        <div className="mt-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {media.failures.map((f) => (
            <div key={f.name} className="break-words">{f.name}: {f.message}</div>
          ))}
          {media.error === SUBMIT_FAILED_MESSAGE && (
            <button
              type="button"
              onClick={submitShout}
              disabled={isSubmitting || isUploading}
              className="mt-1 text-[#0087ff] hover:text-blue-400 font-semibold disabled:opacity-50"
            >
              Попробовать снова
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ShoutInput;
