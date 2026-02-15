import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';

const MAX_IMAGE_BYTES = 900_000;
const MAX_VIDEO_BYTES = 8_000_000;

export function FreedomWall() {
  const { currentUser, freedomPosts, users, activeDrop, postFreedom, viewFreedomPost, reactToFreedomPost, removeFreedomPost } = useApp();
  const onlineUserIds = new Set(users.map((u) => u.id));
  const vibes: Array<{ id: 'real' | 'wild' | 'deep' | 'w'; label: string }> = [
    { id: 'real', label: 'Real' },
    { id: 'wild', label: 'Wild' },
    { id: 'deep', label: 'Deep' },
    { id: 'w', label: 'W' },
  ];
  const [text, setText] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(undefined);
  const [videoDataUrl, setVideoDataUrl] = useState<string | undefined>(undefined);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [parentPostId, setParentPostId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const formatLeft = (expiresAt: number) => {
    const left = Math.max(0, expiresAt - now);
    const m = Math.floor(left / 60000);
    const s = Math.floor((left % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

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
    postFreedom({ text: trimmed, imageDataUrl, videoDataUrl, isAnonymous, parentPostId: parentPostId ?? undefined });
    setText('');
    setImageDataUrl(undefined);
    setVideoDataUrl(undefined);
    setParentPostId(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  return (
    <section className="freedom-wall">
      <div className="freedom-wall-header">
        <h3>Freedom Wall</h3>
        <span>Live, ephemeral, no DB</span>
      </div>
      {activeDrop && activeDrop.expiresAt > Date.now() && (
        <div className="drop-banner">
          <strong>Drop Event</strong>
          <span>{activeDrop.prompt}</span>
        </div>
      )}
      {parentPostId && (
        <div className="chain-banner">
          <span>Remixing chain from post #{parentPostId.slice(0, 5)}</span>
          <button type="button" onClick={() => setParentPostId(null)}>Cancel</button>
        </div>
      )}
      <form className="freedom-form" onSubmit={submit}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Share a thought..."
          maxLength={180}
        />
        <label className="upload-btn" htmlFor="wall-image-input">Image</label>
        <input
          id="wall-image-input"
          ref={imageInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => onPickImage(e.target.files?.[0])}
        />
        <label className="upload-btn" htmlFor="wall-video-input">Video</label>
        <input
          id="wall-video-input"
          ref={videoInputRef}
          type="file"
          accept="video/*"
          onChange={(e) => onPickVideo(e.target.files?.[0])}
        />
        <button type="submit">Drop</button>
      </form>
      <label className="anon-toggle">
        <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} />
        Ghost mode (hidden rep still tracked)
      </label>
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
        {freedomPosts.length === 0 && <p className="wall-empty">No live posts yet.</p>}
        {freedomPosts.map((post) => {
          const own = post.userId === currentUser?.id;
          const isOwner = post.currentOwnerUserId === currentUser?.id;
          const online = onlineUserIds.has(post.userId);
          const hasSeen = !!currentUser && post.viewerIds.includes(currentUser.id);
          return (
            <motion.article
              key={post.id}
              className={`wall-post ${own ? 'own' : ''}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <header>
                <div className="post-user">
                  <span className={`presence-dot ${online ? 'online' : 'offline'}`} />
                  <strong>{post.username}</strong>
                  <span className="presence-label">{online ? 'online' : 'offline'}</span>
                </div>
                <div className="post-meta">
                  <span className={`owner-badge ${isOwner ? 'mine' : ''}`}>
                    Owner {post.currentOwnerUserId === post.userId ? 'Creator' : 'Relay'}
                  </span>
                  <span className="owner-badge">Depth {post.chainDepth ?? 0}</span>
                  <span className="owner-badge">Contrib {post.contributors?.length ?? 1}</span>
                  {post.dropId && <span className="owner-badge">Drop {activeDrop && post.dropId === activeDrop.id ? formatLeft(activeDrop.expiresAt) : ''}</span>}
                  {post.isAnonymous && <span className="owner-badge">Anon Rep {post.anonReputation ?? 0}</span>}
                  {post.firstWitnessUserId ? <span className="owner-badge">First Witness Locked</span> : <span className="owner-badge">First Witness Open</span>}
                  <span className="pulse-chip">Pulse {post.pulseCount}</span>
                  <time>{new Date(post.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
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
                    onClick={() => reactToFreedomPost(post.id, vibe.id)}
                  >
                    <span>{vibe.label}</span>
                    <strong>{post.vibeCounts[vibe.id] ?? 0}</strong>
                  </button>
                ))}
              </div>
              {!hasSeen && (
                <button type="button" className="witness-btn" onClick={() => viewFreedomPost(post.id)}>
                  Witness Pulse
                </button>
              )}
              <button type="button" className="witness-btn" onClick={() => setParentPostId(post.id)}>
                Remix Chain
              </button>
              {own && (
                <button type="button" className="wall-delete" onClick={() => removeFreedomPost(post.id)}>
                  Delete
                </button>
              )}
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}
