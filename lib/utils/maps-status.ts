let mapsAvailable = true

export function setMapsAvailable(available: boolean) {
  mapsAvailable = available
}

export function isMapsAvailable(): boolean {
  return mapsAvailable
}
