import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';

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
  } = useApp();
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [status, setStatus] = useState<string>('');
  const [lootCamOn, setLootCamOn] = useState<boolean>(false);

  const getLocation = () => {
    setStatus('Fetching location...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPosition(next);
        setStatus('Location updated.');
        if (lootCamOn) updateHuntPresence(next.lat, next.lng, true);
      },
      () => setStatus('Location permission denied or unavailable.'),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  useEffect(() => {
    if (!lootCamOn || !position) return;
    const id = window.setInterval(() => {
      updateHuntPresence(position.lat, position.lng, true);
    }, 8000);
    return () => window.clearInterval(id);
  }, [lootCamOn, position, updateHuntPresence]);

  const zones = useMemo(
    () => auraZones.filter((zone) => zone.expiresAt > Date.now()),
    [auraZones],
  );

  const nearbyZones = useMemo(() => {
    if (!position) return zones;
    return zones.filter((zone) => toMeters(position.lat, position.lng, zone.lat, zone.lng) <= 4000);
  }, [zones, position]);

  const ownerRequests = useMemo(() => incomingBorrowRequests, [incomingBorrowRequests]);

  const toggleLootCam = () => {
    if (!position) {
      setStatus('Use My Location first to enable Loot Cam.');
      return;
    }
    const next = !lootCamOn;
    setLootCamOn(next);
    updateHuntPresence(position.lat, position.lng, next);
  };

  const handleRunToggle = (zoneId: string) => {
    if (!position) {
      setStatus('Use My Location before starting run mode.');
      return;
    }
    if (runningZoneId === zoneId) {
      stopAuraRun(position.lat, position.lng);
      setStatus('Run mode stopped.');
      return;
    }
    startAuraRun(zoneId, position.lat, position.lng);
    setStatus('Run mode started. Nearby users can now see your active run.');
  };

  return (
    <section className="confessions-page">
      <header className="conf-head">
        <h3>Aura Hunt</h3>
        <span>Loot Cam shows nearby hunters only as bands. Exact chase data appears only in Run mode.</span>
      </header>
      <div className="spotlight-row">
        <span>Total Aura</span>
        <strong>{auraPoints}</strong>
      </div>
      <div className="conf-controls">
        <button type="button" onClick={getLocation}>Use My Location</button>
        <button type="button" onClick={toggleLootCam} className="witness-btn">
          {lootCamOn ? 'Loot Cam On' : 'Loot Cam Off'}
        </button>
        <span className="presence-label">Nearby hunters: {nearbyHunters.length}</span>
        {status && <span className="presence-label">{status}</span>}
      </div>

      <div className="conf-list">
        <article className="conf-card">
          <header>
            <strong>Loot Cam Live</strong>
            <span>{huntSharing || lootCamOn ? 'Sharing nearby presence' : 'Private mode'}</span>
          </header>
          {nearbyHunters.length === 0 ? (
            <p className="wall-empty">No nearby hunters in 4km right now.</p>
          ) : (
            <div className="vibe-row compact">
              {nearbyHunters.map((hunter) => (
                <span key={hunter.userId} className="owner-badge">
                  {hunter.username} � {hunter.distanceBand}
                  {hunter.isRunning && hunter.distanceToZoneMeters !== undefined
                    ? ` � RUN ${hunter.distanceToZoneMeters}m`
                    : ''}
                </span>
              ))}
            </div>
          )}
        </article>
      </div>

      {!!ownerRequests.length && (
        <div className="conf-list">
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
      )}

      <div className="conf-list">
        {zones.length === 0 && <p className="wall-empty">No active aura drops right now.</p>}
        {!!position && zones.length > 0 && nearbyZones.length === 0 && (
          <p className="wall-empty">No drops within 4km. Move closer and refresh location.</p>
        )}
        {(position ? nearbyZones : zones).map((zone) => {
          const distance =
            position ? Math.round(toMeters(position.lat, position.lng, zone.lat, zone.lng)) : null;
          const isMine = zone.claimedByUserId && zone.claimedByUserId === currentUser?.id;
          const isClaimedByOther = !!zone.claimedByUserId && !isMine;
          const borrowedByMe = !!zone.borrowedByMe;
          const isRunningThis = runningZoneId === zone.id;
          return (
            <motion.article key={zone.id} className="conf-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <header>
                <strong>{zone.title}</strong>
                <span>+{zone.reward} aura</span>
                <time>{formatLeft(zone.expiresAt)}</time>
              </header>
              <p>
                Radius {zone.radiusMeters}m
                {distance !== null ? ` � ${distance}m away` : ''}
              </p>
              <div className="vibe-row compact">
                <span className="pulse-chip">Runners {zone.runnerCount ?? 0}</span>
              </div>
              {zone.claimedByUserId ? (
                <p className="wall-empty">
                  Claimed by {zone.claimedByUsername ?? 'Unknown'} � Borrowed {zone.borrowedCount ?? 0} times
                </p>
              ) : (
                <p className="wall-empty">Unclaimed drop</p>
              )}
              <div className="vibe-row">
                {!zone.claimedByUserId && (
                  <button
                    type="button"
                    className="witness-btn"
                    onClick={() => position && claimAuraZone(zone.id, position.lat, position.lng)}
                    disabled={!position}
                  >
                    Claim Loot
                  </button>
                )}
                {isClaimedByOther && !borrowedByMe && (
                  <button
                    type="button"
                    className="witness-btn"
                    onClick={() => position && requestBorrowAura(zone.id, position.lat, position.lng)}
                    disabled={!position}
                  >
                    Request Borrow
                  </button>
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
                  href={`https://www.openstreetmap.org/?mlat=${zone.lat}&mlon=${zone.lng}#map=17/${zone.lat}/${zone.lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Map
                </a>
              </div>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}
