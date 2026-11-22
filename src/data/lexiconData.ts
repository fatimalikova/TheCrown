import {
  WordEntry,
  IdiomEntry,
  PhrasalVerbEntry,
  DifficultItem,
} from '../types/lexicon';

export const WORDS_DATA: WordEntry[] = [
  // A1 - A2 Primer
  {
    id: 'word-calm',
    category: 'word',
    term: 'Calm',
    ipa: '/kɑːm/',
    level: 'A1',
    partOfSpeech: 'Adjective',
    etymology: 'Old Italian: calma (“stillness of the sea, heat of the day”)',
    azTranslation: 'Sakit, təmkinli, dinc, rahat',
    definition:
      'Not showing or feeling nervousness, anger, or other strong emotions; peaceful and undisturbed.',
    exampleEn:
      'Even when the storm rattled the study windows, the old scholar remained remarkably calm.',
    exampleAz:
      'Fırtına iş otağının pəncərələrini titrədəndə belə, yaşlı alim heyrətamiz dərəcədə təmkinli qaldı.',
    relationLabel: 'Synonyms',
    relatedTerms: ['serene', 'composed', 'tranquil'],
    folioRef: 'Fol. 012 · Index #0104',
  },
  {
    id: 'word-eager',
    category: 'word',
    term: 'Eager',
    ipa: '/ˈiː.ɡər/',
    level: 'A1',
    partOfSpeech: 'Adjective',
    etymology: 'Latin: ācer (“sharp, keen, spirited”)',
    azTranslation: 'Həvəsli, səbirsiz, can atan',
    definition:
      'Wanting to do or have something very much; marked by keen interest and enthusiastic readiness.',
    exampleEn:
      'The young apprentice was eager to translate his first chapter before sunrise.',
    exampleAz:
      'Gənc şagird günəş doğmazdan əvvəl ilk fəslini tərcümə etməyə çox həvəsli idi.',
    relationLabel: 'Collocations',
    relatedTerms: ['eager to learn', 'eager anticipation'],
    folioRef: 'Fol. 015 · Index #0118',
  },
  {
    id: 'word-curious',
    category: 'word',
    term: 'Curious',
    ipa: '/ˈkjʊə.ri.əs/',
    level: 'A2',
    partOfSpeech: 'Adjective',
    etymology: 'Latin: cūriōsus (“careful, inquisitive”, from cūra “care”)',
    azTranslation: 'Maraqlanan, hər şeyi bilmək istəyən, qəribə',
    definition:
      'Eager to know or learn something new; strange, unusual, or provoking gentle wonder.',
    exampleEn:
      'Curious about the faded margin notes, she carried the volume closer to the candlelight.',
    exampleAz:
      'Solğun haşiyə qeydləri ilə maraqlanaraq, o, cildi şam işığına daha yaxın tutdu.',
    relationLabel: 'Derivatives',
    relatedTerms: ['curiosity (n.)', 'curiously (adv.)'],
    folioRef: 'Fol. 024 · Index #0142',
  },
  {
    id: 'word-fragile',
    category: 'word',
    term: 'Fragile',
    ipa: '/ˈfrædʒ.aɪl/',
    level: 'A2',
    partOfSpeech: 'Adjective',
    etymology: 'Latin: fragilis (from frangere “to break”)',
    azTranslation: 'Kövrək, incə, tez sınan, zərif',
    definition:
      'Easily broken, shattered, or damaged; delicate in structure or emotional state.',
    exampleEn:
      'The medieval parchment was too fragile to be exposed to harsh daylight.',
    exampleAz:
      'Orta əsr perqamenti sərt gün işığına məruz qoyulmaq üçün həddən artıq kövrək idi.',
    relationLabel: 'Antonyms',
    relatedTerms: ['durable', 'sturdy', 'resilient'],
    folioRef: 'Fol. 029 · Index #0169',
  },
  {
    id: 'word-humble',
    category: 'word',
    term: 'Humble',
    ipa: '/ˈhʌm.bəl/',
    level: 'A2',
    partOfSpeech: 'Adjective',
    etymology: 'Latin: humilis (“lowly, near the earth”, from humus “earth”)',
    azTranslation: 'Təvazökar, sadə, iddiasız',
    definition:
      'Having or showing a modest or low estimate of one’s importance; unpretentious in manner or origin.',
    exampleEn:
      'Despite his vast library and honors, the professor lived in a humble cottage by the river.',
    exampleAz:
      'Geniş kitabxanasına və fəxri adlarına baxmayaraq, professor çay kənarındakı sadə bir evdə yaşayırdı.',
    relationLabel: 'Synonyms',
    relatedTerms: ['modest', 'unassuming', 'meek'],
    folioRef: 'Fol. 033 · Index #0188',
  },
  {
    id: 'word-ambitious',
    category: 'word',
    term: 'Ambitious',
    ipa: '/æmˈbɪʃ.əs/',
    level: 'A2',
    partOfSpeech: 'Adjective',
    etymology: 'Latin: ambitiōsus (“eager for favor or distinction”)',
    azTranslation: 'İddialı, məqsədyönlü, böyük arzulara can atan',
    definition:
      'Having a strong desire and determination to succeed or achieve something demanding.',
    exampleEn:
      'Compiling a complete bilingual dictionary was an ambitious undertaking for a single scholar.',
    exampleAz:
      'Tam ikidilli lüğət tərtib etmək tək bir alim üçün olduqca iddialı bir təşəbbüs idi.',
    relationLabel: 'Collocations',
    relatedTerms: ['ambitious project', 'fiercely ambitious'],
    folioRef: 'Fol. 038 · Index #0205',
  },

  // B1 - B2 Scholar
  {
    id: 'word-authentic',
    category: 'word',
    term: 'Authentic',
    ipa: '/ɔːˈθen.tɪk/',
    level: 'B1',
    partOfSpeech: 'Adjective',
    etymology: 'Greek: authentikós (“original, genuine, principal”)',
    azTranslation: 'Həqiqi, əsl, orijinal, səmimi',
    definition:
      'Of undisputed origin and not a copy; genuine, true to one’s own spirit and character.',
    exampleEn:
      'Archivists examined the watermark to confirm the letter was an authentic manuscript.',
    exampleAz:
      'Arxivçilər məktubun həqiqi əlyazma olduğunu təsdiqləmək üçün su nişanını yoxladılar.',
    relationLabel: 'Synonyms',
    relatedTerms: ['genuine', 'veritable', 'bona fide'],
    folioRef: 'Fol. 051 · Index #0284',
  },
  {
    id: 'word-vivid',
    category: 'word',
    term: 'Vivid',
    ipa: '/ˈvɪv.ɪd/',
    level: 'B1',
    partOfSpeech: 'Adjective',
    etymology: 'Latin: vīvidus (“lively, animated”, from vīvere “to live”)',
    azTranslation: 'Canlı, parlaq, aydın, təsirli',
    definition:
      'Producing powerful feelings or strong, clear images in the mind; intensely bright or distinct.',
    exampleEn:
      'Her vivid descriptions of the Caspian coast lingered in the reader’s imagination.',
    exampleAz:
      'Onun Xəzər sahilləri barədə canlı təsvirləri oxucunun xəyalında uzun müddət qaldı.',
    relationLabel: 'Collocations',
    relatedTerms: ['vivid memory', 'vivid imagination'],
    folioRef: 'Fol. 064 · Index #0339',
  },
  {
    id: 'word-persist',
    category: 'word',
    term: 'Persist',
    ipa: '/pəˈsɪst/',
    level: 'B1',
    partOfSpeech: 'Verb',
    etymology: 'Latin: persistere (per- “through” + sistere “to stand firm”)',
    azTranslation: 'İnadkarlıq göstərmək, davam etmək, təkid etmək',
    definition:
      'To continue firmly or obstinately in a course of action in spite of difficulty or opposition.',
    exampleEn:
      'Those who persist through the subtleties of English syntax eventually speak with effortless grace.',
    exampleAz:
      'İngilis sintaksisinin incəlikləri qarşısında inadla davam edənlər sonda səlis zərifliklə danışırlar.',
    relationLabel: 'Derivatives',
    relatedTerms: ['persistence (n.)', 'persistent (adj.)'],
    folioRef: 'Fol. 072 · Index #0377',
  },
  {
    id: 'word-eloquent',
    category: 'word',
    term: 'Eloquent',
    ipa: '/ˈel.ə.kwənt/',
    level: 'B2',
    partOfSpeech: 'Adjective',
    etymology: 'Latin: ēloquēns (ex- “out” + loquī “to speak”)',
    azTranslation: 'Bəlağətli, səlis danışan, təsirli nitq sahibi',
    definition:
      'Expressing oneself readily, clearly, and effectively in speech or written word; giving a clear, vivid, and emotionally stirring message.',
    exampleEn:
      'She was an eloquent advocate for the rights of those whose voices had long been muffled by circumstance.',
    exampleAz:
      'O, şəraitin səslərini uzun müddət boğduğu insanların haqları uğrunda bəlağətli bir müdafiəçi idi.',
    relationLabel: 'Collocations',
    relatedTerms: ['eloquent testimony', 'eloquent silence'],
    folioRef: 'Fol. 104 · Index #0421',
  },
  {
    id: 'word-benevolent',
    category: 'word',
    term: 'Benevolent',
    ipa: '/bəˈnev.əl.ənt/',
    level: 'B2',
    partOfSpeech: 'Adjective',
    etymology: 'Latin: benevolēns (bene “well” + velle “to wish”)',
    azTranslation: 'Xeyirxah, nəcib, alicənab, şəfqətli',
    definition:
      'Well-meaning and kindly; serving a charitable rather than a profit-making purpose; inclined to do kind deeds.',
    exampleEn:
      'The elder scholar cast a benevolent glance across the lecture hall, encouraging even the most hesitant inquiries.',
    exampleAz:
      'Yaşlı alim mühazirə zalına xeyirxah və şəfqətli nəzər salaraq, hətta ən tərəddüdlü sualları belə həvəsləndirdi.',
    relationLabel: 'Antonyms',
    relatedTerms: ['malevolent', 'spiteful'],
    folioRef: 'Fol. 107 · Index #0192',
  },
  {
    id: 'word-resilience',
    category: 'word',
    term: 'Resilience',
    ipa: '/rɪˈzɪl.jəns/',
    level: 'B2',
    partOfSpeech: 'Noun',
    etymology: 'Latin: resilīre (re- “back” + salīre “to leap or spring”)',
    azTranslation: 'Möhkəmlik, dözümlülük, çətinliklərdən sonra dirçəlmə qabiliyyəti',
    definition:
      'The capacity to withstand or recover quickly from difficulties; toughness and quiet strength under adversity.',
    exampleEn:
      'The community’s quiet resilience in the aftermath of the tempest was rooted in their unbroken sense of fellowship.',
    exampleAz:
      'Fırtınadan sonrakı dönəmdə icmanın nümayiş etdirdiyi sakit dözümlülük onların sarsılmaz həmrəylik hissindən qaynaqlanırdı.',
    relationLabel: 'Collocations',
    relatedTerms: ['emotional resilience', 'remarkable resilience'],
    folioRef: 'Fol. 109 · Index #1075',
  },
  {
    id: 'word-inevitable',
    category: 'word',
    term: 'Inevitable',
    ipa: '/ɪˈnev.ɪ.tə.bəl/',
    level: 'B2',
    partOfSpeech: 'Adjective',
    etymology: 'Latin: inēvītābilis (in- “not” + ēvītāre “to avoid”)',
    azTranslation: 'Qaçılmaz, labüd, mütləq baş verəcək',
    definition:
      'Certain to happen; unable to be avoided, evaded, or prevented by human intervention.',
    exampleEn:
      'With autumn winds rising over the quadrangle, the turn of the seasons felt utterly inevitable.',
    exampleAz:
      'Həyət üzərində payız küləkləri gücləndikcə, fəsillərin dəyişməsi tamamilə qaçılmaz görünürdü.',
    relationLabel: 'Synonyms',
    relatedTerms: ['unavoidable', 'inescapable', 'inexorable'],
    folioRef: 'Fol. 112 · Index #0512',
  },

  // C1 - C2 Master
  {
    id: 'word-luminous',
    category: 'word',
    term: 'Luminous',
    ipa: '/ˈluː.mɪ.nəs/',
    level: 'C1',
    partOfSpeech: 'Adjective',
    etymology: 'Latin: lūminōsus (from lūmen “light, daybreak”)',
    azTranslation: 'Parlaq, nur saçan, aydın, işıqlı',
    definition:
      'Producing or reflecting a steady, radiant light; figuratively characterized by full comprehension or transcendent clarity.',
    exampleEn:
      'The dial of the clock had luminous numerals that hung like small green spirits in the library’s gloom.',
    exampleAz:
      'Saatın siferblatı kitabxananın zülmətində kiçik yaşıl ruhlar kimi süzülən işıqlı, nur saçan rəqəmlərə malik idi.',
    relationLabel: 'Collocations',
    relatedTerms: ['luminous intellect', 'luminous prose'],
    folioRef: 'Fol. 105 · Index #0618',
  },
  {
    id: 'word-meticulous',
    category: 'word',
    term: 'Meticulous',
    ipa: '/məˈtɪk.jə.ləs/',
    level: 'C1',
    partOfSpeech: 'Adjective',
    etymology: 'Latin: meticulōsus (“fearful, anxious”; evolving to extreme care)',
    azTranslation: 'Hədsiz dərəcədə diqqətli, incəliklərə fikir verən, zərgər dəqiqlikli',
    definition:
      'Showing great attention to detail; very careful and precise; marked by extreme or scrupulous concern for small parts.',
    exampleEn:
      'Through meticulous research and cross-examination of faded parchment deeds, the archivist verified the provenance.',
    exampleAz:
      'Solğun perqament sənədlərinin zərgər dəqiqliyi ilə tədqiqi sayəsində arxivçi əsl mənşəyi təsdiqlədi.',
    relationLabel: 'Synonyms',
    relatedTerms: ['scrupulous', 'fastidious', 'punctilious'],
    folioRef: 'Fol. 106 · Index #0834',
  },
  {
    id: 'word-ephemeral',
    category: 'word',
    term: 'Ephemeral',
    ipa: '/ɪˈfem.ər.əl/',
    level: 'C1',
    partOfSpeech: 'Adjective',
    etymology: 'Ancient Greek: ἐφήμερος (epi “upon” + hēmera “day”)',
    azTranslation: 'Müvəqqəti, qısaömürlü, tez keçən',
    definition:
      'Lasting for only a very short period of time; fleeting, transitory, or of brief, evanescent duration.',
    exampleEn:
      'Fame in modern courtly life is utterly ephemeral, evaporating with the seasonal thaw.',
    exampleAz:
      'Müasir saray həyatında şöhrət tamamilə müvəqqətidir, mövsümi donun açılması ilə buxarlanıb yox olur.',
    relationLabel: 'Antonyms',
    relatedTerms: ['perpetual', 'enduring', 'eternal'],
    folioRef: 'Fol. 114 · Index #0903',
  },
  {
    id: 'word-ubiquitous',
    category: 'word',
    term: 'Ubiquitous',
    ipa: '/juːˈbɪk.wɪ.təs/',
    level: 'C1',
    partOfSpeech: 'Adjective',
    etymology: 'Latin: ubīque (“everywhere”)',
    azTranslation: 'Hər yerdə mövcud olan, geniş yayılmış',
    definition:
      'Present, appearing, or found everywhere simultaneously; seeming to exist in all places at once.',
    exampleEn:
      'Pocket lexicons became ubiquitous among nineteenth-century continental travelers.',
    exampleAz:
      'Cib lüğətləri on doqquzuncu əsrin qitə səyyahları arasında hər yerdə rast gəlinən adi bir əşyaya çevrilmişdi.',
    relationLabel: 'Derivatives',
    relatedTerms: ['ubiquity (n.)', 'ubiquitously (adv.)'],
    folioRef: 'Fol. 118 · Index #0941',
  },
  {
    id: 'word-serendipity',
    category: 'word',
    term: 'Serendipity',
    ipa: '/ˌser.ənˈdɪp.ə.ti/',
    level: 'C2',
    partOfSpeech: 'Noun',
    etymology:
      'Coined by Horace Walpole (1754), via Persian fairy tale “The Three Princes of Serendip”',
    azTranslation: 'Bəxt, gözlənilməz xoş təsadüf, axtarmadan tapılan səadət',
    definition:
      'The occurrence and development of events by chance in a happy or beneficial way; the faculty of making fortunate discoveries unexpectedly.',
    exampleEn:
      'Finding that rare first-edition manuscript in an obscure provincial bazaar was pure serendipity.',
    exampleAz:
      'Gözdən uzaq əyalət bazarında həmin nadir birinci nəşr əlyazmasını tapmaq əsl gözlənilməz xoş təsadüf idi.',
    relationLabel: 'Derivatives',
    relatedTerms: ['serendipitous (adj.)', 'serendipitously (adv.)'],
    folioRef: 'Fol. 108 · Index #1240',
  },
  {
    id: 'word-perspicacious',
    category: 'word',
    term: 'Perspicacious',
    ipa: '/ˌpɜː.spɪˈkeɪ.ʃəs/',
    level: 'C2',
    partOfSpeech: 'Adjective',
    etymology: 'Latin: perspicāx (“sharp-sighted”, from perspicere “to see through”)',
    azTranslation: 'Fərasətli, bəsirətli, iti zəkalı, mahiyyəti tez görən',
    definition:
      'Having a ready insight into and understanding of things; acutely perceptive and discerning.',
    exampleEn:
      'A perspicacious critic detects the unspoken irony beneath polite diplomatic prose.',
    exampleAz:
      'Bəsirətli tənqidçi nəzakətli diplomatik mətnin altındakı gizli ironiyanı dərhal sezər.',
    relationLabel: 'Synonyms',
    relatedTerms: ['astute', 'sagacious', 'discerning'],
    folioRef: 'Fol. 122 · Index #1308',
  },
  {
    id: 'word-ineffable',
    category: 'word',
    term: 'Ineffable',
    ipa: '/ɪnˈef.ə.bəl/',
    level: 'C2',
    partOfSpeech: 'Adjective',
    etymology: 'Latin: ineffābilis (in- “not” + effābilis “utterable”)',
    azTranslation: 'Sözlə ifadə olunmaz, təsvirəgəlməz',
    definition:
      'Too great, extreme, or sacred to be expressed or described adequately in words.',
    exampleEn:
      'An ineffable stillness descended upon the ancient courtyard as the evening call echoed.',
    exampleAz:
      'Axşam sədası əks-səda verdikcə qədim həyətə sözlə ifadə olunmaz bir sükut çökdü.',
    relationLabel: 'Collocations',
    relatedTerms: ['ineffable grace', 'ineffable joy'],
    folioRef: 'Fol. 126 · Index #1392',
  },
];

export const IDIOMS_DATA: IdiomEntry[] = [
  {
    id: 'idiom-break-the-ice',
    category: 'idiom',
    term: 'Break the ice',
    ipa: '/breɪk ðiː aɪs/',
    levelBadge: 'IELTS Band 7+',
    registerGroup: 'IELTS Band 7.5+',
    azEquivalent: 'Buzu sındırmaq',
    azNuance: 'ünsiyyət yaratmaq, ilkin gərginliyi aradan qaldırmaq, söhbətə başlamaq',
    semanticValue:
      'To overcome formality or cold reserve in a social setting; to facilitate uninhibited dialogue.',
    loreTitle: 'Nautical Icebreaker Origin',
    loreText:
      'Derived from trade ships sent ahead with reinforced hulls to shatter frozen coastal waterways, allowing merchant convoys safe passage and open commerce.',
    imageUrl: '/src/assets/images/woodcut_icebreaker_ship_1795336049234.jpg',
    imageAlt: 'Antique woodcut illustration of a 17th-century merchant vessel navigating sea ice',
    exampleEn:
      'The chairman cracked a self-effacing jest about his punctuality, thereby breaking the ice before the stringent quarterly audit commenced.',
    exampleAz:
      'İdarə heyətinin sədri öz dəqiqliyi barədə zarafat edərək, sərt rüblük audit başlamazdan öncə yaranmış ilkin gərginliyi aradan qaldırdı.',
    registerNote: 'Formal / Colloquial Diplomatic',
    tipNote: 'Collocation: “help to...” / “serve to...”',
    folioRef: 'Fol. 018',
  },
  {
    id: 'idiom-blue-moon',
    category: 'idiom',
    term: 'Once in a blue moon',
    ipa: '/wʌns ɪn ə bluː muːn/',
    levelBadge: 'Essential Idiom',
    registerGroup: 'Everyday Colloquial',
    azEquivalent: 'Yüz ildə bir',
    azNuance: 'hədsiz dərəcədə nadir hallarda, qeyri-adi təsadüflərdə',
    semanticValue:
      'Pertaining to events of exceptional rarity or improbable recurrence.',
    loreTitle: 'Celestial Almanac Lore',
    loreText:
      'Refers to the third full moon in an astronomical season of four full moons, or two in a single solar month; occurrences separated by roughly 2.7 years.',
    imageUrl: '/src/assets/images/woodcut_lunar_chart_1795336049670.jpg',
    imageAlt: 'Astronomical ink illustration of antique lunar phases and brass armillary sphere',
    exampleEn:
      'Though gifted with a brilliant rhetorical instinct, the recluse scholar consented to address the Royal Society only once in a blue moon.',
    exampleAz:
      'İntellektual natiqlik istedadına malik olmasına baxmayaraq, xəlvətə çəkilmiş alim Kral Cəmiyyəti qarşısında çıxış etməyə yalnız yüz ildə bir razılıq verirdi.',
    registerNote: 'Expressive / General Academic',
    tipNote: 'Frequency: Band 6.5–7.5 Idiomatic Flow',
    folioRef: 'Fol. 019',
  },
  {
    id: 'idiom-bite-the-bullet',
    category: 'idiom',
    term: 'Bite the bullet',
    ipa: '/baɪt ðə ˈbʊl.ɪt/',
    levelBadge: 'IELTS Band 7.5',
    registerGroup: 'IELTS Band 7.5+',
    azEquivalent: 'Dişini sıxmaq',
    azNuance: 'qaçılmaz ağrıya, çətinliyə və ya zəruri sınağa cəsarətlə dözmək',
    semanticValue:
      'To confront an inevitable and distressing circumstance with fortitude without evasive delay.',
    loreTitle: 'Etymology · 19th Century Field Surgery',
    loreText:
      'Arising from military field hospitals before the generalisation of chemical anaesthetics, wherein wounded soldiers bit upon a soft lead projectile to endure emergency surgery.',
    exampleEn:
      'Confronted with undeniable budgetary deficits, the ministry resolved to bite the bullet and introduce severe austerity curbs.',
    exampleAz:
      'İnkaredilməz büdcə kəsirləri ilə üzləşən nazirlik dişini sıxaraq sərt qənaət tədbirlərini qüvvəyə mindirmək qərarına gəldi.',
    registerNote: 'Formal Commentary & Rhetoric',
    tipNote: 'Task 2 Value: Band 8.0 Lexical Resource',
    folioRef: 'Fol. 020',
  },
  {
    id: 'idiom-midnight-oil',
    category: 'idiom',
    term: 'Burn the midnight oil',
    ipa: '/bɜːn ðə ˈmɪd.naɪt ɔɪl/',
    levelBadge: 'Academic Register',
    registerGroup: 'Academic Register',
    azEquivalent: 'Gecə yarıyadək dərs oxumaq / çalışmaq',
    azNuance: 'gecə saatlarına qədər gərgin zehni əməklə məşğul olmaq',
    semanticValue:
      'Sustained and diligent mental labor well into the night by artificial lamp illumination.',
    loreTitle: 'Philological Antiquity · 18th-Century Scholar Lore',
    loreText:
      'Immortalised by English poet John Gay in 1727, directly alluding to oil-wick lamps burning valuable oil in solitary scholarly chambers.',
    exampleEn:
      'The researchers were obliged to burn the midnight oil in the archive, decoding the damaged parchment fragments.',
    exampleAz:
      'Tədqiqatçılar arxivdə gecə yarıyadək zəhmət çəkərək zədələnmiş perqament parçalarını deşifrə etməyə məcbur oldular.',
    registerNote: 'High Academic / Literary',
    tipNote: 'Examiner Tip: Preferable to basic “work hard late”',
    folioRef: 'Fol. 021',
  },
  {
    id: 'idiom-spilled-milk',
    category: 'idiom',
    term: 'Cry over spilled milk',
    ipa: '/kraɪ ˈoʊ.vər spɪld mɪlk/',
    levelBadge: 'Common B1–B2',
    registerGroup: 'Everyday Colloquial',
    azEquivalent: 'Keçmişə heyfsilənmək',
    azNuance: 'olan şeyə əbəs yerə kədərlənmək, geriyə qayıtmayan itkiyə yanmaq',
    semanticValue:
      'Vain, futile distress over irreversible past errors or irrecoverable losses.',
    loreTitle: 'Folk Proverb Antiquity · 1659',
    loreText:
      'Attested in James Howell’s 1659 compilation “Proverbs in English, Italian, French and Spanish” as “No weeping for shed milk”.',
    exampleEn:
      'While the clerical mistake cost us the tender, there is little merit in crying over spilled milk; we must draft the succeeding proposition.',
    exampleAz:
      'Texniki xəta tenderi itirməyimizlə nəticələnsə də, olan şeyə əbəs yerə heyfsilənməyin faydası yoxdur; növbəti təklifi hazırlamalıyıq.',
    registerNote: 'Pragmatic / Conversational',
    tipNote: 'Frequent Syntax: “No use crying over...”',
    folioRef: 'Fol. 022',
  },
  {
    id: 'idiom-piece-of-cake',
    category: 'idiom',
    term: 'Piece of cake',
    ipa: '/piːs əv keɪk/',
    levelBadge: 'Primer A2–B1',
    registerGroup: 'Everyday Colloquial',
    azEquivalent: 'Çox asan iş',
    azNuance: 'su içimi kimi, zəhmət tələb etməyən sadə tapşırıq',
    semanticValue:
      'A straightforward task achieved with absolute ease and negligible effort.',
    loreTitle: 'Mid-20th Century RAF Colloquialism',
    loreText:
      'Originated within the British Royal Air Force in 1938 describing an effortless aerial mission, inspired by 19th-century “cake walk” festivities.',
    exampleEn:
      'Having audited multinational ledgers for two decades, deciphering the boutique firm’s annual ledger was a piece of cake for him.',
    exampleAz:
      'İyirmi il transmilli şirkətlərin mühasibatını yoxladıqdan sonra, kiçik firmanın illik hesabını təhlil etmək onun üçün su içimi kimi asan idi.',
    registerNote: 'Colloquial / Informal',
    tipNote: 'Caution: Avoid in IELTS Academic Writing Task 2',
    folioRef: 'Fol. 023',
  },
  {
    id: 'idiom-between-the-lines',
    category: 'idiom',
    term: 'Read between the lines',
    ipa: '/riːd bɪˈtwiːn ðə laɪnz/',
    levelBadge: 'Academic Register',
    registerGroup: 'Academic Register',
    azEquivalent: 'Sətiraltı mənanı anlamaq',
    azNuance: 'açıq deyilməyən, gizli niyyəti və ya həqiqi mənanı başa düşmək',
    semanticValue:
      'To infer implicit meaning, subtle criticism, or unstated truth beneath literal phrasing.',
    loreTitle: 'Cryptographic Correspondence Tradition',
    loreText:
      'Derived from historical diplomatic letters where secret messages were written with invisible ink between visible lines of ordinary prose.',
    exampleEn:
      'An attentive historian learns to read between the lines of official chronicles.',
    exampleAz:
      'Diqqətli tarixçi rəsmi salnamələrin sətiraltı mənasını oxumağı öyrənir.',
    registerNote: 'Analytical / Literary Criticism',
    tipNote: 'Ideal for IELTS Speaking Part 3 analysis',
    folioRef: 'Fol. 024',
  },
  {
    id: 'idiom-blessing-in-disguise',
    category: 'idiom',
    term: 'A blessing in disguise',
    ipa: '/ə ˈbles.ɪŋ ɪn dɪsˈɡaɪz/',
    levelBadge: 'IELTS Band 7.5+',
    registerGroup: 'IELTS Band 7.5+',
    azEquivalent: 'İlk baxışda bəla, əslində xeyir',
    azNuance: 'əvvəlcə pis görünən, lakin sonradan fayda və uğur gətirən hadisə',
    semanticValue:
      'An apparent misfortune or setback that ultimately yields unforeseen benefit.',
    loreTitle: '18th-Century Moral Verse',
    loreText:
      'First documented in James Hervey’s 1746 “Reflections on a Flower-Garden”, framing adversity as providence in veiled attire.',
    exampleEn:
      'Missing the early train proved a blessing in disguise, for it led him straight to the antique bookshop.',
    exampleAz:
      'Səhər qatarına gecikmək əslində onun üçün böyük xeyir oldu, çünki bu təsadüf onu qədim kitab dükanına apardı.',
    registerNote: 'Reflective / Narrative Eloquence',
    tipNote: 'Strong narrative connector for IELTS Speaking Part 2',
    folioRef: 'Fol. 025',
  },
];

export const PHRASAL_VERBS_DATA: PhrasalVerbEntry[] = [
  {
    id: 'pv-carry-out',
    category: 'phrasal',
    term: 'Carry out',
    rootStem: 'Carry',
    particle: 'out',
    ipa: '/ˈkær.i aʊt/',
    levelBadge: 'IELTS Academic',
    grammarTag: 'Inseparable / Transitive',
    azTranslation: 'Həyata keçirmək, icra etmək',
    syntaxNote: 'Syntax: [ transitive · object optional after particle ]',
    definition:
      'To perform, conduct, or execute a planned investigation, scientific trial, or formal mandate.',
    exampleEn:
      'The scholars carried out extensive research in the Bodleian Library under candlelit vaults.',
    exampleAz:
      'Alimlər Bodleian Kitabxanasında genişmiqyaslı tədqiqat həyata keçirdilər.',
    folioRef: 'Fol. 102',
    lexCode: 'LEX-PV-00102',
  },
  {
    id: 'pv-look-forward-to',
    category: 'phrasal',
    term: 'Look forward to',
    rootStem: 'Look',
    particle: 'forward',
    ipa: '/lʊk ˈfɔː.wəd tuː/',
    levelBadge: 'Common B1',
    grammarTag: 'Three-Part Prep.',
    azTranslation: 'Səbirsizliklə gözləmək',
    syntaxNote: 'Syntax: [ verb + adv + prep + gerund / noun ]',
    definition:
      'To anticipate an imminent encounter, event, or epistolary correspondence with elevated pleasure.',
    exampleEn:
      'We look forward to receiving your dispatched manuscript before the winter equinox.',
    exampleAz:
      'Qış bərabərliyindən əvvəl göndərilən əlyazmanızı səbirsizliklə gözləyirik.',
    folioRef: 'Fol. 103',
    lexCode: 'LEX-PV-00103',
  },
  {
    id: 'pv-give-up',
    category: 'phrasal',
    term: 'Give up',
    rootStem: 'Give',
    particle: 'up',
    ipa: '/ɡɪv ʌp/',
    levelBadge: 'Everyday Essential',
    grammarTag: 'Separable',
    azTranslation: 'Təslim olmaq, əl çəkmək',
    syntaxNote: 'Syntax: [ trans / intrans · separable: give [sth] up ]',
    definition:
      'To cease an endeavor, relinquish habituated pursuit, or yield possession in defeat.',
    exampleEn:
      'The botanist refused to give up his search for the alpine rose despite severe frost.',
    exampleAz:
      'Nəbatatçı kəskin şaxtaya baxmayaraq alp qızılgülünü axtarmaqdan əl çəkməkdən imtina etdi.',
    folioRef: 'Fol. 104',
    lexCode: 'LEX-PV-00104',
  },
  {
    id: 'pv-bring-about',
    category: 'phrasal',
    term: 'Bring about',
    rootStem: 'Bring',
    particle: 'about',
    ipa: '/brɪŋ əˈbaʊt/',
    levelBadge: 'IELTS C1',
    grammarTag: 'Causative Formal',
    azTranslation: 'Səbəb olmaq, törətmək, meydana gətirmək',
    syntaxNote: 'Syntax: [ transitive · cause + effect construction ]',
    definition:
      'To cause something radical or transformative to happen, especially institutional change or reform.',
    exampleEn:
      'The Industrial Revolution brought about unprecedented transformations across rural Britain.',
    exampleAz:
      'Sənaye İnqilabı kənd Britaniyasında misli görünməmiş dəyişikliklərə səbəb oldu.',
    folioRef: 'Fol. 105',
    lexCode: 'LEX-PV-00105',
  },
  {
    id: 'pv-turn-down',
    category: 'phrasal',
    term: 'Turn down',
    rootStem: 'Turn',
    particle: 'down',
    ipa: '/tɜːn daʊn/',
    levelBadge: 'B2 Intermediate',
    grammarTag: 'Dual Aspect',
    azTranslation: 'Rədd etmək; səsini azaltmaq',
    syntaxNote: 'Syntax: [ trans · separable: turn [sth] down ]',
    definition:
      '1. Idiomatic: To decline or reject an offer or petition. 2. Literal: To diminish acoustic volume or flame.',
    exampleEn:
      'He turned down the generous stipend, choosing instead an unfettered life of study.',
    exampleAz:
      'Səxavətli təqaüdü rədd edərək, yerinə sərbəst elm yolunu seçdi.',
    folioRef: 'Fol. 106',
    lexCode: 'LEX-PV-00106',
  },
  {
    id: 'pv-set-forth',
    category: 'phrasal',
    term: 'Set forth',
    rootStem: 'Set',
    particle: 'forth',
    ipa: '/set fɔːθ/',
    levelBadge: 'C2 Literary',
    grammarTag: 'Formal / Literary',
    azTranslation: 'Yola düşmək, bəyan etmək',
    syntaxNote: 'Syntax: [ trans (state principles) / intrans (journey) ]',
    definition:
      'To begin an arduous expedition, or systematically articulate an argumentative treatise in writing.',
    exampleEn:
      'The expedition set forth across the steppe, while their manifesto set forth principles of liberty.',
    exampleAz:
      'Ekspedisiya çöl boyunca yola düşdü, bəyannamələri isə azadlıq prinsiplərini bəyan etdi.',
    folioRef: 'Fol. 107',
    lexCode: 'LEX-PV-00107',
  },
  {
    id: 'pv-take-over',
    category: 'phrasal',
    term: 'Take over',
    rootStem: 'Take',
    particle: 'over',
    ipa: '/teɪk ˈəʊ.vər/',
    levelBadge: 'B2 Intermediate',
    grammarTag: 'Separable / Intransitive',
    azTranslation: 'Öhdəsinə götürmək, idarəni ələ almaq',
    syntaxNote: 'Syntax: [ trans / intrans · take [sth] over ]',
    definition:
      'To assume control, responsibility, or stewardship of an institution, office, or scholarly work.',
    exampleEn:
      'Upon the curator’s retirement, his trusted protégée agreed to take over the archive.',
    exampleAz:
      'Kurator təqaüdə çıxdıqdan sonra, onun etibarlı tələbəsi arxivin idarəsini öhdəsinə götürməyə razılaşdı.',
    folioRef: 'Fol. 108',
    lexCode: 'LEX-PV-00108',
  },
  {
    id: 'pv-look-into',
    category: 'phrasal',
    term: 'Look into',
    rootStem: 'Look',
    particle: 'into',
    ipa: '/lʊk ˈɪn.tuː/',
    levelBadge: 'B1–B2 Academic',
    grammarTag: 'Inseparable',
    azTranslation: 'Araşdırmaq, tədqiq etmək',
    syntaxNote: 'Syntax: [ verb + prep + noun phrase ]',
    definition:
      'To investigate, examine, or inquire carefully into the facts and causes of a matter.',
    exampleEn:
      'A special committee was appointed to look into the disappearance of the royal folio.',
    exampleAz:
      'Kral əlyazmasının yoxa çıxmasını araşdırmaq üçün xüsusi komissiya təyin edildi.',
    folioRef: 'Fol. 109',
    lexCode: 'LEX-PV-00109',
  },
  {
    id: 'pv-put-off',
    category: 'phrasal',
    term: 'Put off',
    rootStem: 'Put',
    particle: 'off',
    ipa: '/pʊt ɒf/',
    levelBadge: 'B1–B2 Essential',
    grammarTag: 'Separable',
    azTranslation: 'Təxirə salmaq; həvəsdən salmaq',
    syntaxNote: 'Syntax: [ trans · put [sth] off + gerund ]',
    definition:
      'To postpone an action or appointment to a later time; also to cause someone to lose enthusiasm.',
    exampleEn:
      'Do not put off reviewing difficult vocabulary until the eve of the examination.',
    exampleAz:
      'Çətin sözləri təkrarlamağı imtahan gecəsinə qədər təxirə salmayın.',
    folioRef: 'Fol. 110',
    lexCode: 'LEX-PV-00110',
  },
  {
    id: 'pv-bring-up',
    category: 'phrasal',
    term: 'Bring up',
    rootStem: 'Bring',
    particle: 'up',
    ipa: '/brɪŋ ʌp/',
    levelBadge: 'B1 Common',
    grammarTag: 'Separable',
    azTranslation: 'Mövzu qaldırmaq; tərbiyə edib böyütmək',
    syntaxNote: 'Syntax: [ trans · bring [sb/sth] up ]',
    definition:
      'To introduce a subject into formal discussion, or to raise and educate a child.',
    exampleEn:
      'She hesitated to bring up the matter of translation fees during the banquet.',
    exampleAz:
      'Ziyafət zamanı tərcümə haqqı məsələsini qaldırmağa tərəddüd etdi.',
    folioRef: 'Fol. 111',
    lexCode: 'LEX-PV-00111',
  },
  {
    id: 'pv-give-in',
    category: 'phrasal',
    term: 'Give in',
    rootStem: 'Give',
    particle: 'in',
    ipa: '/ɡɪv ɪn/',
    levelBadge: 'B2 Upper',
    grammarTag: 'Intransitive',
    azTranslation: 'Güzəştə getmək, təslim olmaq, boyun əymək',
    syntaxNote: 'Syntax: [ intrans · give in (to sb/sth) ]',
    definition:
      'To cease fighting or arguing and reluctantly agree to someone else’s demands or pressure.',
    exampleEn:
      'After hours of patient debate, the elder dean finally gave in to the students’ petition.',
    exampleAz:
      'Saatlarla davam edən səbirli müzakirədən sonra, yaşlı dekan nəhayət tələbələrin xahişinə razı oldu.',
    folioRef: 'Fol. 112',
    lexCode: 'LEX-PV-00112',
  },
  {
    id: 'pv-turn-out',
    category: 'phrasal',
    term: 'Turn out',
    rootStem: 'Turn',
    particle: 'out',
    ipa: '/tɜːn aʊt/',
    levelBadge: 'B1–B2 Versatile',
    grammarTag: 'Intransitive',
    azTranslation: 'Nəticələnmək, məlum olmaq, üzə çıxmaq',
    syntaxNote: 'Syntax: [ intrans · turn out to be + adj/noun ]',
    definition:
      'To happen or end in a particular way; to prove to be the case upon closer discovery.',
    exampleEn:
      'The unassuming notebook turned out to be a forgotten draft by a celebrated essayist.',
    exampleAz:
      'Sadə görünən dəftərin məşhur bir esseistin unudulmuş qaralaması olduğu məlum oldu.',
    folioRef: 'Fol. 113',
    lexCode: 'LEX-PV-00113',
  },
];

export const INITIAL_DIFFICULT_ITEMS: DifficultItem[] = [
  {
    id: 'word-ephemeral',
    term: 'Ephemeral',
    category: 'word',
    badge: 'C1 · Adjective',
    ipa: '/ɪˈfem.ər.əl/',
    azTranslation: 'Müvəqqəti, qısaömürlü',
    definition:
      'Lasting for only a very short period of time; fleeting or transitory.',
    exampleEn:
      'Fame in modern courtly life is utterly ephemeral, evaporating with the seasonal thaw.',
    exampleAz:
      'Müasir saray həyatında şöhrət tamamilə müvəqqətidir, mövsümi donun açılması ilə buxarlanıb yox olur.',
    etymologyNote: 'Greek root: ephēmeros (lasting only a single day).',
    addedAt: 1730000001000,
    masteredCount: 1,
  },
  {
    id: 'idiom-break-the-ice',
    term: 'Break the ice',
    category: 'idiom',
    badge: 'Idiom',
    ipa: '/breɪk ðiː aɪs/',
    azTranslation: 'Buzu sındırmaq, gərginliyi aradan qaldırmaq',
    definition:
      'To overcome formality or awkward silence and begin comfortable conversation.',
    exampleEn:
      'An anecdotal quip concerning the weather served readily to break the ice at the solemn dinner.',
    exampleAz:
      'Hava haqqında lətifəvari bir atmaca təntənəli şam yeməyindəki gərginliyi aradan qaldırmağa yetərli oldu.',
    etymologyNote: '17th-century icebreaker ships clearing frozen harbors.',
    addedAt: 1730000002000,
    masteredCount: 1,
  },
  {
    id: 'pv-carry-out',
    term: 'Carry out',
    category: 'phrasal',
    badge: 'Phrasal Verb',
    ipa: '/ˈkær.i aʊt/',
    azTranslation: 'Həyata keçirmək, icra etmək',
    definition:
      'To conduct, execute, or complete a planned task, experiment, or directive.',
    exampleEn:
      'The botanists did diligently carry out the taxonomic survey across the moorlands.',
    exampleAz:
      'Botaniklər bataqlıq torpaqlarda taksonomik tədqiqatı böyük səylə həyata keçirdilər.',
    etymologyNote: 'Inseparable academic phrasal verb (IELTS Task 2 staple).',
    addedAt: 1730000003000,
    masteredCount: 0,
  },
  {
    id: 'word-meticulous',
    term: 'Meticulous',
    category: 'word',
    badge: 'C1 · Adjective',
    ipa: '/məˈtɪk.jə.ləs/',
    azTranslation: 'İncəliklərə diqqət yetirən, son dərəcə dəqiq',
    definition:
      'Showing great attention to detail; very careful and scrupulously precise.',
    exampleEn:
      'With meticulous strokes, she inscribed each gloss upon the vellum margin.',
    exampleAz:
      'Son dərəcə incə və dəqiq qələm hərəkətləri ilə o, perqamentin haşiyəsinə hər bir izahı qeyd edirdi.',
    etymologyNote: 'Latin: meticulōsus, evolving from anxious care to precision.',
    addedAt: 1730000004000,
    masteredCount: 1,
  },
  {
    id: 'idiom-blue-moon',
    term: 'Once in a blue moon',
    category: 'idiom',
    badge: 'Idiom',
    ipa: '/wʌns ɪn ə bluː muːn/',
    azTranslation: 'Yüz ildə bir, çox nadir hallarda',
    definition: 'Happening very rarely or almost never.',
    exampleEn:
      'He visited the quiet northern observatory only once in a blue moon.',
    exampleAz: 'O, sakit şimal rəsədxanasına yalnız yüz ildə bir baş çəkərdi.',
    etymologyNote: 'Refers to the rare extra full moon in an astronomical season.',
    addedAt: 1730000005000,
    masteredCount: 0,
  },
  {
    id: 'word-benevolent',
    term: 'Benevolent',
    category: 'word',
    badge: 'B2 · Adjective',
    ipa: '/bəˈnev.əl.ənt/',
    azTranslation: 'Xeyirxah, nəcib',
    definition: 'Well-meaning, kindly, and disposed to charitable deeds.',
    exampleEn:
      'A benevolent benefactor anonymously endowed the collegiate library.',
    exampleAz:
      'Xeyirxah bir himayədar anonim şəkildə kollec kitabxanasına ianə bağışladı.',
    etymologyNote: 'Latin: bene (well) + velle (to wish).',
    addedAt: 1730000006000,
    masteredCount: 1,
  },
  {
    id: 'pv-bring-about',
    term: 'Bring about',
    category: 'phrasal',
    badge: 'Phrasal Verb',
    ipa: '/brɪŋ əˈbaʊt/',
    azTranslation: 'Səbəb olmaq, meydana gətirmək',
    definition: 'To cause an important change or event to happen.',
    exampleEn:
      'The peaceful treaty helped bring about an era of unprecedented prosperity.',
    exampleAz:
      'Sülh müqaviləsi misli görünməmiş rifah dövrünün meydana gəlməsinə kömək etdi.',
    etymologyNote: 'High-register causative phrasal verb.',
    addedAt: 1730000007000,
    masteredCount: 0,
  },
];
