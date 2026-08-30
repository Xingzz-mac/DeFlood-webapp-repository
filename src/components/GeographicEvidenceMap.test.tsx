import { useState } from 'react'
import { act, create, type ReactTestRendererJSON } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GEO_TIMEOUT_MS } from '../services/config'
import type { FloodMapViewModel } from './floodMapData'
import GeographicEvidenceMap, { type MapDeviceLocation } from './GeographicEvidenceMap'
import { FLOOD_MAP_ZOOM } from './floodMapConfig'

const leaflet = vi.hoisted(() => ({
  flyTo: vi.fn(),
  setView: vi.fn(),
  getZoom: vi.fn(() => 12),
}))

vi.mock('react-leaflet', async () => {
  const React = await import('react')
  const component = (type: string) => ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) => (
    React.createElement(type, props, children)
  )
  return {
    Circle: component('map-circle'),
    CircleMarker: component('map-circle-marker'),
    MapContainer: component('map-container'),
    Polyline: component('map-polyline'),
    Popup: component('map-popup'),
    TileLayer: component('map-tile-layer'),
    Tooltip: component('map-tooltip'),
    useMap: () => leaflet,
  }
})

const model: FloodMapViewModel = {
  hasSavedCoordinate: true,
  center: { latitude: 16.5, longitude: 95 },
  communityPoint: {
    coordinate: { latitude: 16.5, longitude: 95 },
    label: 'Assessment location',
  },
  riverPoint: null,
  evidenceLine: null,
  searchRadiusKm: 15,
  riverUnavailableMessage: 'No representative GloFAS river point was found within the nearby search radius.',
  presentation: { mode: 'LIMITED', label: 'LIMITED FLOOD ASSESSMENT' },
  hazardScore: null,
  confidenceScore: 40,
  rainfallSeverity: 50,
  usableWeatherModels: 4,
  totalWeatherModels: 4,
  agreementLabel: 'Strong',
  currentDischarge: null,
  dischargeUnit: 'm³/s',
  riverTrend: 'Unavailable',
  riverPercentile: null,
}

const layers = {
  community: true,
  riverPoint: true,
  searchRadius: true,
  evidenceLine: true,
}

function pageText(node: ReactTestRendererJSON | ReactTestRendererJSON[] | string | null): string {
  if (node === null) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(pageText).join(' ')
  return (node.children ?? []).map(child => typeof child === 'string' ? child : pageText(child)).join(' ')
}

function position(latitude = 17.01, longitude = 96.11, accuracy = 14): GeolocationPosition {
  return {
    coords: {
      latitude,
      longitude,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp: Date.now(),
    toJSON: () => ({}),
  }
}

function locationError(code: number): GeolocationPositionError {
  return {
    code,
    message: 'Test location error',
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  }
}

describe('Flood Map device-location controls', () => {
  const originalGeolocation = globalThis.navigator.geolocation

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    leaflet.flyTo.mockReset()
    leaflet.setView.mockReset()
  })

  afterEach(() => {
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      value: originalGeolocation,
      configurable: true,
    })
  })

  it('requests fresh device GPS, recenters smoothly, and renders a distinct temporary marker', async () => {
    let success: PositionCallback | null = null
    const getCurrentPosition = vi.fn((
      callback: PositionCallback,
      _error?: PositionErrorCallback | null,
      _options?: PositionOptions,
    ) => {
      success = callback
    })
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true,
    })
    const onDeviceLocationChange = vi.fn()

    function Harness() {
      const [deviceLocation, setDeviceLocation] = useState<MapDeviceLocation | null>(null)
      return (
        <GeographicEvidenceMap
          model={model}
          communityName="Saved assessment community"
          locationSource="manual"
          layers={layers}
          deviceLocation={deviceLocation}
          onDeviceLocationChange={location => {
            onDeviceLocationChange(location)
            setDeviceLocation(location)
          }}
        />
      )
    }

    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(<Harness />)
    })
    const myLocation = renderer!.root.findByProps({
      'aria-label': 'Center map on my current device location',
    })
    await act(async () => myLocation.props.onClick())

    expect(getCurrentPosition.mock.calls[0]?.[2]).toEqual({
      enableHighAccuracy: true,
      timeout: GEO_TIMEOUT_MS,
      maximumAge: 0,
    })
    await act(async () => success!(position()))

    expect(onDeviceLocationChange).toHaveBeenCalledWith({
      coordinate: { latitude: 17.01, longitude: 96.11 },
      accuracy: 14,
    })
    expect(leaflet.flyTo).toHaveBeenCalledWith(
      [17.01, 96.11],
      FLOOD_MAP_ZOOM,
      { animate: true, duration: 0.75 },
    )
    const markers = renderer!.root.findAll(node => String(node.type) === 'map-circle-marker')
    expect(markers.map(marker => marker.props.center)).toEqual([
      [16.5, 95],
      [17.01, 96.11],
    ])
    expect(markers.map(marker => marker.props.pathOptions.fillColor)).toEqual(['#1e3a5f', '#2563eb'])
    const text = pageText(renderer!.toJSON())
    expect(text).toContain('Assessment location')
    expect(text).toContain('My location')
    expect(text).toContain('Your current device location')
    expect(text).toContain('The saved assessment location remains unchanged.')
    await act(async () => renderer?.unmount())
  })

  it('returns to the saved assessment coordinate without requesting new data', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const getCurrentPosition = vi.fn()
    const onDeviceLocationChange = vi.fn()
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true,
    })
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(
        <GeographicEvidenceMap
          model={model}
          communityName="Saved assessment community"
          locationSource="manual"
          layers={layers}
          deviceLocation={null}
          onDeviceLocationChange={onDeviceLocationChange}
        />,
      )
    })
    const communityButton = renderer!.root.findByProps({
      'aria-label': 'Return map to saved assessment location',
    })
    await act(async () => communityButton.props.onClick())

    expect(leaflet.flyTo).toHaveBeenCalledWith(
      [16.5, 95],
      FLOOD_MAP_ZOOM,
      { animate: true, duration: 0.75 },
    )
    expect(getCurrentPosition).not.toHaveBeenCalled()
    expect(onDeviceLocationChange).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(renderer!.root.findAllByProps({
      'aria-label': 'Return map to saved community location',
    })).toHaveLength(0)
    fetchSpy.mockRestore()
    await act(async () => renderer?.unmount())
  })

  it.each([
    [1, 'Location permission was not granted.'],
    [2, 'Your current device location could not be determined.'],
    [3, 'The device location request timed out.'],
  ])('handles geolocation error %s without breaking community navigation', async (code, message) => {
    const getCurrentPosition = vi.fn((
      _success: PositionCallback,
      error: PositionErrorCallback,
    ) => error(locationError(code)))
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true,
    })
    let renderer: ReturnType<typeof create> | null = null
    await act(async () => {
      renderer = create(
        <GeographicEvidenceMap
          model={model}
          communityName="Saved assessment community"
          locationSource="manual"
          layers={layers}
          deviceLocation={null}
          onDeviceLocationChange={vi.fn()}
        />,
      )
    })
    await act(async () => renderer!.root.findByProps({
      'aria-label': 'Center map on my current device location',
    }).props.onClick())

    expect(pageText(renderer!.toJSON())).toContain(message)
    const communityButton = renderer!.root.findByProps({
      'aria-label': 'Return map to saved assessment location',
    })
    await act(async () => communityButton.props.onClick())
    expect(leaflet.flyTo).toHaveBeenCalledWith([16.5, 95], FLOOD_MAP_ZOOM, expect.any(Object))
    await act(async () => renderer?.unmount())
  })
})
