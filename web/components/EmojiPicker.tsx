import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';

const EMOJI_GROUPS = [
  { label: 'Часто', emojis: ['😂', '😍', '🔥', '👍', '👎', '❤️', '😢', '😡', '🤔', '🙏', '🎉', '💯', '😭', '🥺', '😤', '🤡', '💀', '☠️'] },
  { label: 'Лица', emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🫢', '🤫', '🤔', '🫡', '🤐', '🤨', '😐', '😑', '😶', '🫥', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🥴', '😵', '🤯', '🥱', '😎', '🤓', '🧐', '😕', '🫤', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺', '🥹', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥵', '🥶', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖'] },
  { label: 'Жесты', emojis: ['👋', '🤚', '🖐️', '✋', '🖖', '🫱', '🫲', '🫳', '🫴', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '🫵', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏', '💪', '🦾', '🖖', '👀', '👁️', '👅', '🧠', '🦷', '🦴'] },
  { label: 'Люди', emojis: ['💁', '🙅', '🙆', '🙋', '🤦', '🤷', '💆', '💇', '🧖', '🚶', '🏃', '💃', '🕺', '🧗', '🏄', '🏊', '🚴', '🧘', '👫', '👬', '👭', '💏', '💑', '👨‍👩‍👦', '👨‍👩‍👧‍👦'] },
  { label: 'Сердечки', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💖', '💝', '💘', '💕', '💞', '💓', '💗', '❤️‍🔥', '❤️‍🩹', '💔', '❣️', '💟'] },
  { label: 'Природа', emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐔', '🐧', '🐦', '🦆', '🦅', '🦉', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🪲', '🐢', '🐍', '🦎', '🐙', '🦑', '🐠', '🐟', '🐬', '🐳', '🦈', '🐊', '🐘', '🦏', '🦛', '🐪', '🦒', '🦘', '🦫', '🦔', '🐁', '🐀', '🐿️', '🦇', '🌸', '💐', '🌹', '🌺', '🌻', '🌼', '🌷', '🌱', '🌲', '🌳', '🌴', '🌵', '🍀', '🍁', '🍂', '🍄', '🌾'] },
  { label: 'Еда', emojis: ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🥑', '🍆', '🥔', '🥕', '🌽', '🌶️', '🫑', '🥒', '🥬', '🥦', '🧄', '🧅', '🍄', '🥜', '🍞', '🥐', '🥖', '🥨', '🧀', '🥚', '🍳', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🌭', '🍔', '🍟', '🍕', '🫓', '🥪', '🌮', '🌯', '🫔', '🥗', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🍤', '🍙', '🍚', '🍘', '🍥', '🥮', '🍡', '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🥛', '🍼', '☕', '🍵', '🫖', '🧃', '🥤', '🧋', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧉'] },
  { label: 'Активности', emojis: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🥊', '🥋', '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤸', '🤺', '⛹️', '🤾', '🏌️', '🏇', '🧘', '🎯', '🎮', '🕹️', '🎲', '🧩', '♟️', '🎭', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🪕', '🎻', '🎵', '🎶', '🎙️'] },
  { label: 'Путешествия', emojis: ['🚗', '🚕', '🚙', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🏍️', '🛵', '🚲', '🛴', '🚂', '🚆', '🚇', '🚊', '🚁', '🛸', '🚀', '🛩️', '✈️', '🛳️', '⛴️', '🚢', '⛽', '🚧', '⚓', '🏠', '🏡', '🏗️', '🏭', '🏢', '🏬', '🏥', '🏦', '🏨', '🏪', '🏫', '🏰', '🏯', '🗼', '🗽', '⛪', '🕌', '🛕', '🕍', '⛩️', '🌍', '🌎', '🌏', '🗺️', '🧭'] },
  { label: 'Объекты', emojis: ['⌚', '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '🕹️', '💽', '💾', '💿', '📀', '📷', '📹', '🎥', '📽️', '📺', '📻', '🔦', '🕯️', '💡', '🔌', '🔋', '🧲', '💎', '🔧', '🔨', '⚒️', '🛠️', '🔩', '⚙️', '🔗', '⛓️', '🧰', '🧲', '💊', '🩹', '🩺', '🧪', '🧫', '🧬', '🔬', '🔭', '📡', '💉', '🩸'] },
  { label: 'Символы', emojis: ['❤️', '🔥', '✨', '⭐', '🌟', '💫', '⚡', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '💥', '💢', '💬', '👁️‍🗨️', '🗯️', '💭', '💤', '🔔', '🔕', '📢', '📣', '💠', '⚜️', '🔰', '⭕', '✅', '☑️', '✔️', '❌', '❎', '➕', '➖', '➗', '✖️', '♾️', '❓', '❗', '‼️', '⁉️', '❕', '❔', '⚠️', '🚫', '🔞', '♻️', '🏴', '🏳️', '🏁', '🚩', '🎌', '🏴‍☠️', '🇷🇺'] },
  { label: 'Флаги', emojis: ['🏳️‍🌈', '🏳️‍⚧️', '🇺🇦', '🇺🇸', '🇬🇧', '🇩🇪', '🇫🇷', '🇪🇸', '🇮🇹', '🇯🇵', '🇰🇷', '🇨🇳', '🇧🇷', '🇮🇳', '🇨🇦', '🇦🇺', '🇲🇽', '🇹🇷', '🇵🇱', '🇳🇱', '🇸🇪', '🇳🇴', '🇫🇮', '🇩🇰', '🇨🇿', '🇦🇹', '🇨🇭', '🇧🇪', '🇵🇹', '🇬🇷', '🇮🇱', '🇪🇬', '🇿🇦', '🇦🇷', '🇨🇱', '🇨🇴', '🇵🇪', '🇻🇪', '🇹🇭', '🇻🇳', '🇮🇩', '🇵🇭', '🇲🇾', '🇸🇬', '🇳🇿', '🇮🇪', '🇷🇴', '🇭🇺', '🇧🇬', '🇭🇷', '🇷🇸', '🇬🇪', '🇦🇲', '🇦🇿', '🇰🇿', '🇺🇿', '🇧🇾'] },
];

// Search keywords for emojis (Russian + English)
const EMOJI_KEYWORDS: Record<string, string[]> = {
  // Часто
  '😂': ['смех', 'слезы', 'ржу', 'лол', 'хаха', 'laugh', 'joy'],
  '😍': ['любовь', 'влюблен', 'сердечки', 'love', 'heart eyes'],
  '🔥': ['огонь', 'fire', 'жара', 'круто', 'горячо', 'hot'],
  '👍': ['лайк', 'класс', 'палец', 'хорошо', 'like', 'ок', 'thumbs up'],
  '👎': ['дизлайк', 'плохо', 'палец вниз', 'dislike', 'thumbs down'],
  '❤️': ['сердце', 'любовь', 'heart', 'love', 'красный'],
  '😢': ['грусть', 'слеза', 'печаль', 'sad', 'cry'],
  '😡': ['злость', 'злой', 'бесит', 'angry', 'rage'],
  '🤔': ['думаю', 'хмм', 'думать', 'think', 'hmm', 'thinking'],
  '🙏': ['пожалуйста', 'спасибо', 'молитва', 'please', 'thanks', 'pray'],
  '🎉': ['праздник', 'вечеринка', 'ура', 'party', 'celebrate'],
  '💯': ['сто', 'точно', 'отлично', 'идеально', 'hundred', 'perfect'],
  '🥺': ['милый', 'просьба', 'жалко', 'pleading', 'puppy eyes'],
  '🤡': ['клоун', 'шут', 'clown'],
  '💀': ['череп', 'мертв', 'skull', 'dead', 'dying'],
  '☠️': ['череп', 'кости', 'skull', 'crossbones', 'опасность'],
  // Лица
  '😀': ['улыбка', 'радость', 'smile', 'happy', 'grinning'],
  '😃': ['улыбка', 'радость', 'smile', 'smiley'],
  '😄': ['улыбка', 'радость', 'смех', 'smile', 'grin'],
  '😁': ['улыбка', 'ухмылка', 'grin', 'beaming'],
  '😆': ['смех', 'laugh', 'ха', 'squint'],
  '😅': ['пот', 'неловко', 'sweat', 'nervous'],
  '🤣': ['ржу', 'катаюсь', 'смех', 'rofl', 'rolling'],
  '🙂': ['улыбка', 'slightly smiling', 'нормально'],
  '🙃': ['перевернутый', 'upside down', 'ирония', 'сарказм'],
  '😉': ['подмигивание', 'wink'],
  '😊': ['мило', 'стесняюсь', 'blush', 'sweet'],
  '😇': ['ангел', 'святой', 'angel', 'innocent'],
  '🥰': ['любовь', 'сердечки', 'love', 'hearts', 'adore'],
  '😘': ['поцелуй', 'kiss', 'чмок'],
  '😗': ['поцелуй', 'kiss', 'kissing'],
  '😚': ['поцелуй', 'kiss', 'закрытые глаза'],
  '😙': ['поцелуй', 'свист', 'kiss', 'whistle'],
  '🥲': ['улыбка сквозь слезы', 'holding back tears', 'грустная улыбка'],
  '😋': ['вкусно', 'еда', 'yum', 'delicious'],
  '😛': ['язык', 'tongue', 'дразнить'],
  '😜': ['язык', 'подмигивание', 'wink tongue', 'crazy'],
  '🤪': ['сумасшедший', 'crazy', 'zany', 'дурачиться'],
  '😝': ['язык', 'tongue', 'squint'],
  '🤑': ['деньги', 'money', 'богатый', 'доллар'],
  '🤗': ['обнимашки', 'hug', 'обнять'],
  '🤭': ['ой', 'хихи', 'giggle', 'oops'],
  '🫢': ['ой', 'рот', 'oops', 'surprised'],
  '🤫': ['тсс', 'тихо', 'shush', 'quiet', 'secret'],
  '🫡': ['салют', 'salute', 'честь'],
  '🤐': ['молчание', 'рот на замке', 'zip', 'mute'],
  '🤨': ['сомнение', 'бровь', 'raised eyebrow', 'skeptical'],
  '😐': ['нейтральный', 'neutral', 'покерфейс'],
  '😑': ['безразличие', 'expressionless', 'покерфейс'],
  '😶': ['молчание', 'без рта', 'no mouth', 'speechless'],
  '🫥': ['пустой', 'dotted', 'невидимый'],
  '😏': ['ухмылка', 'smirk', 'хитрый'],
  '😒': ['скука', 'недовольный', 'unamused'],
  '🙄': ['закатываю глаза', 'eye roll', 'ну да'],
  '😬': ['гримаса', 'grimace', 'awkward', 'неловко'],
  '🤥': ['врун', 'пиноккио', 'liar', 'lying'],
  '😌': ['спокойствие', 'relieved', 'расслаблен'],
  '😔': ['грусть', 'печаль', 'sad', 'pensive'],
  '😪': ['сонный', 'sleepy', 'слюна'],
  '🤤': ['слюни', 'drool', 'вкусно'],
  '😴': ['сон', 'спать', 'sleep', 'zzz'],
  '😷': ['маска', 'mask', 'болезнь', 'sick'],
  '🤒': ['болезнь', 'sick', 'температура', 'thermometer'],
  '🤕': ['травма', 'bandage', 'больно', 'injured'],
  '🤢': ['тошнит', 'nauseated', 'зеленый'],
  '🤮': ['тошнит', 'фу', 'vomit', 'puke'],
  '🥴': ['пьяный', 'drunk', 'woozy', 'головокружение'],
  '😵': ['шок', 'dizzy', 'кружится голова'],
  '🤯': ['взрыв', 'мозг', 'шок', 'mind blown', 'exploding'],
  '🥱': ['зевок', 'скучно', 'yawn'],
  '😎': ['крутой', 'очки', 'cool', 'sunglasses'],
  '🤓': ['ботан', 'nerd', 'очки', 'умный'],
  '🧐': ['монокль', 'monocle', 'детектив', 'inspect'],
  '😕': ['смущение', 'confused', 'непонятно'],
  '🫤': ['сомнение', 'diagonal mouth'],
  '😟': ['волнение', 'worried', 'тревога'],
  '🙁': ['грусть', 'sad', 'frown'],
  '😮': ['удивление', 'wow', 'oh', 'surprised'],
  '😯': ['удивление', 'hushed', 'тихо'],
  '😲': ['шок', 'astonished', 'ого'],
  '😳': ['стыд', 'flushed', 'краснею', 'embarrassed'],
  '🥹': ['слезы', 'трогательно', 'holding tears', 'touching'],
  '😦': ['хмурый', 'frowning', 'sad'],
  '😧': ['тревога', 'anguished'],
  '😨': ['испуг', 'страх', 'fear', 'fearful'],
  '😰': ['тревога', 'нервы', 'anxious', 'cold sweat'],
  '😥': ['грусть', 'разочарование', 'disappointed'],
  '😭': ['плачу', 'рыдаю', 'слезы', 'cry', 'sob', 'loudly crying'],
  '😱': ['шок', 'ужас', 'страх', 'scream'],
  '😖': ['сморщился', 'confounded'],
  '😣': ['терпение', 'persevere'],
  '😞': ['разочарование', 'disappointed'],
  '😓': ['пот', 'downcast', 'sweat'],
  '😩': ['устал', 'weary', 'whine'],
  '😫': ['устал', 'tired', 'exhausted'],
  '🥵': ['жарко', 'горячо', 'hot', 'sweating'],
  '🥶': ['холодно', 'мерзну', 'cold', 'freezing'],
  '😤': ['злой', 'пар', 'huff', 'triumph', 'steam'],
  '😠': ['злой', 'angry'],
  '🤬': ['ругается', 'мат', 'swear', 'cursing'],
  '😈': ['дьявол', 'злой', 'devil', 'imp'],
  '👿': ['дьявол', 'злой', 'angry devil', 'imp'],
  '👹': ['они', 'ogre', 'демон', 'японский'],
  '👺': ['тенгу', 'goblin', 'японский'],
  '👻': ['привидение', 'ghost', 'бу'],
  '👽': ['инопланетянин', 'alien', 'нло'],
  '👾': ['монстр', 'space invader', 'игра'],
  '🤖': ['робот', 'robot', 'бот'],
  // Жесты
  '👋': ['привет', 'пока', 'wave', 'hello', 'bye'],
  '🤚': ['стоп', 'рука', 'stop', 'hand'],
  '🖐️': ['рука', 'пять', 'hand', 'five'],
  '✋': ['стоп', 'рука', 'high five', 'stop'],
  '🖖': ['вулкан', 'vulcan', 'спок', 'star trek'],
  '🫱': ['рука вправо', 'rightward'],
  '🫲': ['рука влево', 'leftward'],
  '🫳': ['рука вниз', 'palm down'],
  '🫴': ['рука вверх', 'palm up'],
  '👌': ['ок', 'отлично', 'ok', 'perfect'],
  '🤌': ['итальянец', 'pinched', 'chef kiss', 'мамамия'],
  '🤏': ['чуть-чуть', 'pinching', 'маленький', 'tiny'],
  '✌️': ['мир', 'победа', 'peace', 'victory'],
  '🤞': ['удачи', 'скрещены', 'crossed fingers', 'luck'],
  '🫰': ['деньги', 'money', 'щелчок', 'snap'],
  '🤟': ['люблю', 'love you', 'рок'],
  '🤘': ['рок', 'rock', 'метал', 'metal'],
  '🤙': ['звони', 'call me', 'шака'],
  '👈': ['влево', 'left', 'указатель'],
  '👉': ['вправо', 'right', 'указатель'],
  '👆': ['вверх', 'up', 'указатель'],
  '🖕': ['фак', 'fuck', 'средний палец', 'middle finger'],
  '👇': ['вниз', 'down', 'указатель'],
  '☝️': ['вверх', 'up', 'один', 'point'],
  '🫵': ['ты', 'you', 'указывать'],
  '✊': ['кулак', 'fist', 'сила'],
  '👊': ['удар', 'punch', 'fist bump'],
  '🤛': ['кулак влево', 'left fist'],
  '🤜': ['кулак вправо', 'right fist'],
  '👏': ['аплодисменты', 'браво', 'clap'],
  '🙌': ['ура', 'руки', 'yay', 'celebration'],
  '🫶': ['сердце руками', 'heart hands', 'love'],
  '👐': ['руки', 'open hands'],
  '🤲': ['ладони', 'palms up'],
  '🤝': ['рукопожатие', 'handshake', 'deal'],
  '💪': ['сила', 'мускул', 'strong', 'muscle', 'bicep'],
  '🦾': ['протез', 'mechanical arm', 'робот рука'],
  '👀': ['глаза', 'смотрю', 'eyes', 'look', 'peep'],
  '👁️': ['глаз', 'eye'],
  '👅': ['язык', 'tongue', 'лизать'],
  '🧠': ['мозг', 'умный', 'brain', 'smart'],
  '🦷': ['зуб', 'tooth'],
  '🦴': ['кость', 'bone'],
  // Люди
  '💁': ['информация', 'person', 'sassy'],
  '🙅': ['нет', 'no', 'жест'],
  '🙆': ['ок', 'ok', 'жест'],
  '🙋': ['привет', 'рука', 'hi', 'вопрос'],
  '🤦': ['фейспалм', 'facepalm', 'ну'],
  '🤷': ['не знаю', 'shrug', 'пожимает плечами'],
  '💆': ['массаж', 'massage', 'спа'],
  '💇': ['стрижка', 'haircut'],
  '🧖': ['сауна', 'spa', 'баня'],
  '🚶': ['ходьба', 'walking', 'пешеход'],
  '🏃': ['бег', 'running', 'бежать'],
  '💃': ['танец', 'dance', 'танцевать', 'сальса'],
  '🕺': ['танец', 'dance', 'диско'],
  '🧗': ['скалолазание', 'climbing'],
  '🏄': ['серфинг', 'surfing'],
  '🏊': ['плавание', 'swimming'],
  '🚴': ['велосипед', 'cycling', 'bike'],
  '🧘': ['йога', 'yoga', 'медитация'],
  '👫': ['пара', 'couple', 'мужчина женщина'],
  '👬': ['мужчины', 'men'],
  '👭': ['женщины', 'women'],
  '💏': ['поцелуй', 'kiss', 'пара'],
  '💑': ['пара', 'couple', 'сердце'],
  '👨‍👩‍👦': ['семья', 'family'],
  '👨‍👩‍👧‍👦': ['семья', 'family', 'дети'],
  // Сердечки
  '🧡': ['оранжевое сердце', 'orange heart'],
  '💛': ['желтое сердце', 'yellow heart'],
  '💚': ['зеленое сердце', 'green heart'],
  '💙': ['синее сердце', 'blue heart'],
  '💜': ['фиолетовое сердце', 'purple heart'],
  '🖤': ['черное сердце', 'black heart'],
  '🤍': ['белое сердце', 'white heart'],
  '🤎': ['коричневое сердце', 'brown heart'],
  '💖': ['сердце', 'sparkling heart', 'блестящее'],
  '💝': ['сердце', 'gift heart', 'подарок'],
  '💘': ['сердце', 'cupid', 'стрела'],
  '💕': ['сердца', 'two hearts'],
  '💞': ['сердца', 'revolving hearts'],
  '💓': ['сердце', 'beating heart'],
  '💗': ['сердце', 'growing heart'],
  '❤️‍🔥': ['сердце огонь', 'heart fire', 'страсть'],
  '❤️‍🩹': ['сердце', 'mending heart', 'лечение'],
  '💔': ['разбитое сердце', 'broken heart'],
  '❣️': ['сердце', 'heart exclamation'],
  '💟': ['сердце', 'heart decoration'],
  // Природа
  '🐶': ['собака', 'dog', 'щенок', 'пес'],
  '🐱': ['кот', 'кошка', 'cat'],
  '🐭': ['мышь', 'mouse'],
  '🐹': ['хомяк', 'hamster'],
  '🐰': ['кролик', 'rabbit', 'зайчик'],
  '🦊': ['лиса', 'fox'],
  '🐻': ['медведь', 'bear'],
  '🐼': ['панда', 'panda'],
  '🐨': ['коала', 'koala'],
  '🐯': ['тигр', 'tiger'],
  '🦁': ['лев', 'lion'],
  '🐮': ['корова', 'cow'],
  '🐷': ['свинья', 'pig'],
  '🐸': ['лягушка', 'frog'],
  '🐵': ['обезьяна', 'monkey'],
  '🙈': ['не вижу', 'see no evil', 'обезьяна'],
  '🙉': ['не слышу', 'hear no evil', 'обезьяна'],
  '🙊': ['молчу', 'speak no evil', 'обезьяна'],
  '🐔': ['курица', 'chicken'],
  '🐧': ['пингвин', 'penguin'],
  '🐦': ['птица', 'bird'],
  '🦆': ['утка', 'duck'],
  '🦅': ['орел', 'eagle'],
  '🦉': ['сова', 'owl'],
  '🐺': ['волк', 'wolf'],
  '🐗': ['кабан', 'boar'],
  '🐴': ['лошадь', 'horse', 'конь'],
  '🦄': ['единорог', 'unicorn'],
  '🐝': ['пчела', 'bee'],
  '🐛': ['гусеница', 'bug', 'жук'],
  '🦋': ['бабочка', 'butterfly'],
  '🐌': ['улитка', 'snail'],
  '🐞': ['божья коровка', 'ladybug'],
  '🐜': ['муравей', 'ant'],
  '🪲': ['жук', 'beetle'],
  '🐢': ['черепаха', 'turtle'],
  '🐍': ['змея', 'snake'],
  '🦎': ['ящерица', 'lizard'],
  '🐙': ['осьминог', 'octopus'],
  '🦑': ['кальмар', 'squid'],
  '🐠': ['рыба', 'fish', 'тропическая'],
  '🐟': ['рыба', 'fish'],
  '🐬': ['дельфин', 'dolphin'],
  '🐳': ['кит', 'whale'],
  '🦈': ['акула', 'shark'],
  '🐊': ['крокодил', 'crocodile'],
  '🐘': ['слон', 'elephant'],
  '🦏': ['носорог', 'rhino'],
  '🦛': ['бегемот', 'hippo'],
  '🐪': ['верблюд', 'camel'],
  '🦒': ['жираф', 'giraffe'],
  '🦘': ['кенгуру', 'kangaroo'],
  '🦫': ['бобр', 'beaver'],
  '🦔': ['ёж', 'hedgehog'],
  '🐁': ['мышь', 'mouse'],
  '🐀': ['крыса', 'rat'],
  '🐿️': ['белка', 'squirrel', 'бурундук'],
  '🦇': ['летучая мышь', 'bat'],
  '🌸': ['сакура', 'cherry blossom', 'цветок'],
  '💐': ['букет', 'bouquet', 'цветы'],
  '🌹': ['роза', 'rose'],
  '🌺': ['гибискус', 'hibiscus', 'цветок'],
  '🌻': ['подсолнух', 'sunflower'],
  '🌼': ['цветок', 'blossom'],
  '🌷': ['тюльпан', 'tulip'],
  '🌱': ['росток', 'seedling', 'растение'],
  '🌲': ['ёлка', 'evergreen', 'сосна'],
  '🌳': ['дерево', 'tree'],
  '🌴': ['пальма', 'palm tree'],
  '🌵': ['кактус', 'cactus'],
  '🍀': ['клевер', 'clover', 'удача'],
  '🍁': ['клен', 'maple leaf', 'осень'],
  '🍂': ['листья', 'fallen leaves', 'осень'],
  '🍄': ['гриб', 'mushroom'],
  '🌾': ['рис', 'rice', 'пшеница', 'колос'],
  // Еда
  '🍎': ['яблоко', 'apple', 'красное'],
  '🍐': ['груша', 'pear'],
  '🍊': ['апельсин', 'orange', 'мандарин'],
  '🍋': ['лимон', 'lemon'],
  '🍌': ['банан', 'banana'],
  '🍉': ['арбуз', 'watermelon'],
  '🍇': ['виноград', 'grapes'],
  '🍓': ['клубника', 'strawberry'],
  '🫐': ['черника', 'blueberry'],
  '🍒': ['вишня', 'cherry'],
  '🍑': ['персик', 'peach'],
  '🥭': ['манго', 'mango'],
  '🍍': ['ананас', 'pineapple'],
  '🥥': ['кокос', 'coconut'],
  '🥝': ['киви', 'kiwi'],
  '🥑': ['авокадо', 'avocado'],
  '🍆': ['баклажан', 'eggplant'],
  '🥔': ['картошка', 'potato'],
  '🥕': ['морковь', 'carrot'],
  '🌽': ['кукуруза', 'corn'],
  '🌶️': ['перец', 'pepper', 'острый', 'hot'],
  '🫑': ['перец', 'bell pepper'],
  '🥒': ['огурец', 'cucumber'],
  '🥬': ['салат', 'leafy green'],
  '🥦': ['брокколи', 'broccoli'],
  '🧄': ['чеснок', 'garlic'],
  '🧅': ['лук', 'onion'],
  '🥜': ['арахис', 'peanut', 'орех'],
  '🍞': ['хлеб', 'bread'],
  '🥐': ['круассан', 'croissant'],
  '🥖': ['багет', 'baguette'],
  '🥨': ['крендель', 'pretzel'],
  '🧀': ['сыр', 'cheese'],
  '🥚': ['яйцо', 'egg'],
  '🍳': ['яичница', 'fried egg'],
  '🥞': ['блины', 'pancakes'],
  '🧇': ['вафли', 'waffle'],
  '🥓': ['бекон', 'bacon'],
  '🥩': ['мясо', 'steak', 'meat'],
  '🍗': ['курица', 'chicken leg'],
  '🍖': ['мясо', 'meat on bone'],
  '🌭': ['хот-дог', 'hot dog'],
  '🍔': ['бургер', 'burger', 'гамбургер'],
  '🍟': ['картошка фри', 'fries', 'french fries'],
  '🍕': ['пицца', 'pizza'],
  '🫓': ['лепешка', 'flatbread'],
  '🥪': ['сэндвич', 'sandwich', 'бутерброд'],
  '🌮': ['тако', 'taco'],
  '🌯': ['буррито', 'burrito'],
  '🫔': ['тамале', 'tamale'],
  '🥗': ['салат', 'salad'],
  '🍝': ['паста', 'spaghetti', 'спагетти'],
  '🍜': ['суп', 'рамен', 'ramen', 'noodles'],
  '🍲': ['рагу', 'stew', 'суп'],
  '🍛': ['карри', 'curry'],
  '🍣': ['суши', 'sushi'],
  '🍱': ['бенто', 'bento', 'ланч'],
  '🥟': ['пельмени', 'dumpling', 'гёдза'],
  '🍤': ['креветка', 'shrimp', 'темпура'],
  '🍙': ['онигири', 'rice ball'],
  '🍚': ['рис', 'rice'],
  '🍘': ['рисовый крекер', 'rice cracker'],
  '🍥': ['камабоко', 'fish cake'],
  '🥮': ['лунный пряник', 'moon cake'],
  '🍡': ['данго', 'dango'],
  '🍧': ['мороженое', 'shaved ice'],
  '🍨': ['мороженое', 'ice cream'],
  '🍦': ['мороженое', 'ice cream', 'рожок'],
  '🥧': ['пирог', 'pie'],
  '🧁': ['кекс', 'cupcake', 'маффин'],
  '🍰': ['торт', 'cake', 'чизкейк'],
  '🎂': ['торт', 'birthday cake', 'день рождения'],
  '🍮': ['пудинг', 'pudding', 'крем'],
  '🍭': ['леденец', 'lollipop'],
  '🍬': ['конфета', 'candy'],
  '🍫': ['шоколад', 'chocolate'],
  '🍿': ['попкорн', 'popcorn'],
  '🍩': ['пончик', 'donut'],
  '🍪': ['печенье', 'cookie'],
  '🥛': ['молоко', 'milk'],
  '🍼': ['бутылочка', 'baby bottle'],
  '☕': ['кофе', 'coffee', 'чай', 'tea'],
  '🍵': ['чай', 'tea'],
  '🫖': ['чайник', 'teapot'],
  '🧃': ['сок', 'juice', 'juice box'],
  '🥤': ['напиток', 'drink', 'стакан'],
  '🧋': ['боба', 'boba', 'bubble tea'],
  '🍶': ['саке', 'sake'],
  '🍺': ['пиво', 'beer'],
  '🍻': ['чокаться', 'cheers', 'пиво', 'beers'],
  '🥂': ['шампанское', 'champagne', 'тост'],
  '🍷': ['вино', 'wine'],
  '🥃': ['виски', 'whisky', 'whiskey'],
  '🍸': ['коктейль', 'cocktail', 'мартини'],
  '🍹': ['коктейль', 'tropical drink'],
  '🧉': ['мате', 'mate'],
  // Активности
  '⚽': ['футбол', 'soccer', 'football'],
  '🏀': ['баскетбол', 'basketball'],
  '🏈': ['американский футбол', 'football'],
  '⚾': ['бейсбол', 'baseball'],
  '🥎': ['софтбол', 'softball'],
  '🎾': ['теннис', 'tennis'],
  '🏐': ['волейбол', 'volleyball'],
  '🏉': ['регби', 'rugby'],
  '🥏': ['фрисби', 'frisbee'],
  '🎱': ['бильярд', 'pool', 'billiards'],
  '🪀': ['йо-йо', 'yo-yo'],
  '🏓': ['пинг-понг', 'ping pong', 'настольный теннис'],
  '🏸': ['бадминтон', 'badminton'],
  '🏒': ['хоккей', 'hockey'],
  '🥊': ['бокс', 'boxing'],
  '🥋': ['каратэ', 'martial arts'],
  '🎿': ['лыжи', 'ski'],
  '⛷️': ['лыжник', 'skier'],
  '🏂': ['сноуборд', 'snowboard'],
  '🪂': ['парашют', 'parachute'],
  '🏋️': ['штанга', 'weightlifting', 'тренировка'],
  '🤸': ['колесо', 'cartwheel', 'гимнастика'],
  '🤺': ['фехтование', 'fencing'],
  '⛹️': ['баскетбол', 'bouncing ball'],
  '🤾': ['гандбол', 'handball'],
  '🏌️': ['гольф', 'golf'],
  '🏇': ['скачки', 'horse racing'],
  '🎯': ['дартс', 'darts', 'цель', 'target', 'bullseye'],
  '🎮': ['игра', 'геймер', 'game', 'gamer', 'controller'],
  '🕹️': ['джойстик', 'joystick', 'аркада'],
  '🎲': ['кубик', 'dice', 'кости'],
  '🧩': ['пазл', 'puzzle'],
  '♟️': ['шахматы', 'chess'],
  '🎭': ['театр', 'theater', 'маски'],
  '🎨': ['искусство', 'art', 'палитра', 'рисование'],
  '🎬': ['кино', 'фильм', 'movie', 'film', 'clapper'],
  '🎤': ['микрофон', 'microphone', 'караоке', 'пение'],
  '🎧': ['наушники', 'headphones', 'музыка'],
  '🎼': ['ноты', 'musical score'],
  '🎹': ['пианино', 'piano', 'клавиши'],
  '🥁': ['барабан', 'drum'],
  '🎷': ['саксофон', 'saxophone'],
  '🎺': ['труба', 'trumpet'],
  '🎸': ['гитара', 'guitar', 'рок'],
  '🪕': ['банджо', 'banjo'],
  '🎻': ['скрипка', 'violin'],
  '🎵': ['музыка', 'music', 'нота', 'note'],
  '🎶': ['музыка', 'music', 'ноты', 'notes'],
  '🎙️': ['студия', 'studio microphone', 'подкаст'],
  // Путешествия
  '🚗': ['машина', 'car', 'авто'],
  '🚕': ['такси', 'taxi'],
  '🚙': ['внедорожник', 'suv', 'машина'],
  '🏎️': ['гонка', 'racing', 'формула'],
  '🚓': ['полиция', 'police car'],
  '🚑': ['скорая', 'ambulance'],
  '🚒': ['пожарная', 'fire truck'],
  '🚐': ['микроавтобус', 'minibus', 'van'],
  '🛻': ['пикап', 'pickup truck'],
  '🚚': ['грузовик', 'truck'],
  '🚛': ['фура', 'truck'],
  '🚜': ['трактор', 'tractor'],
  '🏍️': ['мотоцикл', 'motorcycle'],
  '🛵': ['скутер', 'scooter'],
  '🚲': ['велосипед', 'bicycle', 'bike'],
  '🛴': ['самокат', 'scooter'],
  '🚂': ['поезд', 'train', 'паровоз'],
  '🚆': ['поезд', 'train'],
  '🚇': ['метро', 'metro', 'subway'],
  '🚊': ['трамвай', 'tram'],
  '🚁': ['вертолет', 'helicopter'],
  '🛸': ['нло', 'ufo', 'летающая тарелка'],
  '🚀': ['ракета', 'запуск', 'rocket', 'launch', 'космос'],
  '🛩️': ['самолет', 'airplane'],
  '✈️': ['самолет', 'airplane', 'полет'],
  '🛳️': ['лайнер', 'cruise ship'],
  '⛴️': ['паром', 'ferry'],
  '🚢': ['корабль', 'ship'],
  '⛽': ['бензин', 'fuel', 'заправка'],
  '🚧': ['стройка', 'construction'],
  '⚓': ['якорь', 'anchor'],
  '🏠': ['дом', 'house', 'home'],
  '🏡': ['дом', 'house', 'сад'],
  '🏗️': ['стройка', 'construction', 'кран'],
  '🏭': ['завод', 'factory'],
  '🏢': ['офис', 'office building'],
  '🏬': ['магазин', 'department store'],
  '🏥': ['больница', 'hospital'],
  '🏦': ['банк', 'bank'],
  '🏨': ['отель', 'hotel'],
  '🏪': ['магазин', 'convenience store'],
  '🏫': ['школа', 'school'],
  '🏰': ['замок', 'castle'],
  '🏯': ['японский замок', 'japanese castle'],
  '🗼': ['башня', 'tower', 'токио'],
  '🗽': ['статуя свободы', 'statue of liberty'],
  '⛪': ['церковь', 'church'],
  '🕌': ['мечеть', 'mosque'],
  '🛕': ['храм', 'temple', 'индуизм'],
  '🕍': ['синагога', 'synagogue'],
  '⛩️': ['тории', 'torii', 'япония'],
  '🌍': ['земля', 'earth', 'мир', 'планета', 'globe'],
  '🌎': ['земля', 'earth', 'америка'],
  '🌏': ['земля', 'earth', 'азия'],
  '🗺️': ['карта', 'world map'],
  '🧭': ['компас', 'compass'],
  // Объекты
  '⌚': ['часы', 'watch'],
  '📱': ['телефон', 'phone', 'смартфон', 'мобильный'],
  '📲': ['телефон', 'mobile phone'],
  '💻': ['компьютер', 'ноутбук', 'computer', 'laptop'],
  '⌨️': ['клавиатура', 'keyboard'],
  '🖥️': ['монитор', 'desktop', 'компьютер'],
  '🖨️': ['принтер', 'printer'],
  '🖱️': ['мышка', 'mouse'],
  '🖲️': ['трекбол', 'trackball'],
  '💽': ['диск', 'minidisc'],
  '💾': ['дискета', 'floppy disk', 'сохранить'],
  '💿': ['cd', 'диск', 'compact disc'],
  '📀': ['dvd', 'диск'],
  '📷': ['камера', 'camera', 'фото'],
  '📹': ['видеокамера', 'video camera'],
  '🎥': ['кинокамера', 'movie camera'],
  '📽️': ['проектор', 'projector'],
  '📺': ['телевизор', 'tv', 'television'],
  '📻': ['радио', 'radio'],
  '🔦': ['фонарик', 'flashlight'],
  '🕯️': ['свеча', 'candle'],
  '💡': ['лампочка', 'idea', 'light bulb', 'идея'],
  '🔌': ['розетка', 'plug', 'электричество'],
  '🔋': ['батарея', 'battery'],
  '🧲': ['магнит', 'magnet'],
  '💎': ['алмаз', 'diamond', 'бриллиант', 'gem'],
  '🔧': ['ключ', 'wrench', 'инструмент'],
  '🔨': ['молоток', 'hammer'],
  '⚒️': ['инструменты', 'tools'],
  '🛠️': ['инструменты', 'tools'],
  '🔩': ['болт', 'гайка', 'bolt', 'nut'],
  '⚙️': ['шестеренка', 'gear', 'настройки'],
  '🔗': ['ссылка', 'link', 'цепь'],
  '⛓️': ['цепь', 'chains'],
  '🧰': ['ящик инструментов', 'toolbox'],
  '💊': ['таблетка', 'pill', 'лекарство'],
  '🩹': ['пластырь', 'bandage'],
  '🩺': ['стетоскоп', 'stethoscope', 'врач'],
  '🧪': ['пробирка', 'test tube', 'химия'],
  '🧫': ['чашка петри', 'petri dish'],
  '🧬': ['днк', 'dna', 'генетика'],
  '🔬': ['микроскоп', 'microscope'],
  '🔭': ['телескоп', 'telescope'],
  '📡': ['спутник', 'satellite', 'антенна'],
  '💉': ['шприц', 'syringe', 'укол'],
  '🩸': ['кровь', 'blood', 'drop'],
  // Символы
  '✨': ['блеск', 'sparkles', 'искры', 'магия'],
  '⭐': ['звезда', 'star'],
  '🌟': ['звезда', 'star', 'блеск', 'glowing'],
  '💫': ['звезда', 'dizzy', 'головокружение'],
  '⚡': ['молния', 'lightning', 'электричество', 'zap'],
  '🔴': ['красный круг', 'red circle'],
  '🟠': ['оранжевый круг', 'orange circle'],
  '🟡': ['желтый круг', 'yellow circle'],
  '🟢': ['зеленый круг', 'green circle'],
  '🔵': ['синий круг', 'blue circle'],
  '🟣': ['фиолетовый круг', 'purple circle'],
  '⚫': ['черный круг', 'black circle'],
  '⚪': ['белый круг', 'white circle'],
  '🟤': ['коричневый круг', 'brown circle'],
  '💥': ['взрыв', 'boom', 'collision'],
  '💢': ['злость', 'anger', 'символ'],
  '💬': ['сообщение', 'speech bubble', 'чат', 'message'],
  '👁️‍🗨️': ['свидетель', 'eye speech'],
  '🗯️': ['злость', 'anger bubble'],
  '💭': ['мысль', 'thought bubble', 'думать'],
  '💤': ['сон', 'sleep', 'zzz'],
  '🔔': ['звонок', 'bell', 'уведомление', 'notification'],
  '🔕': ['без звука', 'mute bell', 'тишина'],
  '📢': ['громкоговоритель', 'loudspeaker'],
  '📣': ['рупор', 'megaphone'],
  '💠': ['ромб', 'diamond'],
  '⚜️': ['лилия', 'fleur-de-lis'],
  '🔰': ['новичок', 'beginner'],
  '⭕': ['круг', 'circle', 'кольцо'],
  '✅': ['да', 'готово', 'галочка', 'yes', 'done', 'check'],
  '☑️': ['галочка', 'checkbox'],
  '✔️': ['галочка', 'check mark'],
  '❌': ['нет', 'крест', 'no', 'cross'],
  '❎': ['крест', 'cross mark'],
  '➕': ['плюс', 'plus', 'добавить'],
  '➖': ['минус', 'minus'],
  '➗': ['деление', 'division'],
  '✖️': ['умножение', 'multiply'],
  '♾️': ['бесконечность', 'infinity'],
  '❓': ['вопрос', 'question'],
  '❗': ['восклицание', 'exclamation'],
  '‼️': ['восклицание', 'double exclamation'],
  '⁉️': ['вопрос', 'exclamation question'],
  '❕': ['восклицание', 'exclamation'],
  '❔': ['вопрос', 'question'],
  '⚠️': ['внимание', 'warning', 'осторожно'],
  '🚫': ['запрет', 'prohibited', 'нельзя'],
  '🔞': ['18+', 'no minors', 'взрослый'],
  '♻️': ['переработка', 'recycle'],
  '🏴': ['черный флаг', 'black flag'],
  '🏳️': ['белый флаг', 'white flag', 'капитуляция'],
  '🏁': ['финиш', 'checkered flag', 'гонка'],
  '🚩': ['красный флаг', 'red flag'],
  '🎌': ['флаги', 'crossed flags'],
  '🏴‍☠️': ['пират', 'pirate flag', 'череп'],
  '🇷🇺': ['россия', 'russia', 'рф', 'флаг'],
  // Флаги
  '🏳️‍🌈': ['радуга', 'rainbow flag', 'прайд'],
  '🏳️‍⚧️': ['трансгендер', 'transgender flag'],
  '🇺🇦': ['украина', 'ukraine'],
  '🇺🇸': ['сша', 'usa', 'америка'],
  '🇬🇧': ['великобритания', 'uk', 'англия'],
  '🇩🇪': ['германия', 'germany'],
  '🇫🇷': ['франция', 'france'],
  '🇪🇸': ['испания', 'spain'],
  '🇮🇹': ['италия', 'italy'],
  '🇯🇵': ['япония', 'japan'],
  '🇰🇷': ['корея', 'korea', 'южная'],
  '🇨🇳': ['китай', 'china'],
  '🇧🇷': ['бразилия', 'brazil'],
  '🇮🇳': ['индия', 'india'],
  '🇨🇦': ['канада', 'canada'],
  '🇦🇺': ['австралия', 'australia'],
  '🇲🇽': ['мексика', 'mexico'],
  '🇹🇷': ['турция', 'turkey'],
  '🇵🇱': ['польша', 'poland'],
  '🇳🇱': ['нидерланды', 'netherlands'],
  '🇸🇪': ['швеция', 'sweden'],
  '🇳🇴': ['норвегия', 'norway'],
  '🇫🇮': ['финляндия', 'finland'],
  '🇩🇰': ['дания', 'denmark'],
  '🇨🇿': ['чехия', 'czech'],
  '🇦🇹': ['австрия', 'austria'],
  '🇨🇭': ['швейцария', 'switzerland'],
  '🇧🇪': ['бельгия', 'belgium'],
  '🇵🇹': ['португалия', 'portugal'],
  '🇬🇷': ['греция', 'greece'],
  '🇮🇱': ['израиль', 'israel'],
  '🇪🇬': ['египет', 'egypt'],
  '🇿🇦': ['юар', 'south africa'],
  '🇦🇷': ['аргентина', 'argentina'],
  '🇨🇱': ['чили', 'chile'],
  '🇨🇴': ['колумбия', 'colombia'],
  '🇵🇪': ['перу', 'peru'],
  '🇻🇪': ['венесуэла', 'venezuela'],
  '🇹🇭': ['таиланд', 'thailand'],
  '🇻🇳': ['вьетнам', 'vietnam'],
  '🇮🇩': ['индонезия', 'indonesia'],
  '🇵🇭': ['филиппины', 'philippines'],
  '🇲🇾': ['малайзия', 'malaysia'],
  '🇸🇬': ['сингапур', 'singapore'],
  '🇳🇿': ['новая зеландия', 'new zealand'],
  '🇮🇪': ['ирландия', 'ireland'],
  '🇷🇴': ['румыния', 'romania'],
  '🇭🇺': ['венгрия', 'hungary'],
  '🇧🇬': ['болгария', 'bulgaria'],
  '🇭🇷': ['хорватия', 'croatia'],
  '🇷🇸': ['сербия', 'serbia'],
  '🇬🇪': ['грузия', 'georgia'],
  '🇦🇲': ['армения', 'armenia'],
  '🇦🇿': ['азербайджан', 'azerbaijan'],
  '🇰🇿': ['казахстан', 'kazakhstan'],
  '🇺🇿': ['узбекистан', 'uzbekistan'],
  '🇧🇾': ['беларусь', 'belarus'],
};

// Collect all unique emojis for search
const ALL_EMOJIS = Array.from(new Set(EMOJI_GROUPS.flatMap(g => g.emojis)));

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  size?: 'sm' | 'md';
}

const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches;

const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelect, size = 'md' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [mobileReadOnly, setMobileReadOnly] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties | null>(null);

  const positionPopup = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const popupW = 352; // wider for more emojis
    const popupH = 400;
    const pad = 8;

    // Vertical: prefer above the button, fall back to below
    let top: number;
    if (rect.top - popupH - pad > 0) {
      top = rect.top - popupH - 4;
    } else {
      top = rect.bottom + 4;
    }

    // Horizontal: prefer right-aligned with button, clamp to viewport
    let left = rect.right - popupW;
    if (left < pad) left = pad;
    if (left + popupW > window.innerWidth - pad) left = window.innerWidth - pad - popupW;

    setPopupStyle({
      position: 'fixed',
      top,
      left,
      width: popupW,
    });
  }, []);

  // Position before browser paint to avoid first-open jump
  useLayoutEffect(() => {
    if (!isOpen) return;
    positionPopup();
  }, [isOpen, positionPopup]);

  useEffect(() => {
    if (!isOpen) return;
    // On mobile: make input readOnly to prevent keyboard on tap; on desktop: autofocus
    if (isTouchDevice()) {
      setMobileReadOnly(true);
    } else {
      setMobileReadOnly(false);
      setTimeout(() => searchRef.current?.focus(), 0);
    }

    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) &&
          popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
        setPopupStyle(null);
        setMobileReadOnly(false);
      }
    };
    document.addEventListener('mousedown', handler);
    window.addEventListener('resize', positionPopup);
    window.addEventListener('scroll', positionPopup, true);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('resize', positionPopup);
      window.removeEventListener('scroll', positionPopup, true);
    };
  }, [isOpen, positionPopup]);

  const btnSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const btnPad = size === 'sm' ? 'p-0.5' : 'p-1';

  const query = search.trim().toLowerCase();
  const filteredEmojis = query
    ? ALL_EMOJIS.filter(emoji => {
        const kws = EMOJI_KEYWORDS[emoji];
        if (!kws) return false;
        return kws.some(kw => kw.toLowerCase().includes(query));
      })
    : null;

  return (
    <div className="relative inline-flex items-center" ref={ref}>
      <button
        ref={btnRef}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => { setIsOpen(!isOpen); if (isOpen) { setSearch(''); setPopupStyle(null); } }}
        className={`${btnPad} text-th-text-4 hover:text-th-text-2 transition-colors shrink-0`}
        title="Эмодзи"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className={btnSize} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 100-2 1 1 0 000 2zm7-1a1 1 0 11-2 0 1 1 0 012 0zm-.464 5.535a1 1 0 10-1.415-1.414 3 3 0 01-4.242 0 1 1 0 00-1.415 1.414 5 5 0 007.072 0z" clipRule="evenodd" />
        </svg>
      </button>

      {isOpen && (
        <div
          ref={popupRef}
          style={{ ...(popupStyle || { position: 'fixed', top: -9999, left: -9999, width: 352 }), maxHeight: 400 }}
          className="bg-th-card border border-th-border rounded-lg shadow-xl z-[9999] flex flex-col"
        >
          {/* Search input */}
          <div className="p-2 pb-1 border-b border-th-border/50">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              readOnly={mobileReadOnly}
              onTouchEnd={() => { if (mobileReadOnly) { setMobileReadOnly(false); setTimeout(() => searchRef.current?.focus(), 0); } }}
              placeholder="Поиск эмодзи..."
              className="w-full bg-th-input text-th-text text-xs rounded-md px-2.5 py-1.5 outline-none border border-th-border/50 focus:border-th-text-4 placeholder-th-text-4 transition-colors"
            />
          </div>

          {/* Category quick-nav bar (Discord-style) */}
          {!query && (
            <div className="flex gap-0.5 px-2 py-1.5 border-b border-th-border/50 overflow-x-auto shrink-0">
              {EMOJI_GROUPS.map((group) => (
                <button
                  key={group.label}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const el = document.getElementById(`emoji-group-${group.label}`);
                    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="px-1.5 py-1 text-base hover:bg-th-elevated rounded transition-colors shrink-0"
                  title={group.label}
                >
                  {group.emojis[0]}
                </button>
              ))}
            </div>
          )}

          {/* Emoji grid */}
          <div className="p-2 overflow-y-auto flex-1">
            {filteredEmojis !== null ? (
              filteredEmojis.length > 0 ? (
                <div className="flex flex-wrap gap-0.5">
                  {filteredEmojis.map((emoji, i) => (
                    <button
                      key={i}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { onSelect(emoji); setIsOpen(false); setSearch(''); }}
                      className="w-8 h-8 flex items-center justify-center text-lg hover:bg-th-elevated rounded transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-th-text-4 text-center py-4">Ничего не найдено</div>
              )
            ) : (
              EMOJI_GROUPS.map((group) => (
                <div key={group.label} id={`emoji-group-${group.label}`} className="mb-2 last:mb-0">
                  <div className="text-[10px] text-th-text-4 font-medium px-1 mb-1 sticky top-0 bg-th-card py-0.5 z-10">{group.label}</div>
                  <div className="flex flex-wrap gap-0.5">
                    {group.emojis.map((emoji, i) => (
                      <button
                        key={i}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { onSelect(emoji); setIsOpen(false); setSearch(''); }}
                        className="w-8 h-8 flex items-center justify-center text-lg hover:bg-th-elevated rounded transition-colors"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EmojiPicker;
