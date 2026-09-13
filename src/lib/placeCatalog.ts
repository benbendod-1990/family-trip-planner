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
      'פארק הטבע של דיסני — ספארי, חיות ומופעים. לא בלו״ז הנוכחי (Epcot במקומו); נשאר בקטלוג אם מחזירים את היום.',
    linkUrl: 'https://disneyworld.disney.go.com/destinations/animal-kingdom/',
    linkLabel: 'אתר דיסני הרשמי',
    kind: 'park',
    emoji: '🦁',
    coords: { lat: 28.3575, lon: -81.59 },
  },
  {
    canonicalKey: 'epcot, walt disney world',
    nameHe: 'Epcot',
    blurb:
      'Spaceship Earth, World Showcase, ומתקנים רגועים לילדים (Frozen, Remy, Journey of Water). בלו״ז הזה מחליף את Animal Kingdom ב-21.3 — יום מלא לפני העלייה לקרוז.',
    linkUrl: 'https://disneyworld.disney.go.com/destinations/epcot/',
    linkLabel: 'אתר דיסני הרשמי',
    kind: 'park',
    emoji: '🌐',
    coords: { lat: 28.3747, lon: -81.5494 },
  },
  {
    canonicalKey: 'disney springs, walt disney world',
    nameHe: 'Disney Springs',
    blurb:
      'מתחם הקניות והאוכל של דיסני — בלי כרטיס פארק. בלו״ז: צהריים אחרי הירידה מהאונייה, וערב אפשרי ב-The Boathouse.',
    linkUrl: 'https://www.disneysprings.com/',
    linkLabel: 'Disney Springs',
    kind: 'city',
    emoji: '🛍️',
    coords: { lat: 28.3702, lon: -81.5192 },
  },
  {
    canonicalKey: 'seaworld orlando',
    nameHe: 'SeaWorld',
    blurb:
      'SeaWorld אורלנדו — Sesame Street Land לפעוטות, מופעי דולפינים ואריות ים. כרטיס נפרד מדיסני. בלו״ז ב-27.3 אחרי החזרה מהקרוז.',
    linkUrl: 'https://seaworld.com/orlando/',
    linkLabel: 'אתר SeaWorld',
    kind: 'park',
    emoji: '🐋',
    coords: { lat: 28.4113, lon: -81.4618 },
  },
  {
    canonicalKey: 'peppa pig theme park, florida',
    nameHe: 'Peppa Pig',
    blurb:
      'פארק קטן ליד לגולנד, מותאם לגילאי 1–5 — שלוליות, רכבת הרים עדינה ודמויות. כ־45 דק׳ מהווילה בדאוונפורט.',
    linkUrl: 'https://www.peppapigthemepark.com/florida/',
    linkLabel: 'אתר Peppa Pig',
    kind: 'park',
    emoji: '🐷',
    coords: { lat: 28.1892, lon: -81.6908 },
  },
  {
    canonicalKey: 'gatorland, orlando',
    nameHe: 'Gatorland',
    blurb:
      'פארק תנינים ותיק מדרום לאורלנדו — רכבת קטנה, האכלת בעלי חיים, וביקור קצר של 2–3 שעות. מתאים לבוקר רגוע לפני אריזה.',
    linkUrl: 'https://gatorland.com/',
    linkLabel: 'אתר Gatorland',
    kind: 'park',
    emoji: '🐊',
    coords: { lat: 28.3556, lon: -81.4033 },
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
      'חוף מיאמי — טיילת ואר-דקו. לא בלו״ז הנוכחי: אחרי הקרוז חוזרים לאורלנדו, לא לימי חוף כאן.',
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
      'וילה מועדפת בדאוונפורט, ממערב לאורלנדו — בתים עם בריכה פרטית לקבוצה. שלושה לילות לפני הקרוז, ושוב אחרי הירידה (26.3–1.4). בלי פארק ביום ההגעה מ-MIA. וודאו תפוסה ל-12 בכתב.',
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
      'מלון ליד השדה — אופציה רק אם לא יוצאים מאורלנדו ב-04:30 ב-1.4. ברירת המחדל בלו״ז: שינה בווילה באורלנדו ב-31.3.',
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
