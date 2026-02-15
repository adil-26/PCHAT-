import { useState } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';

export function ConfessionsPage() {
  const { currentUser, confessions, postConfession, removeConfession } = useApp();
  const [text, setText] = useState('');
  const [anonymous, setAnonymous] = useState(true);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    postConfession(text, anonymous);
    setText('');
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
        {confessions.length === 0 && <p className="wall-empty">No confessions yet.</p>}
        {confessions.map((item) => {
          const own = item.userId === currentUser?.id;
          return (
            <motion.article key={item.id} className={`conf-card ${own ? 'own' : ''}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <header>
                <strong>{item.isAnonymous ? 'Anon' : item.username}</strong>
                <span>Rep {item.anonReputation}</span>
                <time>{new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
              </header>
              <p>{item.text}</p>
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
