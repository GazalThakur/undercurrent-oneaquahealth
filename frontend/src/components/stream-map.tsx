import { useEffect, useRef } from "react";
import type { Map as LMap, LayerGroup, CircleMarker } from "leaflet";
import {
  results,
  riskColor,
  siteBounds,
  type Hazard,
  type Site,
} from "@/lib/results";

type Props = {
  hazard: Hazard;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  interactive: boolean;
  flyToken?: number;
  cityFocus?: { lat: number; lon: number; key: number } | null;
};

export function StreamMap({
  hazard,
  selectedId,
  onSelect,
  interactive,
  flyToken = 0,
  cityFocus = null,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const markersRef = useRef<Map<string, CircleMarker>>(new Map());
  const selectedLayerRef = useRef<LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  const hazardRef = useRef(hazard);
  const selectedRef = useRef(selectedId);
  const interactiveRef = useRef(interactive);
  onSelectRef.current = onSelect;
  hazardRef.current = hazard;
  selectedRef.current = selectedId;
  interactiveRef.current = interactive;

  useEffect(() => {
    let cancelled = false;
    let map: LMap | undefined;

    async function mount() {
      const leaflet = await import("leaflet");
      const L = leaflet.default;
      if (cancelled || !hostRef.current) return;

      const bounds = siteBounds(results.sites);
      map = L.map(hostRef.current, {
        zoomControl: false,
        scrollWheelZoom: false,
        attributionControl: true,
        dragging: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
        minZoom: 4,
        maxZoom: 16,
        maxBounds: bounds,
        maxBoundsViscosity: 0.7,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 5.4, animate: false });
      layerRef.current = L.layerGroup().addTo(map);
      selectedLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;

      map.on("click", () => onSelectRef.current(null));
      drawMarkers(L);
    }

    void mount();
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      layerRef.current = null;
      selectedLayerRef.current = null;
      markersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (interactive) {
      map.dragging.enable();
      map.doubleClickZoom.enable();
      map.boxZoom.enable();
      map.keyboard.enable();
      map.touchZoom.enable();
    } else {
      map.dragging.disable();
      map.doubleClickZoom.disable();
      map.boxZoom.disable();
      map.keyboard.disable();
      map.touchZoom.disable();
    }
  }, [interactive]);

  useEffect(() => {
    void import("leaflet").then((leaflet) => drawMarkers(leaflet.default));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hazard, selectedId, interactive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !cityFocus) return;
    map.flyTo([cityFocus.lat, cityFocus.lon], 12, { duration: 0.9 });
  }, [cityFocus]);

  useEffect(() => {
    const map = mapRef.current;
    const site = results.sites.find((s) => s.site === selectedId);
    if (!map || !site || flyToken === 0) return;
    const z = map.getZoom();
    if (z < 11) map.flyTo([site.lat, site.lon], 13, { duration: 0.85 });
    else map.panTo([site.lat, site.lon]);
  }, [selectedId, flyToken]);

  function drawMarkers(L: typeof import("leaflet")) {
    const group = layerRef.current;
    const selGroup = selectedLayerRef.current;
    if (!group || !selGroup) return;
    group.clearLayers();
    selGroup.clearLayers();
    markersRef.current.clear();

    const currentHazard = hazardRef.current;
    const currentSelected = selectedRef.current;

    for (const site of results.sites) {
      const isSel = site.site === currentSelected;
      if (isSel) continue;
      const color = riskColor(site.scores[currentHazard]);
      const marker = L.circleMarker([site.lat, site.lon], {
        radius: site.flagged ? 8 : 5.5,
        color: site.flagged ? "#1a1714" : color,
        weight: site.flagged ? 2 : 1,
        fillColor: color,
        fillOpacity: 0.92,
        opacity: 1,
      });
      bindSite(marker, site, L);
      marker.on("add", () => {
        const el = marker.getElement();
        if (!el) return;
        if (site.site === results.meta.demo_site) {
          el.setAttribute("data-tour", "map-marker");
        }
      });
      marker.addTo(group);
      markersRef.current.set(site.site, marker);
    }

    const selected = results.sites.find((s) => s.site === currentSelected);
    if (selected) {
      const pin = L.marker([selected.lat, selected.lon], {
        icon: L.divIcon({
          className: "",
          html: `<div class="selected-pin" aria-hidden="true">*</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
        zIndexOffset: 800,
      });
      pin.on("click", (ev) => {
        L.DomEvent.stopPropagation(ev);
      });
      const selectedLabel = `${selected.site} · ${selected.name ?? selected.city}`;
      pin.bindTooltip(selectedLabel, {
        className: "site-tooltip",
        direction: "top",
        offset: [0, -18],
        permanent: interactiveRef.current,
      });
      pin.addTo(selGroup);
    }
  }

  function bindSite(
    marker: CircleMarker,
    site: Site,
    L: typeof import("leaflet"),
  ) {
    const label = `${site.site} · ${site.name ?? site.city}`;
    marker.bindTooltip(label, {
      className: "site-tooltip",
      direction: "top",
      offset: [0, -6],
    });
    marker.on("click", (ev) => {
      L.DomEvent.stopPropagation(ev);
      onSelectRef.current(site.site);
    });
  }

  return (
    <div
      ref={hostRef}
      data-tour="map-canvas"
      data-map-live={interactive ? "1" : "0"}
      className="absolute inset-0 h-full w-full"
      role="application"
      aria-label="Map of urban stream sampling sites"
    />
  );
}
