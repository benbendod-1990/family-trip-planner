export function wazeUrl(address: string): string {
  return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`
}

export function googleMapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}
