"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMapsLibrary,
  useMap,
  type MapMouseEvent,
} from "@vis.gl/react-google-maps"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { AddressWithCoords } from "@/lib/types/address"

interface AddressAutocompleteMapProps {
  label: string
  value: AddressWithCoords | null
  onChange: (address: AddressWithCoords | null) => void
  required?: boolean
}

export function AddressAutocompleteMap({
  label,
  value,
  onChange,
  required,
}: AddressAutocompleteMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""

  return (
    <APIProvider apiKey={apiKey}>
      <div className="space-y-3">
        <Label>
          {label}
          {required && " *"}
        </Label>
        <PlacesAutocompleteInput value={value} onChange={onChange} />
        <MapWithClick value={value} onChange={onChange} />
      </div>
    </APIProvider>
  )
}

function MapWithClick({
  value,
  onChange,
}: {
  value: AddressWithCoords | null
  onChange: (address: AddressWithCoords | null) => void
}) {
  const geocoding = useMapsLibrary("geocoding")
  const map = useMap()

  const defaultCenter = value && value.lat !== 0
    ? { lat: value.lat, lng: value.lng }
    : { lat: 24.7136, lng: 46.6753 } // Default to Saudi Arabia

  const handleMapClick = useCallback(
    (e: MapMouseEvent) => {
      const detail = e.detail
      if (!detail.latLng) return
      const lat = detail.latLng.lat
      const lng = detail.latLng.lng

      // Reverse geocode to get address
      if (geocoding) {
        const geocoder = new geocoding.Geocoder()
        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
          if (status === "OK" && results && results[0]) {
            onChange({
              formatted: results[0].formatted_address,
              lat,
              lng,
            })
          } else {
            onChange({
              formatted: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
              lat,
              lng,
            })
          }
        })
      } else {
        onChange({
          formatted: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          lat,
          lng,
        })
      }
    },
    [geocoding, onChange]
  )

  // Re-center map when value changes
  useEffect(() => {
    if (map && value && value.lat !== 0) {
      map.panTo({ lat: value.lat, lng: value.lng })
    }
  }, [map, value])

  return (
    <div className="h-[240px] w-full overflow-hidden rounded-lg border">
      <Map
        defaultCenter={defaultCenter}
        defaultZoom={value && value.lat !== 0 ? 15 : 5}
        mapId="slot-training-map"
        gestureHandling="cooperative"
        disableDefaultUI
        onClick={handleMapClick}
      >
        {value && value.lat !== 0 && (
          <AdvancedMarker
            position={{ lat: value.lat, lng: value.lng }}
            draggable
            onDragEnd={(e: google.maps.MapMouseEvent) => {
              if (!e.latLng) return
              const lat = e.latLng.lat()
              const lng = e.latLng.lng()

              if (geocoding) {
                const geocoder = new geocoding.Geocoder()
                geocoder.geocode({ location: { lat, lng } }, (results, status) => {
                  if (status === "OK" && results && results[0]) {
                    onChange({
                      formatted: results[0].formatted_address,
                      lat,
                      lng,
                    })
                  } else {
                    onChange({ ...value, lat, lng })
                  }
                })
              } else {
                onChange({ ...value, lat, lng })
              }
            }}
          />
        )}
      </Map>
    </div>
  )
}

function PlacesAutocompleteInput({
  value,
  onChange,
}: {
  value: AddressWithCoords | null
  onChange: (address: AddressWithCoords | null) => void
}) {
  const [inputValue, setInputValue] = useState(value?.formatted || "")
  const inputRef = useRef<HTMLInputElement>(null)
  const places = useMapsLibrary("places")
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)

  // Sync input when value changes externally (map click, drag)
  useEffect(() => {
    if (value?.formatted && value.formatted !== inputValue) {
      setInputValue(value.formatted)
    }
  }, [value?.formatted]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!places || !inputRef.current) return

    const autocomplete = new places.Autocomplete(inputRef.current, {
      fields: ["formatted_address", "geometry", "name"],
    })

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace()
      if (place.geometry?.location) {
        const displayName = place.name && place.formatted_address && !place.formatted_address.startsWith(place.name)
          ? `${place.name}, ${place.formatted_address}`
          : place.formatted_address || place.name || ""
        const newAddress: AddressWithCoords = {
          formatted: displayName,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        }
        setInputValue(newAddress.formatted)
        onChange(newAddress)
      }
    })

    autocompleteRef.current = autocomplete

    return () => {
      google.maps.event.clearInstanceListeners(autocomplete)
    }
  }, [places, onChange])

  return (
    <Input
      ref={inputRef}
      value={inputValue}
      onChange={(e) => setInputValue(e.target.value)}
      placeholder="Rechercher une adresse..."
    />
  )
}
