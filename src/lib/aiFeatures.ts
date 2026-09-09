/**
 * In-app AI product UI is off (chat, itinerary builder, settings, smart import).
 * Gmail email-parse fallback (`parseDocument`) and Google-Doc pull stay enabled.
 * Worker Gemini routes are intentionally left in place.
 */
export const AI_PRODUCT_UI_ENABLED: boolean = false

export function assertProductAiEnabled(): void {
  if (!AI_PRODUCT_UI_ENABLED) {
    throw new Error('In-app AI product features are disabled')
  }
}
