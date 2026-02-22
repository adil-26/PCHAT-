import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Circle, CircleMarker, MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet';
import { useApp } from '../context/AppContext';
import type { AuraZone } from '../types';

const DEFAULT_MAP_CENTER: [number, number] = [40.73061, -73.935242];

const formatLeft = (expiresAt: number) => {
  const left = Math.max(0, expiresAt - Date.now());
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const toMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
};

const bearingBetween = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const lambda1 = (lon1 * Math.PI) / 180;
  const lambda2 = (lon2 * Math.PI) / 180;
  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
};

const bearingLabel = (bearing: number | null) => {
  if (bearing === null) return '--';
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.round(bearing / 45) % 8];
};

const etaFromDistance = (distanceMeters: number | null) => {
  if (distanceMeters === null) return '--';
  if (distanceMeters <= 40) return '<1m walk';
  const minutes = Math.max(1, Math.round(distanceMeters / 78));
  return `${minutes}m walk`;
};

function FollowMapCenter({ center, active }: { center: [number, number]; active: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!active) return;
    map.panTo(center, { animate: true });
  }, [active, center, map]);
  return null;
}

function getNearestZone(zones: AuraZone[], lat: number, lng: number) {
  if (zones.length === 0) return null;
  return zones.reduce((nearest, zone) => {
    if (!nearest) return zone;
    const currentDistance = toMeters(lat, lng, zone.lat, zone.lng);
    const nearestDistance = toMeters(lat, lng, nearest.lat, nearest.lng);
    return currentDistance < nearestDistance ? zone : nearest;
  }, zones[0]);
}

type MobileAuraPane = 'map' | 'loot' | 'hunters';

export function AuraHuntPage() {
  const {
    auraZones,
    auraPoints,
    claimAuraZone,
    requestBorrowAura,
    respondBorrowAura,
    incomingBorrowRequests,
    currentUser,
    updateHuntPresence,
    startAuraRun,
    stopAuraRun,
    nearbyHunters,
    runningZoneId,
    huntSharing,
    blockedNodeIds,
    setBorrowRequestsEnabled,
  } = useApp();
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [status, setStatus] = useState<string>('');
  const [tracking, setTracking] = useState(false);
  const [lootCamOn, setLootCamOn] = useState<boolean>(false);
  const [borrowEnabled, setBorrowEnabled] = useState(true);
  const [endedStories, setEndedStories] = useState<Array<{ id: string; text: string }>>([]);
  const [focusedZoneId, setFocusedZoneId] = useState<string | null>(null);
  const [followMap, setFollowMap] = useState(true);
  const [isMobileLayout, setIsMobileLayout] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 920px)').matches,
  );
  const [mobilePane, setMobilePane] = useState<MobileAuraPane>('map');
  const previousZonesRef = useRef<Record<string, { startedAt: number; chainLength: number }>>({});
  const watchIdRef = useRef<number | null>(null);
  const trackingRef = useRef(false);
  const lootCamRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 920px)');
    const sync = () => setIsMobileLayout(media.matches);
    sync();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', sync);
      return () => media.removeEventListener('change', sync);
    }
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  useEffect(() => {
    if (!isMobileLayout) {
      setMobilePane('map');
    }
  }, [isMobileLayout]);

  useEffect(() => {
    lootCamRef.current = lootCamOn;
  }, [lootCamOn]);

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    trackingRef.current = false;
    setTracking(false);
    setLootCamOn(false);
    if (position) updateHuntPresence(position.lat, position.lng, false);
    setStatus('Tracking paused.');
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      setStatus('Geolocation is not available on this device.');
      return;
    }
    if (watchIdRef.current !== null) return;
    setStatus('Locking live coordinates...');
    trackingRef.current = true;
    setTracking(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPosition(next);
        setStatus('Live location active.');
        updateHuntPresence(next.lat, next.lng, lootCamRef.current);
      },
      () => {
        setStatus('Location veil is closed.');
        stopTracking();
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  };

  useEffect(() => {
    startTracking();
    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      watchIdRef.current = null;
      trackingRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!position || !trackingRef.current) return;
    updateHuntPresence(position.lat, position.lng, lootCamOn);
  }, [lootCamOn, position, updateHuntPresence]);

  const zones = useMemo(
    () => auraZones.filter((zone) => zone.expiresAt > Date.now()),
    [auraZones],
  );

  const nearbyZones = useMemo(() => {
    if (!position) return zones;
    return zones.filter((zone) => toMeters(position.lat, position.lng, zone.lat, zone.lng) <= 4000);
  }, [zones, position]);

  const visibleZones = position ? nearbyZones : zones;

  useEffect(() => {
    if (!visibleZones.length) {
      setFocusedZoneId(null);
      return;
    }
    if (focusedZoneId && visibleZones.some((zone) => zone.id === focusedZoneId)) return;
    if (!position) {
      setFocusedZoneId(visibleZones[0].id);
      return;
    }
    const nearest = getNearestZone(visibleZones, position.lat, position.lng);
    setFocusedZoneId(nearest?.id ?? visibleZones[0].id);
  }, [visibleZones, focusedZoneId, position]);

  const ownerRequests = useMemo(() => incomingBorrowRequests, [incomingBorrowRequests]);
  const visibleNearbyHunters = useMemo(
    () => nearbyHunters.filter((hunter) => !blockedNodeIds.includes(hunter.userId)),
    [nearbyHunters, blockedNodeIds],
  );
  const focusedZone = useMemo(
    () => visibleZones.find((zone) => zone.id === focusedZoneId) ?? null,
    [visibleZones, focusedZoneId],
  );

  const navDistance = useMemo(() => {
    if (!position || !focusedZone) return null;
    return Math.round(toMeters(position.lat, position.lng, focusedZone.lat, focusedZone.lng));
  }, [position, focusedZone]);

  const navBearing = useMemo(() => {
    if (!position || !focusedZone) return null;
    return Math.round(bearingBetween(position.lat, position.lng, focusedZone.lat, focusedZone.lng));
  }, [position, focusedZone]);

  const toggleLootCam = () => {
    if (!position) {
      setStatus('Tracking is required before Loot Cam.');
      return;
    }
    const next = !lootCamOn;
    setLootCamOn(next);
    updateHuntPresence(position.lat, position.lng, next);
  };

  const handleRunToggle = (zoneId: string) => {
    if (!position) {
      setStatus('Track your location first, then run.');
      return;
    }
    if (runningZoneId === zoneId) {
      stopAuraRun(position.lat, position.lng);
      setStatus('Run stopped.');
      return;
    }
    startAuraRun(zoneId, position.lat, position.lng);
    setStatus('Run mode live. Nearby hunters can see your movement.');
  };

  useEffect(() => {
    const currentMap: Record<string, { startedAt: number; chainLength: number }> = {};
    for (const zone of zones) {
      const prev = previousZonesRef.current[zone.id];
      currentMap[zone.id] = {
        startedAt: prev?.startedAt ?? Date.now(),
        chainLength: Math.max(zone.runnerCount ?? 0, (zone.borrowedCount ?? 0) + 1),
      };
    }
    for (const [zoneId, prev] of Object.entries(previousZonesRef.current)) {
      if (currentMap[zoneId]) continue;
      const livedMs = Math.max(0, Date.now() - prev.startedAt);
      const h = Math.floor(livedMs / (60 * 60 * 1000));
      const m = Math.floor((livedMs % (60 * 60 * 1000)) / 60000);
      const duration = h > 0 ? `${h}h ${m}m` : `${m}m`;
      setEndedStories((stories) => [
        { id: `${zoneId}-${Date.now()}`, text: `This aura lived for ${duration} and connected ${prev.chainLength} nodes.` },
        ...stories,
      ].slice(0, 4));
    }
    previousZonesRef.current = currentMap;
  }, [zones]);

  const mapCenter = useMemo<[number, number]>(() => {
    if (position) return [position.lat, position.lng];
    if (focusedZone) return [focusedZone.lat, focusedZone.lng];
    if (visibleZones.length) return [visibleZones[0].lat, visibleZones[0].lng];
    return DEFAULT_MAP_CENTER;
  }, [position, focusedZone, visibleZones]);

  const renderMapPanel = () => (
    <article className="conf-card aura-map-card">
      <header>
        <strong>Live Hunt Map</strong>
        <span>{tracking ? 'Tracking active' : 'Tracking paused'}</span>
      </header>
      <div className="aura-nav-summary">
        <span>Target: {focusedZone?.title ?? 'No target selected'}</span>
        <strong>{navDistance !== null ? `${navDistance}m` : '--'}</strong>
        <span>{navBearing !== null ? `${navBearing}deg ${bearingLabel(navBearing)}` : '--'}</span>
        <span>ETA: {etaFromDistance(navDistance)}</span>
        <span className={navDistance !== null && focusedZone && navDistance <= focusedZone.radiusMeters ? 'owner-badge mine' : 'owner-badge'}>
          {navDistance !== null && focusedZone && navDistance <= focusedZone.radiusMeters ? 'Inside 50m capture radius' : 'Move into 50m capture radius'}
        </span>
        <span className="owner-badge">{huntSharing || lootCamOn ? 'Sharing nearby presence' : 'Private mode'}</span>
      </div>
      <div className="aura-map-wrap">
        <MapContainer center={mapCenter} zoom={14} minZoom={3} className="aura-map">
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {position && <FollowMapCenter center={[position.lat, position.lng]} active={followMap} />}
          {position && (
            <CircleMarker
              center={[position.lat, position.lng]}
              radius={8}
              pathOptions={{ color: '#2cd37a', fillColor: '#2cd37a', fillOpacity: 0.95, weight: 2 }}
            />
          )}
          {visibleZones.map((zone) => {
            const focused = zone.id === focusedZoneId;
            return (
              <Circle
                key={`zone-radius-${zone.id}`}
                center={[zone.lat, zone.lng]}
                radius={zone.radiusMeters}
                pathOptions={{
                  color: focused ? '#ff4d2e' : '#ff9f8d',
                  fillColor: focused ? '#ff4d2e' : '#ff7e67',
                  fillOpacity: focused ? 0.24 : 0.12,
                  weight: focused ? 3 : 2,
                }}
              />
            );
          })}
          {visibleZones.map((zone) => {
            const focused = zone.id === focusedZoneId;
            return (
              <CircleMarker
                key={`zone-center-${zone.id}`}
                center={[zone.lat, zone.lng]}
                radius={focused ? 7 : 5}
                pathOptions={{
                  color: focused ? '#ffd2c7' : '#ffc2b6',
                  fillColor: focused ? '#ff4d2e' : '#ff6c52',
                  fillOpacity: 0.95,
                  weight: 2,
                }}
              />
            );
          })}
          {visibleNearbyHunters.map((hunter) => (
            <CircleMarker
              key={`hunter-${hunter.userId}`}
              center={[hunter.lat, hunter.lng]}
              radius={5}
              pathOptions={{ color: '#7ea8ff', fillColor: '#7ea8ff', fillOpacity: 0.9, weight: 1.5 }}
            />
          ))}
          {position && focusedZone && (
            <Polyline
              positions={[[position.lat, position.lng], [focusedZone.lat, focusedZone.lng]]}
              pathOptions={{ color: '#ff4d2e', weight: 3, opacity: 0.88, dashArray: '10 10' }}
            />
          )}
        </MapContainer>
      </div>
      <div className="aura-map-legend">
        <span><i className="legend-dot self" /> You</span>
        <span><i className="legend-dot loot" /> Loot</span>
        <span><i className="legend-dot hunter" /> Nearby Hunter</span>
      </div>
    </article>
  );

  const renderHuntersPanel = () => (
    <article className="conf-card">
      <header>
        <strong>Nearby Hunters</strong>
        <span>{visibleNearbyHunters.length} visible</span>
      </header>
      {visibleNearbyHunters.length === 0 ? (
        <p className="wall-empty">No footsteps nearby.</p>
      ) : (
        <div className="vibe-row compact">
          {visibleNearbyHunters.map((hunter) => (
            <span key={hunter.userId} className="owner-badge">
              {hunter.username} - {hunter.distanceMeters}m
              {hunter.isRunning && hunter.distanceToZoneMeters !== undefined
                ? ` - RUN ${hunter.distanceToZoneMeters}m`
                : ''}
            </span>
          ))}
        </div>
      )}
    </article>
  );

  const renderRequestsPanel = () => {
    if (!ownerRequests.length) return null;
    return (
      <div className="aura-request-stack">
        {ownerRequests.map((req) => (
          <article key={`${req.zoneId}-${req.fromUserId}`} className="conf-card">
            <header>
              <strong>Borrow Request</strong>
              <span>{req.fromUsername} wants access to your aura loot</span>
            </header>
            <div className="vibe-row">
              <button
                type="button"
                className="witness-btn"
                onClick={() => respondBorrowAura(req.zoneId, req.fromUserId, true)}
              >
                Approve
              </button>
              <button
                type="button"
                className="witness-btn"
                onClick={() => respondBorrowAura(req.zoneId, req.fromUserId, false)}
              >
                Reject
              </button>
            </div>
          </article>
        ))}
      </div>
    );
  };

  const renderLootStack = () => (
    <div className="aura-loot-stack">
      {zones.length === 0 && <p className="wall-empty">No aura has awakened.</p>}
      {!!position && zones.length > 0 && nearbyZones.length === 0 && (
        <p className="wall-empty">Nothing within 4km. Drift closer.</p>
      )}
      {visibleZones.map((zone) => {
        const distance =
          position ? Math.round(toMeters(position.lat, position.lng, zone.lat, zone.lng)) : null;
        const isMine = zone.claimedByUserId && zone.claimedByUserId === currentUser?.id;
        const isClaimedByOther = !!zone.claimedByUserId && !isMine;
        const borrowedByMe = !!zone.borrowedByMe;
        const isRunningThis = runningZoneId === zone.id;
        const chainLength = Math.max(zone.runnerCount ?? 0, (zone.borrowedCount ?? 0) + 1);
        const canCapture = distance !== null && distance <= zone.radiusMeters;
        const directionUrl = position
          ? `https://www.google.com/maps/dir/?api=1&origin=${position.lat},${position.lng}&destination=${zone.lat},${zone.lng}&travelmode=walking`
          : `https://www.google.com/maps/search/?api=1&query=${zone.lat},${zone.lng}`;
        return (
          <motion.article
            key={zone.id}
            className={`conf-card ${focusedZoneId === zone.id ? 'aura-card-focused' : ''}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <header>
              <strong>{zone.title}</strong>
              <span>+{zone.reward} aura</span>
              <time>{formatLeft(zone.expiresAt)}</time>
            </header>
            <p>
              Capture Radius {zone.radiusMeters}m
              {distance !== null ? ` - ${distance}m away` : ''}
            </p>
            <p className="chain-line">Lat {zone.lat.toFixed(6)} · Lng {zone.lng.toFixed(6)}</p>
            <div className="vibe-row compact">
              <span className="pulse-chip">Runners {zone.runnerCount ?? 0}</span>
              <span className="pulse-chip">Chain Length: {chainLength} Nodes</span>
              {canCapture ? <span className="owner-badge mine">Inside capture radius</span> : <span className="owner-badge">Move closer to 50m</span>}
            </div>
            <p className="chain-line">This aura connected {chainLength} strangers.</p>
            {zone.claimedByUserId ? (
              <p className="wall-empty">
                Claimed by {zone.claimedByUsername ?? 'Unknown'} - Borrowed {zone.borrowedCount ?? 0} times
              </p>
            ) : (
              <p className="wall-empty">Still untouched.</p>
            )}
            <div className="vibe-row">
              <button
                type="button"
                className="witness-btn"
                onClick={() => setFocusedZoneId(zone.id)}
              >
                Track on Map
              </button>
              {!zone.claimedByUserId && (
                <button
                  type="button"
                  className="witness-btn"
                  onClick={() => position && claimAuraZone(zone.id, position.lat, position.lng)}
                  disabled={!position || !canCapture}
                >
                  Claim Loot
                </button>
              )}
              {isClaimedByOther && !borrowedByMe && !zone.borrowDisabled && (
                <button
                  type="button"
                  className="witness-btn"
                  onClick={() => position && requestBorrowAura(zone.id, position.lat, position.lng)}
                  disabled={!position || !canCapture}
                >
                  Request Borrow
                </button>
              )}
              {isClaimedByOther && zone.borrowDisabled && (
                <span className="owner-badge">Borrow gate is closed.</span>
              )}
              <button
                type="button"
                className="witness-btn"
                onClick={() => handleRunToggle(zone.id)}
                disabled={!position}
              >
                {isRunningThis ? 'Stop Run' : 'Run to Loot'}
              </button>
              {isMine && <span className="owner-badge mine">You own this drop</span>}
              {borrowedByMe && <span className="owner-badge">Borrowed by you</span>}
              <a
                className="witness-btn"
                href={directionUrl}
                target="_blank"
                rel="noreferrer"
              >
                Navigate
              </a>
            </div>
          </motion.article>
        );
      })}
      {endedStories.length > 0 && endedStories.map((story) => (
        <article key={story.id} className="conf-card">
          <p className="chain-line">{story.text}</p>
        </article>
      ))}
    </div>
  );

  return (
    <section className="confessions-page aura-page">
      <header className="conf-head">
        <h3>Aura Hunt</h3>
        <span>System loot spawns in real time. Enter within 50m to claim.</span>
      </header>

      <div className="spotlight-row">
        <span>Total Aura</span>
        <strong>{auraPoints}</strong>
      </div>

      <div className="conf-controls">
        <button type="button" onClick={tracking ? stopTracking : startTracking}>
          {tracking ? 'Pause Tracking' : 'Start Tracking'}
        </button>
        <button type="button" onClick={toggleLootCam} className="witness-btn">
          {lootCamOn ? 'Loot Cam On' : 'Loot Cam Off'}
        </button>
        <button
          type="button"
          onClick={() => setFollowMap((prev) => !prev)}
          className="witness-btn"
        >
          {followMap ? 'Follow Me' : 'Free Map'}
        </button>
        <button
          type="button"
          onClick={() => {
            const next = !borrowEnabled;
            setBorrowEnabled(next);
            setBorrowRequestsEnabled(next);
          }}
          className="witness-btn"
        >
          {borrowEnabled ? 'Borrow Gate Open' : 'Borrow Gate Closed'}
        </button>
        <span className="presence-label">Nearby hunters: {visibleNearbyHunters.length}</span>
        {status && <span className="presence-label">{status}</span>}
      </div>

      {isMobileLayout && (
        <div className="aura-mobile-tabs">
          <button
            type="button"
            className={`aura-tab-btn ${mobilePane === 'map' ? 'active' : ''}`}
            onClick={() => setMobilePane('map')}
          >
            Map View
          </button>
          <button
            type="button"
            className={`aura-tab-btn ${mobilePane === 'loot' ? 'active' : ''}`}
            onClick={() => setMobilePane('loot')}
          >
            Loot Feed
          </button>
          <button
            type="button"
            className={`aura-tab-btn ${mobilePane === 'hunters' ? 'active' : ''}`}
            onClick={() => setMobilePane('hunters')}
          >
            Hunters
          </button>
        </div>
      )}

      {isMobileLayout ? (
        <div className="aura-mobile-pane">
          {mobilePane === 'map' && renderMapPanel()}
          {mobilePane === 'hunters' && (
            <div className="aura-mobile-stack">
              {renderHuntersPanel()}
              {renderRequestsPanel()}
            </div>
          )}
          {mobilePane === 'loot' && (
            <div className="aura-mobile-scroll">
              {renderLootStack()}
            </div>
          )}
        </div>
      ) : (
        <div className="aura-desktop-grid">
          <div className="aura-map-column">
            {renderMapPanel()}
          </div>
          <div className="aura-side-column">
            {renderHuntersPanel()}
            <div className="aura-side-scroll">
              {renderRequestsPanel()}
              {renderLootStack()}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
