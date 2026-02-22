import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';

export function ConfessionsPage() {
  const { currentUser, confessions, postConfession, replyConfession, removeConfession } = useApp();
  const [text, setText] = useState('');
  const [anonymous, setAnonymous] = useState(true);
  const [replyByConfessionId, setReplyByConfessionId] = useState<Record<string, string>>({});
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const ordered = useMemo(
    () => [...confessions].sort((a, b) => b.createdAt - a.createdAt),
    [confessions],
  );

  const formatExpiresIn = (expiresAt: number) => {
    const left = Math.max(0, expiresAt - now);
    const totalMinutes = Math.floor(left / 60_000);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `Expires in ${h}h ${m}m`;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    postConfession(text, anonymous);
    setText('');
  };

  const submitReply = (confessionId: string) => {
    const text = replyByConfessionId[confessionId]?.trim();
    if (!text) return;
    replyConfession(confessionId, text);
    setReplyByConfessionId((prev) => ({ ...prev, [confessionId]: '' }));
  };

  return (
    <section className="confessions-page">
      <header className="conf-head">
        <h3>Confessions</h3>
        <span>Speak freely, accountability stays hidden</span>
      </header>
      <form className="conf-form" onSubmit={submit}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type your confession..."
          maxLength={400}
        />
        <div className="conf-controls">
          <label className="anon-toggle">
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
            Ghost mode
          </label>
          <button type="submit">Drop confession</button>
        </div>
      </form>
      <div className="conf-list">
        {ordered.length === 0 && <p className="wall-empty">No confessions yet.</p>}
        {ordered.map((item) => {
          const own = item.userId === currentUser?.id;
          return (
            <motion.article key={item.id} className={`conf-card ${own ? 'own' : ''}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <header>
                <strong>{item.isAnonymous ? 'Anon' : item.username}</strong>
                <span>Rep {item.anonReputation}</span>
                <time>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
              </header>
              <p>{item.text}</p>
              <p className="chain-line">{formatExpiresIn(item.expiresAt)}</p>
              <div className="conf-replies">
                {item.replies.map((reply) => (
                  <div key={reply.id} className="conf-reply">
                    <strong>Anon</strong>
                    <span>{reply.text}</span>
                  </div>
                ))}
              </div>
              <div className="conf-reply-form">
                <input
                  type="text"
                  value={replyByConfessionId[item.id] ?? ''}
                  onChange={(e) =>
                    setReplyByConfessionId((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                  placeholder="Reply anonymously..."
                  maxLength={220}
                />
                <button type="button" className="witness-btn" onClick={() => submitReply(item.id)}>
                  Reply
                </button>
              </div>
              {own && (
                <button type="button" className="wall-delete" onClick={() => removeConfession(item.id)}>
                  Delete confession
                </button>
              )}
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}
