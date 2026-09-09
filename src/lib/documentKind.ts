// What kind of travel document this is, so the list can group and icon it.
//
// Kept free of runtime imports: the app reaches it through tripDocuments, and
// scripts/pull-documents.ts imports it straight from Node. It used to live in
// tripDocuments.ts, which pulls in the Supabase client and so can't be loaded
// outside the browser — the script had to carry a second copy, and the two had
// already drifted apart within a day.

import type { TripDocument } from '@/types/trip-plan'

export function classifyDocument(
  subject: string,
  from: string,
  filename: string,
): TripDocument['kind'] {
  const hay = `${subject} ${from} ${filename}`.toLowerCase()
  if (/flight|airline|airways|e-?ticket|boarding|pnr|aegean|skyexpress|easyjet|elal|el.al|טיסה|כרטיס/.test(hay)) return 'flight'
  // Venue operators bill under a parent company the guest never sees — Beekse
  // Bergen's confirmations come from libemafunfactory.nl — so the operator
  // names have to be here alongside the obvious hotel words.
  if (/hotel|resort|booking\.com|airbnb|guesthouse|beeksebergen|beekse bergen|libema|bungalow|camping|stay|lodging|cruise|royal.?caribbean|utopia|מלון|לינה|אירוח|קרוז/.test(hay)) return 'hotel'
  if (/car|rental|hertz|avis|europcar|sixt|budget|רכב|השכרת/.test(hay)) return 'car'
  if (/ticket|efteling|toverland|museum|tour|getyourguide|tiqets|כרטיסים|כניסה/.test(hay)) return 'activity'
  return 'other'
}
