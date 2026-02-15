import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';

export function LiveShareStream() {
  const { freedomPosts, users, pulseLeaderboard, creatorSpotlight, questProgress, streak, currentUser, viewFreedomPost, reactToFreedomPost } = useApp();
  const recent = freedomPosts.slice(0, 10);
  const onlineUserIds = new Set(users.map((u) => u.id));
  const activeSharers = new Set(freedomPosts.filter((p) => onlineUserIds.has(p.userId)).map((p) => p.userId)).size;
  const questCards = [
    { name: 'Witness 5 Pulses', value: Math.min(questProgress.witnessCount, 5), max: 5 },
    { name: 'Post 1 Share', value: Math.min(questProgress.postsCount, 1), max: 1 },
    { name: 'Drop 5 Vibes', value: Math.min(questProgress.vibesCount, 5), max: 5 },
  ];

  return (
    <aside className="share-stream">
      <div className="share-stream-head">
        <h3>Global Share Stream</h3>
        <span>{activeSharers} active sharers</span>
      </div>
      {pulseLeaderboard.length > 0 && (
        <div className="pulse-board">
          {pulseLeaderboard.slice(0, 3).map((row, index) => (
            <div key={row.userId} className={`pulse-row ${row.userId === currentUser?.id ? 'mine' : ''}`}>
              <span className="pulse-rank">#{index + 1}</span>
              <span className="pulse-name">{row.username}</span>
              <strong>{row.score}</strong>
            </div>
          ))}
        </div>
      )}
      {creatorSpotlight.length > 0 && (
        <div className="spotlight-board">
          <h4>Creator Spotlight</h4>
          {creatorSpotlight.slice(0, 3).map((row, index) => (
            <div key={row.userId} className="spotlight-row">
              <span>#{index + 1} {row.username}</span>
              <strong>{row.score}</strong>
            </div>
          ))}
        </div>
      )}
      <div className="quest-board">
        <h4>Pulse Quests</h4>
        <div className="spotlight-row">
          <span>Streak</span>
          <strong>{streak.current}d (best {streak.best}d)</strong>
        </div>
        {questCards.map((quest) => (
          <div key={quest.name} className="quest-row">
            <span>{quest.name}</span>
            <strong>{quest.value}/{quest.max}</strong>
            <div className="quest-bar">
              <i style={{ width: `${(quest.value / quest.max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="share-stream-list">
        {recent.length === 0 && <p className="wall-empty">No live shares yet.</p>}
        {recent.map((post) => {
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
              <span className="owner-badge">Owner {post.currentOwnerUserId === post.userId ? 'Creator' : 'Relay'}</span>
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
              <button type="button" className="vibe-btn" onClick={() => reactToFreedomPost(post.id, 'real')}>
                <span>Real</span>
                <strong>{post.vibeCounts.real ?? 0}</strong>
              </button>
              <button type="button" className="vibe-btn" onClick={() => reactToFreedomPost(post.id, 'w')}>
                <span>W</span>
                <strong>{post.vibeCounts.w ?? 0}</strong>
              </button>
            </div>
            {!hasSeen && (
              <button type="button" className="witness-btn" onClick={() => viewFreedomPost(post.id)}>
                Witness
              </button>
            )}
          </motion.article>
          );
        })}
      </div>
    </aside>
  );
}
