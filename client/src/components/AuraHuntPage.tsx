import { useMemo, useState } from 'react';
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
  } = useApp();
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [status, setStatus] = useState<string>('');

  const getLocation = () => {
    setStatus('Fetching location...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPosition(next);
        setStatus('Location updated.');
      },
      () => setStatus('Location permission denied or unavailable.'),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  const zones = useMemo(
    () => auraZones.filter((zone) => zone.expiresAt > Date.now()),
    [auraZones],
  );

  const nearbyZones = useMemo(() => {
    if (!position) return zones;
    return zones.filter((zone) => toMeters(position.lat, position.lng, zone.lat, zone.lng) <= 4000);
  }, [zones, position]);

  const myRequests = useMemo(
    () => incomingBorrowRequests.filter((req) => req.fromUserId !== currentUser?.id),
    [incomingBorrowRequests, currentUser?.id],
  );

  return (
    <section className="confessions-page">
      <header className="conf-head">
        <h3>Aura Hunt</h3>
        <span>Go near drop points, claim aura loot, level up your node.</span>
      </header>
      <div className="spotlight-row">
        <span>Total Aura</span>
        <strong>{auraPoints}</strong>
      </div>
      <div className="conf-controls">
        <button type="button" onClick={getLocation}>Use My Location</button>
        {status && <span className="presence-label">{status}</span>}
      </div>
      {!!myRequests.length && (
        <div className="conf-list">
          {myRequests.map((req) => (
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
          return (
            <motion.article key={zone.id} className="conf-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <header>
                <strong>{zone.title}</strong>
                <span>+{zone.reward} aura</span>
                <time>{formatLeft(zone.expiresAt)}</time>
              </header>
              <p>
                Radius {zone.radiusMeters}m
                {distance !== null ? ` · ${distance}m away` : ''}
              </p>
              {zone.claimedByUserId ? (
                <p className="wall-empty">
                  Claimed by {zone.claimedByUsername ?? 'Unknown'} · Borrowed {zone.borrowedCount ?? 0} times
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
