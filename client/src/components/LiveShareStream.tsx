import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import type { WallVibe } from '../types';

interface LiveShareStreamProps {
  onPostPulse: () => void;
  onOpenConfessions: () => void;
}

type RegionFilter = 'global' | 'nearby';

const vibeButtons: Array<{ id: WallVibe; label: string }> = [
  { id: 'calm', label: 'Calm' },
  { id: 'chaos', label: 'Chaos' },
  { id: 'deep', label: 'Deep' },
  { id: 'funny', label: 'Funny' },
];

export function LiveShareStream({ onPostPulse, onOpenConfessions }: LiveShareStreamProps) {
  const {
    freedomPosts,
    users,
    activeDrop,
    questProgress,
    streak,
    currentUser,
    viewFreedomPost,
    reactToFreedomPost,
  } = useApp();
  const [now, setNow] = useState(Date.now());
  const [region, setRegion] = useState<RegionFilter>('global');
  const [questFlash, setQuestFlash] = useState('');
  const [demoVibes, setDemoVibes] = useState<Record<WallVibe, number>>({
    calm: 0,
    chaos: 0,
    deep: 0,
    funny: 0,
  });
  const [demoWitnessed, setDemoWitnessed] = useState(false);

  const onlineUserIds = useMemo(() => new Set(users.map((u) => u.id)), [users]);
  const filteredPosts = useMemo(() => {
    if (region === 'nearby') {
      return freedomPosts.filter((post) => onlineUserIds.has(post.userId)).slice(0, 12);
    }
    return freedomPosts.slice(0, 12);
  }, [freedomPosts, onlineUserIds, region]);

  const formatLeft = (expiresAt: number) => {
    const left = Math.max(0, expiresAt - now);
    const m = Math.floor(left / 60000);
    const s = Math.floor((left % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const pulseCountLabel =
    filteredPosts.length > 0
      ? `${filteredPosts.length} live pulses`
      : 'Waiting for someone to speak.';

  const showProgressFlash = (text: string) => {
    setQuestFlash(text);
    window.setTimeout(() => setQuestFlash(''), 1200);
  };

  return (
    <aside className="share-stream stream-shell">
      <div className="share-stream-head stream-head-main">
        <div>
          <h3>Global Pulse</h3>
          <span>{pulseCountLabel}</span>
        </div>
        <div className="region-switch">
          <button
            type="button"
            className={region === 'global' ? 'active' : ''}
            onClick={() => setRegion('global')}
          >
            Global
          </button>
          <button
            type="button"
            className={region === 'nearby' ? 'active' : ''}
            onClick={() => setRegion('nearby')}
          >
            Nearby
          </button>
        </div>
      </div>

      <div className="stream-terms">
        <span title="A live post that exists right now.">Pulse</span>
        <span title="A live reaction that shapes the mood.">Vibe</span>
        <span title="A temporary presence zone created by activity.">Aura</span>
      </div>

      <div className="stream-primary-actions">
        <button type="button" className="drop-first-btn" onClick={onPostPulse}>
          Drop Pulse
        </button>
      </div>

      <div className="share-stream-list stream-posts">
        {filteredPosts.length === 0 && (
          <motion.article className="share-item demo" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <header>
              <div className="post-user">
                <span className="presence-dot online" />
                <strong>Global Pulse</strong>
              </div>
              <time>Demo</time>
            </header>
            <p>Welcome to the Global Pulse. This post will disappear when the server resets.</p>
            <div className="empty-actions">
              <button type="button" className="drop-first-btn" onClick={onPostPulse}>
                Drop First Pulse
              </button>
              <button type="button" className="empty-btn secondary" onClick={onOpenConfessions}>
                Open Confessions
              </button>
            </div>
            <div className="vibe-row compact">
              {vibeButtons.map((vibe) => (
                <button
                  key={vibe.id}
                  type="button"
                  className="vibe-btn"
                  onClick={() => {
                    setDemoVibes((prev) => ({ ...prev, [vibe.id]: prev[vibe.id] + 1 }));
                    showProgressFlash('+1 Witness');
                  }}
                >
                  <span>{vibe.label}</span>
                  <strong>{demoVibes[vibe.id]}</strong>
                </button>
              ))}
            </div>
            {!demoWitnessed && (
              <button
                type="button"
                className="witness-btn"
                onClick={() => {
                  setDemoWitnessed(true);
                  showProgressFlash('+1 Witness');
                }}
              >
                Witness Pulse
              </button>
            )}
          </motion.article>
        )}

        {filteredPosts.map((post) => {
          const online = onlineUserIds.has(post.userId);
          const hasSeen = !!currentUser && post.viewerIds.includes(currentUser.id);
          return (
            <motion.article
              key={post.id}
              className="share-item"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <header>
                <div className="post-user">
                  <span className={`presence-dot ${online ? 'online' : 'offline'}`} />
                  <strong>{post.username}</strong>
                </div>
                <time>{new Date(post.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
              </header>
              <div className="share-meta">
                <span className="pulse-chip">Pulse {post.pulseCount}</span>
                <span className="owner-badge">
                  Owner {post.currentOwnerUserId === post.userId ? 'Creator' : 'Relay'}
                </span>
                {post.firstWitnessUserId ? (
                  <span className="owner-badge">Locked</span>
                ) : (
                  <span className="owner-badge">Open</span>
                )}
                {post.dropId && activeDrop && post.dropId === activeDrop.id && (
                  <span className="owner-badge">Drop {formatLeft(activeDrop.expiresAt)}</span>
                )}
              </div>
              {post.text && <p>{post.text}</p>}
              {post.imageDataUrl && <img src={post.imageDataUrl} alt="share" />}
              {post.videoDataUrl && (
                <video
                  className="media-video"
                  src={post.videoDataUrl}
                  muted
                  controls
                  controlsList="nodownload noplaybackrate"
                  disablePictureInPicture
                  playsInline
                  preload="metadata"
                />
              )}
              <div className="vibe-row compact">
                {vibeButtons.map((vibe) => (
                  <button
                    key={vibe.id}
                    type="button"
                    className="vibe-btn"
                    onClick={() => {
                      reactToFreedomPost(post.id, vibe.id);
                      showProgressFlash('+1 Witness');
                    }}
                  >
                    <span>{vibe.label}</span>
                    <strong>{post.vibeCounts[vibe.id] ?? 0}</strong>
                  </button>
                ))}
              </div>
              {!hasSeen && (
                <button
                  type="button"
                  className="witness-btn"
                  onClick={() => {
                    viewFreedomPost(post.id);
                    showProgressFlash('+1 Witness');
                  }}
                >
                  Witness Pulse
                </button>
              )}
            </motion.article>
          );
        })}
      </div>

      <div className="quest-board stream-quests">
        <h4>Pulse Quests</h4>
        <small>Scroll and interact to progress.</small>
        {questFlash && <motion.div className="quest-flash" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{questFlash}</motion.div>}
        <div className="spotlight-row">
          <span>Streak</span>
          <strong>{streak.current}d (best {streak.best}d)</strong>
        </div>
        <div className="quest-row">
          <span>Witness 5 Pulses</span>
          <strong>{Math.min(questProgress.witnessCount, 5)}/5</strong>
          <small>Watch the stream and tap Witness Pulse.</small>
          <div className="quest-bar">
            <i style={{ width: `${(Math.min(questProgress.witnessCount, 5) / 5) * 100}%` }} />
          </div>
        </div>
        <div className="quest-row">
          <span>Post 1 Pulse</span>
          <strong>{Math.min(questProgress.postsCount, 1)}/1</strong>
          <small>Drop your own pulse to enter the loop.</small>
          <div className="quest-bar">
            <i style={{ width: `${Math.min(questProgress.postsCount, 1) * 100}%` }} />
          </div>
        </div>
        <div className="quest-row">
          <span>Drop 3 Vibes</span>
          <strong>{Math.min(questProgress.vibesCount, 3)}/3</strong>
          <small>Tap vibes to feel the room shift.</small>
          <div className="quest-bar">
            <i style={{ width: `${(Math.min(questProgress.vibesCount, 3) / 3) * 100}%` }} />
          </div>
        </div>
      </div>
    </aside>
  );
}
