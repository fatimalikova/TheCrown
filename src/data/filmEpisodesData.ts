import { FilmEpisode, ReadingToken } from '../types/lexicon';

const TOK: Record<string, Omit<ReadingToken, 'text'>> = {
  giveUp: {
    lexiconId: 'pv-give-up',
    term: 'Give up',
    badge: 'Phrasal Verb · Essential',
    category: 'phrasal',
    ipa: '/ɡɪv ʌp/',
    azTranslation: 'Əl çəkmək, ümidini üzmək, təslim olmaq',
    definition:
      'To stop trying or abandon hope; to cease an endeavor or surrender.',
    exampleEn: 'You mustn’t give up hope — someday I’ll get out.',
    exampleAz: 'Ümidini üzməməlisən — bir gün buradan çıxacağam.',
    etymology: 'Separable phrasal verb: give [something] up.',
  },
  lookForwardTo: {
    lexiconId: 'pv-look-forward-to',
    term: 'Look forward to',
    badge: 'Phrasal Verb · B1',
    category: 'phrasal',
    ipa: '/lʊk ˈfɔː.wəd tuː/',
    azTranslation: 'Səbirsizliklə gözləmək',
    definition:
      'To anticipate a future encounter, event, or news with eager pleasure.',
    exampleEn:
      'We’ll get very well acquainted — I’m looking forward to it.',
    exampleAz:
      'Çox yaxşı tanış olacağıq — bunu səbirsizliklə gözləyirəm.',
    etymology: 'Three-part prepositional phrasal verb (+ noun or -ing).',
  },
  carryOut: {
    lexiconId: 'pv-carry-out',
    term: 'Carry out',
    badge: 'Phrasal Verb · IELTS',
    category: 'phrasal',
    ipa: '/ˈkær.i aʊt/',
    azTranslation: 'Həyata keçirmək, icra etmək',
    definition:
      'To perform, execute, or complete planned orders, tasks, or research.',
    exampleEn:
      'Now I suppose you’d like to carry out the balance of your orders.',
    exampleAz:
      'İndi yəqin ki, əmrlərinizin qalan hissəsini icra etmək istəyərdiniz.',
    etymology: 'Inseparable / transitive phrasal verb.',
  },
  lookInto: {
    lexiconId: 'pv-look-into',
    term: 'Look into',
    badge: 'Phrasal Verb · B1–B2',
    category: 'phrasal',
    ipa: '/lʊk ˈɪn.tuː/',
    azTranslation: 'Araşdırmaq, tədqiq etmək',
    definition:
      'To investigate, inspect, or examine the facts of a situation carefully.',
    exampleEn: 'Of course, I’ll look into it immediately.',
    exampleAz: 'Əlbəttə, dərhal bu məsələni araşdıracağam.',
    etymology: 'Inseparable prepositional verb: look into [something].',
  },
  turnOut: {
    lexiconId: 'pv-turn-out',
    term: 'Turn out',
    badge: 'Phrasal Verb · B1–B2',
    category: 'phrasal',
    ipa: '/tɜːn aʊt/',
    azTranslation: 'Nəticələnmək, sonu yaxşı bitmək, məlum olmaq',
    definition:
      'To happen or end in a particular way; to prove to be true or satisfactory.',
    exampleEn: 'I’m glad everything turned out OK.',
    exampleAz: 'Hər şeyin yaxşı nəticələndiyinə şadam.',
    etymology: 'Intransitive phrasal verb: turn out [well / OK / badly].',
  },
  inevitable: {
    lexiconId: 'word-inevitable',
    term: 'Inevitable',
    badge: 'B2 · Adjective',
    category: 'word',
    ipa: '/ɪˈnev.ɪ.tə.bəl/',
    azTranslation: 'Qaçılmaz, labüd, mütləq baş verəcək',
    definition:
      'Certain to happen; unable to be avoided or prevented by any effort.',
    exampleEn: 'Others, like myself, resign themselves to the inevitable.',
    exampleAz:
      'Mənim kimi başqaları isə qaçılmaz olanla barışırlar.',
    etymology: 'Latin: inēvītābilis (in- “not” + ēvītāre “to avoid”).',
  },
  reluctant: {
    lexiconId: 'film-word-reluctant',
    term: 'Reluctant',
    badge: 'B2 · Adjective',
    category: 'word',
    ipa: '/rɪˈlʌk.tənt/',
    azTranslation: 'İstəksiz, tərəddüdlü, könülsüz',
    definition:
      'Unwilling and hesitant; feeling doubtful about taking a certain action.',
    exampleEn:
      'Some people are rather reluctant to cast their votes.',
    exampleAz:
      'Bəzi insanlar səs verməyə xeyli tərəddüdlü yanaşırlar.',
    etymology: 'Latin: relūctārī (“to struggle against”).',
  },
  curious: {
    lexiconId: 'word-curious',
    term: 'Curious',
    badge: 'A2 · Adjective',
    category: 'word',
    ipa: '/ˈkjʊə.ri.əs/',
    azTranslation: 'Maraqlanan, hər şeyi bilmək istəyən',
    definition:
      'Eager to know, discover, or investigate something unusual or hidden.',
    exampleEn: 'Excuse me — I was curious to know who the beneficiary is.',
    exampleAz:
      'Bağışlayın — varisin kim olduğunu bilmək mənim üçün maraqlı idi.',
    etymology: 'Latin: cūriōsus (“careful, inquisitive”).',
  },
  makeUpMind: {
    lexiconId: 'idiom-make-up-mind',
    term: 'Make up your mind',
    badge: 'Idiom · Everyday',
    category: 'idiom',
    ipa: '/meɪk ʌp jʊər maɪnd/',
    azTranslation: 'Qərar vermək, qəti qərara gəlmək',
    definition:
      'To decide firmly between choices after hesitation or uncertainty.',
    exampleEn: 'You might as well make up your mind, Mama.',
    exampleAz: 'Yaxşısı budur qəti qərarını verəsən, ana.',
    etymology: '19th-century English idiom meaning to settle one’s thoughts.',
  },
  changeMind: {
    lexiconId: 'idiom-change-mind',
    term: 'Change your mind',
    badge: 'Idiom · Everyday',
    category: 'idiom',
    ipa: '/tʃeɪndʒ jʊər maɪnd/',
    azTranslation: 'Fikrini dəyişmək, qərarından dönmək',
    definition:
      'To alter a previous decision, opinion, or intention.',
    exampleEn: 'You may change your mind.',
    exampleAz: 'Fikrini dəyişə bilərsən.',
    etymology: 'Common conversational English idiom.',
  },
};

export const CLASSIC_FILM_EPISODES: FilmEpisode[] = [
  {
    id: 'clip-give-up',
    kind: 'classic',
    filmTitle: 'Detour',
    releaseYear: '1945 · Dir. Edgar G. Ulmer',
    directorNote:
      'Real 5-second noir clip — Tom Neal delivers an encouraging line using the phrasal verb “give up”.',
    episodeTitle: '“You mustn’t give up hope”',
    sceneTag: 'Phrasal Verb · 5.5s',
    targetTerm: 'Give up',
    targetCategory: 'phrasal',
    durationSec: 5.5,
    aspectRatio: '16:9',
    videoUrl: '/clips/clip-give-up.mp4',
    createdAt: 1730001000000,
    cues: [
      {
        id: 'detour-1',
        startSec: 0,
        endSec: 5.5,
        speaker: 'Al Roberts (Tom Neal)',
        tokens: [
          { text: '...it would be better down, but you mustn’t ' },
          { text: 'give up', ...TOK.giveUp },
          { text: ' hope — someday, yes, someday...' },
        ],
        azSubtitle:
          '...amma ümidini üzməməlisən (əl çəkməməlisən) — bir gün, bəli, bir gün...',
      },
    ],
  },
  {
    id: 'clip-look-forward-to',
    kind: 'classic',
    filmTitle: 'Please Murder Me',
    releaseYear: '1956 · Angela Lansbury & Raymond Burr',
    directorNote:
      'Real 5.5-second Hollywood courtroom thriller clip featuring “look forward to”.',
    episodeTitle: '“I’m looking forward to it”',
    sceneTag: 'Phrasal Verb · 5.5s',
    targetTerm: 'Look forward to',
    targetCategory: 'phrasal',
    durationSec: 5.5,
    aspectRatio: '16:9',
    videoUrl: '/clips/clip-look-forward-to.mp4',
    createdAt: 1730000900000,
    cues: [
      {
        id: 'pmm-1',
        startSec: 0,
        endSec: 5.5,
        speaker: 'Craig Carlson (Raymond Burr)',
        tokens: [
          { text: '...we’ll get very well acquainted — I’m ' },
          { text: 'looking forward to', ...TOK.lookForwardTo },
          { text: ' it, Myra.' },
        ],
        azSubtitle:
          '...çox yaxşı tanış olacağıq — bunu səbirsizliklə gözləyirəm, Mayra.',
      },
    ],
  },
  {
    id: 'clip-carry-out',
    kind: 'classic',
    filmTitle: 'Jail Bait',
    releaseYear: '1954 · Classic Noir',
    directorNote:
      'Real 5-second suspense film clip demonstrating the IELTS-staple phrasal verb “carry out”.',
    episodeTitle: '“Carry out the balance of your orders”',
    sceneTag: 'Phrasal Verb · 5.0s',
    targetTerm: 'Carry out',
    targetCategory: 'phrasal',
    durationSec: 5.0,
    aspectRatio: '16:9',
    videoUrl: '/clips/clip-carry-out.mp4',
    createdAt: 1730000800000,
    cues: [
      {
        id: 'jb-1',
        startSec: 0,
        endSec: 5.0,
        speaker: 'Dr. Boris Gregor',
        tokens: [
          { text: 'Now I suppose you’d like to ' },
          { text: 'carry out', ...TOK.carryOut },
          { text: ' the balance of your orders.' },
        ],
        azSubtitle:
          'İndi yəqin ki, əmrlərinizin qalan hissəsini həyata keçirmək istəyərdiniz.',
      },
    ],
  },
  {
    id: 'clip-look-into',
    kind: 'classic',
    filmTitle: 'The City of the Dead',
    releaseYear: '1960 · Christopher Lee',
    directorNote:
      'Real 4.5-second British mystery scene featuring “look into” (investigate).',
    episodeTitle: '“Of course, I’ll look into it immediately”',
    sceneTag: 'Phrasal Verb · 4.5s',
    targetTerm: 'Look into',
    targetCategory: 'phrasal',
    durationSec: 4.5,
    aspectRatio: '16:9',
    videoUrl: '/clips/clip-look-into.mp4',
    createdAt: 1730000700000,
    cues: [
      {
        id: 'hh-1',
        startSec: 0,
        endSec: 4.5,
        speaker: 'Innkeeper',
        tokens: [
          { text: 'Of course — I’ll ' },
          { text: 'look into', ...TOK.lookInto },
          { text: ' it immediately.' },
        ],
        azSubtitle:
          'Əlbəttə — dərhal bu məsələni araşdıracağam.',
      },
    ],
  },
  {
    id: 'clip-turn-out',
    kind: 'classic',
    filmTitle: 'Please Murder Me',
    releaseYear: '1956 · Raymond Burr & Angela Lansbury',
    directorNote:
      'Real 5-second dialogue clip demonstrating “turn out” in natural conversation.',
    episodeTitle: '“Everything turned out OK”',
    sceneTag: 'Phrasal Verb · 5.0s',
    targetTerm: 'Turn out',
    targetCategory: 'phrasal',
    durationSec: 5.0,
    aspectRatio: '16:9',
    videoUrl: '/clips/clip-turn-out.mp4',
    createdAt: 1730000600000,
    cues: [
      {
        id: 'pmm-2',
        startSec: 0,
        endSec: 5.0,
        speaker: 'Myra Leeds (Angela Lansbury)',
        tokens: [
          { text: 'Everything ' },
          { text: 'turned out', ...TOK.turnOut },
          { text: ' OK — thank you, both.' },
        ],
        azSubtitle:
          'Hər şey yaxşı nəticələndi — hər ikinizə təşəkkür edirəm.',
      },
    ],
  },
  {
    id: 'clip-inevitable',
    kind: 'classic',
    filmTitle: 'In Which We Serve',
    releaseYear: '1942 · Dir. David Lean & Noël Coward',
    directorNote:
      'Real 5.5-second Academy-honored British drama clip using the B2–C1 adjective “inevitable”.',
    episodeTitle: '“Resign themselves to the inevitable”',
    sceneTag: 'Word · B2 · 5.5s',
    targetTerm: 'Inevitable',
    targetCategory: 'word',
    durationSec: 5.5,
    aspectRatio: '16:9',
    videoUrl: '/clips/clip-inevitable.mp4',
    createdAt: 1730000500000,
    cues: [
      {
        id: 'iwws-1',
        startSec: 0,
        endSec: 5.5,
        speaker: 'Capt. Kinross (Noël Coward)',
        tokens: [
          { text: 'Others, like myself, resign themselves to the ' },
          { text: 'inevitable', ...TOK.inevitable },
          { text: '.' },
        ],
        azSubtitle:
          'Mənim kimi başqaları isə qaçılmaz olanla barışırlar.',
      },
    ],
  },
  {
    id: 'clip-reluctant',
    kind: 'classic',
    filmTitle: 'Angel on My Shoulder',
    releaseYear: '1946 · Paul Muni & Claude Rains',
    directorNote:
      'Real 5-second classic fantasy-drama clip with Claude Rains speaking “reluctant”.',
    episodeTitle: '“Rather reluctant to cast their votes”',
    sceneTag: 'Word · B2 · 5.0s',
    targetTerm: 'Reluctant',
    targetCategory: 'word',
    durationSec: 5.0,
    aspectRatio: '16:9',
    videoUrl: '/clips/clip-reluctant.mp4',
    createdAt: 1730000400000,
    cues: [
      {
        id: 'aoms-1',
        startSec: 0,
        endSec: 5.0,
        speaker: 'Nick (Claude Rains)',
        tokens: [
          { text: 'Some people are rather ' },
          { text: 'reluctant', ...TOK.reluctant },
          { text: ' to cast their votes for lunatics.' },
        ],
        azSubtitle:
          'Bəzi insanlar ağılsızlara səs verməyə xeyli tərəddüdlü (könülsüz) yanaşırlar.',
      },
    ],
  },
  {
    id: 'clip-curious',
    kind: 'classic',
    filmTitle: 'His Girl Friday',
    releaseYear: '1940 · Cary Grant & Rosalind Russell',
    directorNote:
      'Real 5-second Howard Hawks screwball comedy clip showcasing “curious”.',
    episodeTitle: '“Excuse me, I was curious...”',
    sceneTag: 'Word · A2 · 5.0s',
    targetTerm: 'Curious',
    targetCategory: 'word',
    durationSec: 5.0,
    aspectRatio: '16:9',
    videoUrl: '/clips/clip-curious.mp4',
    createdAt: 1730000300000,
    cues: [
      {
        id: 'hgf-1',
        startSec: 0,
        endSec: 5.0,
        speaker: 'Walter Burns (Cary Grant)',
        tokens: [
          { text: 'Excuse me, excuse me — I was ' },
          { text: 'curious', ...TOK.curious },
          { text: ' about your desk.' },
        ],
        azSubtitle:
          'Bağışlayın, bağışlayın — masanız mənim üçün çox maraqlı idi.',
      },
    ],
  },
  {
    id: 'clip-make-up-mind',
    kind: 'classic',
    filmTitle: 'Beneath the 12-Mile Reef',
    releaseYear: '1953 · Robert Wagner & Gilbert Roland',
    directorNote:
      'Real 4.5-second Technicolor adventure film clip using the idiom “make up your mind”.',
    episodeTitle: '“Might as well make up your mind”',
    sceneTag: 'Idiom · 4.5s',
    targetTerm: 'Make up your mind',
    targetCategory: 'idiom',
    durationSec: 4.5,
    aspectRatio: '16:9',
    videoUrl: '/clips/clip-make-up-mind.mp4',
    createdAt: 1730000200000,
    cues: [
      {
        id: 'reef-1',
        startSec: 0,
        endSec: 4.5,
        speaker: 'Tony Petrakis (Robert Wagner)',
        tokens: [
          { text: 'You might as well ' },
          { text: 'make up your mind', ...TOK.makeUpMind },
          { text: ', Mama.' },
        ],
        azSubtitle:
          'Yaxşısı budur qəti qərarını verəsən, ana.',
      },
    ],
  },
  {
    id: 'clip-change-mind',
    kind: 'classic',
    filmTitle: 'White Zombie',
    releaseYear: '1932 · Bela Lugosi',
    directorNote:
      'Real 4.5-second classic horror cinema clip where Bela Lugosi delivers “change your mind”.',
    episodeTitle: '“You may change your mind”',
    sceneTag: 'Idiom · 4.5s',
    targetTerm: 'Change your mind',
    targetCategory: 'idiom',
    durationSec: 4.5,
    aspectRatio: '16:9',
    videoUrl: '/clips/clip-change-mind.mp4',
    createdAt: 1730000100000,
    cues: [
      {
        id: 'wz-1',
        startSec: 0,
        endSec: 4.5,
        speaker: 'Murder Legendre (Bela Lugosi)',
        tokens: [
          { text: 'You may ' },
          { text: 'change your mind', ...TOK.changeMind },
          { text: '.' },
        ],
        azSubtitle: 'Fikrini dəyişə bilərsən.',
      },
    ],
  },
];
