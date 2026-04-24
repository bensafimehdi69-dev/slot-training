"use client"

import { useEffect, useRef, useState } from "react"
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMapsLibrary,
  useMap,
} from "@vis.gl/react-google-maps"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, MapPin } from "lucide-react"
import type { AddressWithCoords } from "@/lib/types/address"

interface AddressAutocompleteMapProps {
  label: string
  value: AddressWithCoords | null
  onChange: (address: AddressWithCoords | null) => void
  required?: boolean
}

/**
 * Address picker with live autocomplete + map preview.
 *
 * We avoid both broken Google widgets:
 *  - `google.maps.places.Autocomplete` (legacy) is disabled for new
 *    customers post-March 2025: suggestions render but `place_changed`
 *    never fires.
 *  - `PlaceAutocompleteElement` (new Web Component) throws
 *    `PLACES_GET_PLACE: NOT_FOUND` on `fetchFields`.
 *
 * Instead we call the programmatic Places API (New)
 * `AutocompleteSuggestion.fetchAutocompleteSuggestions` to get live
 * suggestions, render our own shadcn-styled dropdown, then resolve the
 * chosen suggestion to lat/lng via the Geocoding API (known working).
 * Session tokens pair the autocomplete + resolution calls so Google
 * bills them as one request.
 */
export function AddressAutocompleteMap({
  label,
  value,
  onChange,
  required,
}: AddressAutocompleteMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""

  return (
    <APIProvider apiKey={apiKey}>
      <AutocompletePicker
        label={label}
        value={value}
        onChange={onChange}
        required={required}
      />
    </APIProvider>
  )
}

interface Suggestion {
  placeId: string
  mainText: string
  secondaryText: string
  fullText: string
}

function AutocompletePicker({
  label,
  value,
  onChange,
  required,
}: AddressAutocompleteMapProps) {
  const places = useMapsLibrary("places")
  const geocoding = useMapsLibrary("geocoding")
  const [inputValue, setInputValue] = useState(value?.formatted || "")
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionTokenRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync input when value changes externally.
  useEffect(() => {
    setInputValue(value?.formatted || "")
  }, [value?.formatted])

  // Close dropdown when clicking outside.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // Debounced fetch of suggestions as the user types.
  useEffect(() => {
    if (!places) return
    const query = inputValue.trim()
    if (!query || query === value?.formatted) {
      setSuggestions([])
      return
    }

    const timer = setTimeout(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { AutocompleteSessionToken, AutocompleteSuggestion } = places as any
        if (!AutocompleteSessionToken || !AutocompleteSuggestion) {
          setError("API Places (New) indisponible. Vérifiez la configuration.")
          return
        }
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new AutocompleteSessionToken()
        }
        const { suggestions: results } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          sessionToken: sessionTokenRef.current,
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapped: Suggestion[] = (results || []).map((s: any) => {
          const p = s.placePrediction
          return {
            placeId: p?.placeId ?? "",
            mainText: p?.mainText?.text ?? p?.text?.text ?? "",
            secondaryText: p?.secondaryText?.text ?? "",
            fullText: p?.text?.text ?? "",
          }
        })
        setSuggestions(mapped)
        setShowDropdown(mapped.length > 0)
        setError(null)
      } catch (err) {
        console.error("[Address] autocomplete failed:", err instanceof Error ? err.message : "unknown")
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [places, inputValue, value?.formatted])

  const resolveSuggestion = async (suggestion: Suggestion) => {
    if (!geocoding) return
    setResolving(true)
    setError(null)
    setShowDropdown(false)
    try {
      const geocoder = new geocoding.Geocoder()
      const response = await geocoder.geocode({ address: suggestion.fullText })
      const first = response.results?.[0]
      if (!first?.geometry?.location) {
        setError("Impossible de localiser cette adresse.")
        return
      }
      const lat = first.geometry.location.lat()
      const lng = first.geometry.location.lng()
      const formatted = first.formatted_address || suggestion.fullText
      setInputValue(formatted)
      onChange({ formatted, lat, lng })
      // A new session starts after each confirmed selection (Google billing convention).
      sessionTokenRef.current = null
    } catch (err) {
      console.error("[Address] geocoding failed:", err instanceof Error ? err.message : "unknown")
      setError("Erreur lors de la localisation. Réessayez.")
    } finally {
      setResolving(false)
    }
  }

  const handleInputChange = (next: string) => {
    setInputValue(next)
    setError(null)
    if (value && next !== value.formatted) {
      // Invalidate the confirmed address if the user starts editing.
      onChange(null)
    }
  }

  return (
    <div className="space-y-3">
      <Label htmlFor="address-input">
        {label}
        {required && " *"}
      </Label>

      <div ref={containerRef} className="relative">
        <div className="relative">
          <Input
            id="address-input"
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
            placeholder="Ex: Stade King Abdullah, Jeddah"
            disabled={resolving}
            autoComplete="off"
          />
          {resolving && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>

        {showDropdown && suggestions.length > 0 && (
          <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
            {suggestions.map((s) => (
              <button
                key={s.placeId || s.fullText}
                type="button"
                onClick={() => resolveSuggestion(s)}
                className="flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.mainText || s.fullText}</p>
                  {s.secondaryText && (
                    <p className="truncate text-xs text-muted-foreground">{s.secondaryText}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <MapPreview value={value} onChange={onChange} />

      {value && (
        <p className="text-xs text-muted-foreground">
          Astuce : déplacez le marqueur ou cliquez sur la carte pour ajuster la position si l&apos;adresse n&apos;est pas exacte.
        </p>
      )}
    </div>
  )
}

interface MapPreviewProps {
  value: AddressWithCoords | null
  onChange: (address: AddressWithCoords | null) => void
}

function MapPreview({ value, onChange }: MapPreviewProps) {
  const map = useMap()
  const geocoding = useMapsLibrary("geocoding")
  const hasLocation = value !== null && value.lat !== 0

  useEffect(() => {
    if (map && hasLocation) {
      map.panTo({ lat: value!.lat, lng: value!.lng })
      map.setZoom(15)
    }
  }, [map, value, hasLocation])

  // Reverse-geocode a manual marker move / click so the address text stays in
  // sync with the pin. If geocoding fails (network, quota), fall back to raw
  // coords so the form remains submittable.
  async function setFromCoords(lat: number, lng: number) {
    if (!geocoding) return
    try {
      const geocoder = new geocoding.Geocoder()
      const response = await geocoder.geocode({ location: { lat, lng } })
      const first = response.results?.[0]
      const formatted = first?.formatted_address ?? `${lat.toFixed(6)}, ${lng.toFixed(6)}`
      onChange({ formatted, lat, lng })
    } catch {
      onChange({ formatted: `${lat.toFixed(6)}, ${lng.toFixed(6)}`, lat, lng })
    }
  }

  return (
    <div className="h-[240px] w-full overflow-hidden rounded-lg border">
      <Map
        defaultCenter={hasLocation ? { lat: value!.lat, lng: value!.lng } : { lat: 24.7136, lng: 46.6753 }}
        defaultZoom={hasLocation ? 15 : 5}
        mapId="slot-training-map"
        gestureHandling="greedy"
        zoomControl
        clickableIcons={false}
        onClick={(event) => {
          const latLng = event.detail.latLng
          if (latLng) setFromCoords(latLng.lat, latLng.lng)
        }}
      >
        {hasLocation && (
          <AdvancedMarker
            position={{ lat: value!.lat, lng: value!.lng }}
            draggable
            onDragEnd={(event) => {
              const lat = event.latLng?.lat()
              const lng = event.latLng?.lng()
              if (lat != null && lng != null) setFromCoords(lat, lng)
            }}
          />
        )}
      </Map>
    </div>
  )
}
