import type { TripCoords } from '../types/trip-plan.ts'

export type MapPoiKind =
  | 'airport'
  | 'park'
  | 'port'
  | 'island'
  | 'beach'
  | 'villa'
  | 'hotel'
  | 'city'
  | 'other'

export interface PlaceCatalogEntry {
  canonicalKey: string
  nameHe: string
  blurb: string
  linkUrl: string
  linkLabel: string
  kind: MapPoiKind
  emoji: string
  coords: TripCoords
}

/**
 * Public, stable blurbs + real lat/lon for well-known stops across trips.
 * Not family itinerary data — safe to ship in the map chunk.
 * Unknown places fall back to event text + Google Maps.
 */
export const PLACE_CATALOG: PlaceCatalogEntry[] = [
  {
    canonicalKey: 'magic kingdom, walt disney world',
    nameHe: 'Magic Kingdom',
    blurb:
      'פארק הדגל של וולט דיסני וורלד באורלנדו — הטירה, מצעד ורכבות קלאסיות. לילדים קטנים עדיף להתחיל מוקדם ב-Fantasyland (Dumbo, Small World, Peter Pan) ולצאת אחה״צ לפני שהקהל מתעייף.',
    linkUrl: 'https://disneyworld.disney.go.com/destinations/magic-kingdom/',
    linkLabel: 'אתר דיסני הרשמי',
    kind: 'park',
    emoji: '🏰',
    coords: { lat: 28.4177, lon: -81.5812 },
  },
  {
    canonicalKey: "disney's animal kingdom",
    nameHe: 'Animal Kingdom',
    blurb:
      'פארק הטבע של דיסני — ספארי, חיות ומופעים. Kilimanjaro Safaris שווה תור מוקדם בבוקר; ליד Discovery Island יש אזורים רגועים לגילאי 3–5. כרטיסים נפרדים מ-Magic Kingdom.',
    linkUrl: 'https://disneyworld.disney.go.com/destinations/animal-kingdom/',
    linkLabel: 'אתר דיסני הרשמי',
    kind: 'park',
    emoji: '🦁',
    coords: { lat: 28.3575, lon: -81.59 },
  },
  {
    canonicalKey: 'port canaveral, florida',
    nameHe: 'פורט קנוורל',
    blurb:
      'נמל השיט של כייפ קנוורל, משם יוצאת Utopia of the Seas. מהווילה בדאוונפורט הנסיעה כשעה. כאן עולים ויורדים מהאונייה — מזוודות, ביקורת וחנייה לפי הנחיות רויאל קריביאן.',
    linkUrl: 'https://www.portcanaveral.com/',
    linkLabel: 'אתר הנמל',
    kind: 'port',
    emoji: '🚢',
    coords: { lat: 28.4106, lon: -80.6328 },
  },
  {
    canonicalKey: 'perfect day at cococay',
    nameHe: 'CocoCay',
    blurb:
      'האי הפרטי של רויאל קריביאן בבהאמה — Perfect Day at CocoCay. חוף רדוד ובריכות כלולים בשיט; פארק המים בתשלום נפרד. עם ילדים קטנים החלק החינמי מספיק ליום שלם.',
    linkUrl: 'https://www.royalcaribbean.com/cruise-destinations/perfect-day-coco-cay',
    linkLabel: 'רויאל קריביאן',
    kind: 'island',
    emoji: '🏝️',
    coords: { lat: 25.8183, lon: -77.9264 },
  },
  {
    canonicalKey: 'miami beach, florida',
    nameHe: 'Miami Beach',
    blurb:
      'חוף מיאמי — טיילת, חול ואר-דקו דרום-ביץ׳. בלו״ז זה באפר אחרי הקרוז, לפני הטיסה חזרה. מתאים לערב רגוע בלי פארקים, עם אפשרות לשחות ליד המלון.',
    linkUrl: 'https://en.wikipedia.org/wiki/Miami_Beach,_Florida',
    linkLabel: 'ויקיפדיה',
    kind: 'beach',
    emoji: '🏖️',
    coords: { lat: 25.7907, lon: -80.13 },
  },
  {
    canonicalKey: 'miami international airport (mia)',
    nameHe: 'שדה התעופה מיאמי (MIA)',
    blurb:
      'נמל התעופה הבינלאומי של מיאמי — נחיתת אל על LY17 והמראת LY18. אחרי הנחיתה: ביקורת דרכונים, איסוף רכב ונסיעה לאורלנדו. ביום החזור מחזירים רכב וממריאים בצהריים.',
    linkUrl: 'https://www.miami-airport.com/',
    linkLabel: 'אתר MIA',
    kind: 'airport',
    emoji: '✈️',
    coords: { lat: 25.7959, lon: -80.287 },
  },
  {
    canonicalKey: 'solterra resort, davenport',
    nameHe: 'וילה Solterra, דאוונפורט',
    blurb:
      'וילה מועדפת בדאוונפורט, ממערב לאורלנדו — בתים עם בריכה פרטית לקבוצה. שלושה לילות לפני הקרוז, בלי פארק ביום ההגעה אחרי הנסיעה מ-MIA. וודאו תפוסה ל-12 בכתב לפני ההזמנה.',
    linkUrl: 'https://www.google.com/maps/search/?api=1&query=Solterra%20Resort%20Davenport%20Florida',
    linkLabel: 'Google Maps',
    kind: 'villa',
    emoji: '🏡',
    coords: { lat: 28.1614, lon: -81.6167 },
  },
  {
    canonicalKey: 'holiday inn miami international airport',
    nameHe: 'Holiday Inn ליד MIA',
    blurb:
      'מלון ליד שדה התעופה ללילה האחרון לפני הטיסה חזרה. צ׳ק-אין מתוכנן אחה״צ, כדי לא לצאת בבוקר המוצא ממיאמי ביץ׳ עם הילדים. קרוב להחזרת הרכב ולהמראה.',
    linkUrl: 'https://www.google.com/maps/search/?api=1&query=Holiday%20Inn%20Miami%20International%20Airport',
    linkLabel: 'Google Maps',
    kind: 'hotel',
    emoji: '🏨',
    coords: { lat: 25.8094, lon: -80.2858 },
  },
  {
    canonicalKey: 'ben gurion t3',
    nameHe: 'נתב״ג טרמינל 3',
    blurb:
      'טרמינל 3 בנתב״ג — שער היציאה והחזרה של טיסות אל על. לא חלק ממפת היעד (הוא רחוק מהאשכול), אבל מופיע בדרך המצוירת של יום הטיסה.',
    linkUrl: 'https://www.iaa.gov.il/en/airports/ben-gurion/',
    linkLabel: 'רשות שדות התעופה',
    kind: 'airport',
    emoji: '🛫',
    coords: { lat: 32.0114, lon: 34.8867 },
  },
  {
    canonicalKey: 'schiphol airport',
    nameHe: 'סכיפהול',
    blurb:
      'נמל התעופה של אמסטרדם — שער הכניסה והיציאה לטיול בהולנד. איסוף רכב אחרי הנחיתה, והחזרה לפני הטיסה הביתה.',
    linkUrl: 'https://www.schiphol.nl/',
    linkLabel: 'אתר סכיפהול',
    kind: 'airport',
    emoji: '✈️',
    coords: { lat: 52.3105, lon: 4.7683 },
  },
  {
    canonicalKey: 'efteling, kaatsheuvel',
    nameHe: 'אפטלינג',
    blurb:
      'פארק האגדות בהולנד — יער, רכבות ומופעים. מתאים ליום מלא עם ילדים; כרטיסים לעיתים כלולים בחבילת המלון ליד הפארק.',
    linkUrl: 'https://www.efteling.com/',
    linkLabel: 'אתר אפטלינג',
    kind: 'park',
    emoji: '🌳',
    coords: { lat: 51.6497, lon: 5.0497 },
  },
  {
    canonicalKey: 'safaripark beekse bergen',
    nameHe: 'Beekse Bergen',
    blurb:
      'ספארי פתוח בהולנד — חיות מהרכב, ומלון ספארי ליד האגם. יום רגוע אחרי אפטלינג, עם אפשרות גם ל-Speelland.',
    linkUrl: 'https://www.beeksebergen.nl/',
    linkLabel: 'אתר Beekse Bergen',
    kind: 'park',
    emoji: '🦁',
    coords: { lat: 51.5175, lon: 5.113 },
  },
  {
    canonicalKey: 'aeroporto di fiumicino (fco)',
    nameHe: 'פיומיצ׳ינו (FCO)',
    blurb:
      'נמל התעופה של רומא. Leonardo Express לטרמיני בערך חצי שעה; בלילה אחרי השעה האחרונה נשארת מונית בתעריף קבוע למרכז.',
    linkUrl: 'https://www.adr.it/fiumicino',
    linkLabel: 'אתר FCO',
    kind: 'airport',
    emoji: '✈️',
    coords: { lat: 41.8003, lon: 12.2389 },
  },
  {
    canonicalKey: 'charles de gaulle (cdg)',
    nameHe: 'שארל דה גול (CDG)',
    blurb:
      'נמל התעופה הראשי של פריז. טרמינלים מפוצלים — בדקו את מספר הטרמינל בכרטיס לפני היציאה מהעיר ביום החזור.',
    linkUrl: 'https://www.parisaeroport.fr/en/passengers/access/paris-charles-de-gaulle',
    linkLabel: 'אתר CDG',
    kind: 'airport',
    emoji: '✈️',
    coords: { lat: 49.0097, lon: 2.5479 },
  },
  {
    canonicalKey: 'rethymno, crete',
    nameHe: 'רתימנו, כרתים',
    blurb:
      'עיר החוף בצפון כרתים — העיר העתיקה, הטיילת, וחופים רדודים. בסיס נוח לטיול משפחתי קצר באי.',
    linkUrl: 'https://en.wikipedia.org/wiki/Rethymno',
    linkLabel: 'ויקיפדיה',
    kind: 'city',
    emoji: '🏖️',
    coords: { lat: 35.3669, lon: 24.4745 },
  },
]

const CATALOG_BY_KEY = new Map(PLACE_CATALOG.map(e => [e.canonicalKey, e]))

export function catalogEntryForKey(key: string): PlaceCatalogEntry | undefined {
  return CATALOG_BY_KEY.get(key)
}
