import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import type { WallScope, WallTag, WallVibe } from '../types';

const MAX_IMAGE_BYTES = 900_000;
const MAX_VIDEO_BYTES = 8_000_000;

export function FreedomWall() {
  const {
    currentUser,
    freedomPosts,
    users,
    activeDrop,
    postFreedom,
    viewFreedomPost,
    reactToFreedomPost,
    removeFreedomPost,
    reportFreedomPost,
    blockedNodeIds,
    questProgress,
  } = useApp();
  const onlineUserIds = new Set(users.map((u) => u.id));
  const tags: WallTag[] = ['Crush', 'Hostel', 'Exam', 'Drama', 'Placement'];
  const scopes: WallScope[] = ['global', 'local'];
  const tagHints: Record<WallTag, string> = {
    Crush: 'Romance, feelings, and hidden love stories.',
    Hostel: 'Hostel life updates, moments, and chaos.',
    Exam: 'Exam stress, prep notes, and deadline panic.',
    Drama: 'Campus incidents, social tension, and tea.',
    Placement: 'Internship/job hunt updates and prep talk.',
  };
  const scopeHints: Record<WallScope, string> = {
    global: 'Visible to everyone in the live layer.',
    local: 'Visible in local stream context.',
  };
  const vibeHints: Record<WallVibe, string> = {
    calm: 'Steady, peaceful energy.',
    chaos: 'Wild, loud, unpredictable mood.',
    deep: 'Thoughtful, heavy, introspective vibe.',
    funny: 'Light, playful, meme energy.',
  };
  const vibes: Array<{ id: WallVibe; label: string }> = [
    { id: 'calm', label: 'Calm' },
    { id: 'chaos', label: 'Chaos' },
    { id: 'deep', label: 'Deep' },
    { id: 'funny', label: 'Funny' },
  ];
  const [text, setText] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(undefined);
  const [videoDataUrl, setVideoDataUrl] = useState<string | undefined>(undefined);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [tag, setTag] = useState<WallTag>('Crush');
  const [scope, setScope] = useState<WallScope>('global');
  const [parentPostId, setParentPostId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dropFeedback, setDropFeedback] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const dropInputRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  const formatLeft = (expiresAt: number) => {
    const left = Math.max(0, expiresAt - now);
    const m = Math.floor(left / 60000);
    const s = Math.floor((left % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const visiblePosts = useMemo(
    () => freedomPosts.filter((post) => !blockedNodeIds.includes(post.userId)),
    [freedomPosts, blockedNodeIds],
  );

  const activeDropPulseCount = useMemo(() => {
    if (!activeDrop) return 0;
    return visiblePosts.filter((post) => post.dropId === activeDrop.id).length;
  }, [activeDrop, visiblePosts]);

  const loopHint = useMemo(() => {
    if (questProgress.postsCount < 1) return 'Drop one pulse to start today\'s cycle.';
    if (questProgress.vibesCount < 3) {
      const left = 3 - questProgress.vibesCount;
      return `Drop ${left} more vibe${left === 1 ? '' : 's'} to charge your node.`;
    }
    if (questProgress.witnessCount < 5) {
      const left = 5 - questProgress.witnessCount;
      return `Witness ${left} more pulse${left === 1 ? '' : 's'} to lock the loop.`;
    }
    return 'Cycle complete. Return for the next reset window.';
  }, [questProgress]);

  const onPickImage = (file?: File) => {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Only image files are allowed.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Image too large. Keep it under 900KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : undefined;
      setImageDataUrl(result);
    };
    reader.readAsDataURL(file);
  };

  const onPickVideo = (file?: File) => {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setError('Only video files are allowed.');
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError('Video too large. Keep it under 8MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : undefined;
      setVideoDataUrl(result);
    };
    reader.readAsDataURL(file);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed && !imageDataUrl && !videoDataUrl) return;
    postFreedom({ text: trimmed, imageDataUrl, videoDataUrl, isAnonymous, parentPostId: parentPostId ?? undefined, tag, scope });

    const afterDropHint =
      questProgress.vibesCount < 3
        ? 'Now tap vibes on other pulses to keep momentum.'
        : 'Now witness fresh pulses to complete your cycle.';
    setDropFeedback(`${scope === 'local' ? 'Local' : 'Global'} pulse dropped. ${afterDropHint}`);
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setDropFeedback(null), 2600);

    setText('');
    setImageDataUrl(undefined);
    setVideoDataUrl(undefined);
    setParentPostId(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
    if (videoInputRef.current) videoInputRef.current.value = '';
    dropInputRef.current?.focus();
  };

  return (
    <section className="freedom-wall">
      <div className="freedom-wall-header">
        <h3 title="Live post stream. Content exists in-memory and can reset.">Freedom Wall</h3>
        <span title="This wall is real-time and ephemeral.">Live, ephemeral, no DB</span>
      </div>
      <div className="freedom-legend">
        <span title="Pulse: a live post that exists right now.">Pulse</span>
        <span title="Vibe: reaction that shifts the room mood.">Vibe</span>
        <span title="Remix: continue someone else post as a chain.">Remix</span>
        <span title="Global/Local: choose who sees your drop.">Scope</span>
      </div>
      <section className="drop-composer">
        <div className="drop-composer-head">
          <div className="drop-event-copy">
            <strong title="Live prompt for the current wall cycle.">Drop Event</strong>
            <p>{activeDrop?.prompt ?? 'Share what the campus feels right now.'}</p>
          </div>
          <div className="drop-event-metrics">
            <span
              className={`drop-time-chip ${activeDrop && activeDrop.expiresAt > now ? 'live' : ''}`}
              title={activeDrop ? 'Time left in this event window.' : 'No active timed drop window.'}
            >
              {activeDrop && activeDrop.expiresAt > now ? `Closes ${formatLeft(activeDrop.expiresAt)}` : 'Standby'}
            </span>
            <small title="How many pulses are currently attached to this drop window.">
              {activeDrop ? `${activeDropPulseCount} active drops` : 'Waiting for next drop window'}
            </small>
          </div>
        </div>
        {parentPostId && (
          <div className="chain-banner">
            <span>Remixing chain from post #{parentPostId.slice(0, 5)}</span>
            <button type="button" title="Cancel chain remix mode." onClick={() => setParentPostId(null)}>Cancel</button>
          </div>
        )}
        <form className="freedom-form" onSubmit={submit}>
          <div className="drop-input-wrap">
            <textarea
              ref={dropInputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Share a thought..."
              maxLength={180}
              rows={3}
              className="drop-input"
              title="Write your pulse. Text, image, or video can be dropped."
            />
            <div className="drop-input-meta">
              <span title="Current composer mode.">
                {parentPostId ? 'Remix chain mode' : 'Fresh pulse mode'}
              </span>
              <strong title="Character limit for pulse text.">{text.trim().length}/180</strong>
            </div>
          </div>
          <div className="freedom-controls">
            <label className="upload-btn" htmlFor="wall-image-input" title="Attach one image (max 900KB).">Image</label>
            <input
              id="wall-image-input"
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => onPickImage(e.target.files?.[0])}
            />
            <label className="upload-btn" htmlFor="wall-video-input" title="Attach one video (max 8MB).">Video</label>
            <input
              id="wall-video-input"
              ref={videoInputRef}
              type="file"
              accept="video/*"
              onChange={(e) => onPickVideo(e.target.files?.[0])}
            />
            <select
              value={tag}
              onChange={(e) => setTag(e.target.value as WallTag)}
              className="tag-select"
              title={tagHints[tag]}
            >
              {tags.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as WallScope)}
              className="tag-select"
              title={scopeHints[scope]}
            >
              {scopes.map((item) => (
                <option key={item} value={item}>
                  {item === 'global' ? 'Global Drop' : 'Local Drop'}
                </option>
              ))}
            </select>
            <button type="submit" className="drop-submit-btn" title="Publish this pulse to the wall now.">
              Drop Pulse
            </button>
          </div>
        </form>
        <div className="drop-loop-row">
          <label className="anon-toggle" title="Hide author name; reputation still updates internally.">
            <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} />
            Ghost mode (hidden rep still tracked)
          </label>
          <span className="drop-loop-hint" title="Your next best action to complete the loop.">
            Next loop: {loopHint}
          </span>
        </div>
        {dropFeedback && (
          <motion.p
            className="drop-feedback"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {dropFeedback}
          </motion.p>
        )}
      </section>
      {error && <p className="wall-error">{error}</p>}
      {imageDataUrl && (
        <div className="wall-preview">
          <img src={imageDataUrl} alt="preview" />
          <button type="button" onClick={() => setImageDataUrl(undefined)}>Remove image</button>
        </div>
      )}
      {videoDataUrl && (
        <div className="wall-preview">
          <video
            className="media-video"
            src={videoDataUrl}
            muted
            controls
            controlsList="nodownload noplaybackrate"
            disablePictureInPicture
            playsInline
            preload="metadata"
          />
          <button type="button" onClick={() => setVideoDataUrl(undefined)}>Remove video</button>
        </div>
      )}

      <div className="wall-feed">
        {visiblePosts.length === 0 && (
          <article className="wall-empty-card">
            <p className="wall-empty-title">Be the first to drop a Pulse.</p>
            <p className="wall-empty">Nothing is pinned forever here. Start the moment.</p>
            <button type="button" className="empty-btn" onClick={() => dropInputRef.current?.focus()}>
              Drop First Pulse
            </button>
          </article>
        )}
        {visiblePosts.map((post) => {
          const own = post.userId === currentUser?.id;
          const isOwner = post.currentOwnerUserId === currentUser?.id;
          const online = onlineUserIds.has(post.userId);
          const hasSeen = !!currentUser && post.viewerIds.includes(currentUser.id);
          const scope = post.scope ?? 'global';
          const hasMedia = !!post.imageDataUrl || !!post.videoDataUrl;
          return (
            <motion.article
              key={post.id}
              className={`wall-post ${own ? 'own' : ''} ${hasMedia ? 'has-media' : ''}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <header>
                <div className="post-user">
                  <span className={`presence-dot ${online ? 'online' : 'offline'}`} />
                  <strong>{post.username}</strong>
                  <span className="presence-label">{online ? 'online' : 'offline'}</span>
                </div>
                <div className="post-header-meta">
                  <div className="post-meta post-meta-primary">
                    {post.tag && <span className="owner-badge" title={tagHints[post.tag]}>Tag {post.tag}</span>}
                    <span className={`owner-badge scope-badge ${scope === 'local' ? 'local' : 'global'}`} title={scopeHints[scope]}>
                      {scope.toUpperCase()}
                    </span>
                    <span
                      className={`owner-badge ${isOwner ? 'mine' : ''}`}
                      title={post.currentOwnerUserId === post.userId ? 'Post still with creator.' : 'Ownership relayed by interaction.'}
                    >
                      Owner {post.currentOwnerUserId === post.userId ? 'Creator' : 'Relay'}
                    </span>
                    <span className="pulse-chip" title="Pulse count increases as this post is witnessed/interacted.">Pulse {post.pulseCount}</span>
                    <time title="Post timestamp">{new Date(post.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                  </div>
                  <div className="post-meta post-meta-secondary">
                    <span className="owner-badge" title="How many remix levels deep this chain is.">Depth {post.chainDepth ?? 0}</span>
                    <span className="owner-badge" title="Unique contributors in this chain.">Contrib {post.contributors?.length ?? 1}</span>
                    {post.dropId && (
                      <span className="owner-badge" title="Remaining time for linked drop event.">
                        Drop {activeDrop && post.dropId === activeDrop.id ? formatLeft(activeDrop.expiresAt) : ''}
                      </span>
                    )}
                    {post.isAnonymous && (
                      <span className="owner-badge" title="Hidden trust signal in anonymous mode.">
                        Anon Rep {post.anonReputation ?? 0}
                      </span>
                    )}
                    {post.firstWitnessUserId ? (
                      <span className="owner-badge" title="First witness already captured for this pulse.">First Witness Locked</span>
                    ) : (
                      <span className="owner-badge" title="First witness slot still open.">First Witness Open</span>
                    )}
                  </div>
                </div>
              </header>
              {post.text && <p>{post.text}</p>}
              {post.contributors && post.contributors.length > 1 && (
                <p className="chain-line">Top contributors: {post.contributors.slice(0, 3).join(', ')}</p>
              )}
              {post.imageDataUrl && <img src={post.imageDataUrl} alt="shared" />}
              {post.videoDataUrl && (
                <video
                  className="media-video"
                  src={post.videoDataUrl}
                  controls
                  controlsList="nodownload noplaybackrate"
                  disablePictureInPicture
                  playsInline
                  preload="metadata"
                />
              )}
              <div className="vibe-row">
                {vibes.map((vibe) => (
                  <button
                    key={vibe.id}
                    type="button"
                    className="vibe-btn"
                    title={vibeHints[vibe.id]}
                    onClick={() => reactToFreedomPost(post.id, vibe.id)}
                  >
                    <span>{vibe.label}</span>
                    <strong>{post.vibeCounts[vibe.id] ?? 0}</strong>
                  </button>
                ))}
              </div>
              <div className="wall-actions">
                {!hasSeen && (
                  <button
                    type="button"
                    className="witness-btn"
                    title="Mark this pulse as witnessed and progress your quest."
                    onClick={() => viewFreedomPost(post.id)}
                  >
                    Witness Pulse
                  </button>
                )}
                <button
                  type="button"
                  className="witness-btn"
                  title="Create a linked follow-up pulse from this post."
                  onClick={() => setParentPostId(post.id)}
                >
                  Remix Chain
                </button>
                {!own && (
                  <button
                    type="button"
                    className="wall-delete"
                    title="Report this post for moderation review."
                    onClick={() => reportFreedomPost(post.id, 'community-report')}
                  >
                    Report
                  </button>
                )}
                {own && (
                  <button
                    type="button"
                    className="wall-delete"
                    title="Remove your post from the live wall."
                    onClick={() => removeFreedomPost(post.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}
