import { useState } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';

export function Login() {
  const [username, setUsername] = useState('');
  const { login, connected } = useApp();

  return (
    <motion.div
      className="login-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        className="login-card"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
      >
        <motion.div
          className="login-icon"
          animate={{ opacity: [0.8, 1, 0.8] }}
          transition={{ repeat: Infinity, duration: 2.4, repeatDelay: 0.3 }}
        />
        <h1>Fchat Social Live</h1>
        <p>Jump in, share live thoughts, chat, and call with zero storage.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (username.trim()) login(username.trim());
          }}
        >
          <input
            type="text"
            placeholder="Your name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={32}
            autoFocus
          />
          <motion.button
            type="submit"
            disabled={!username.trim() || !connected}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {connected ? 'Join' : 'Connecting…'}
          </motion.button>
        </form>
        {!connected && (
          <motion.p className="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            Connecting to server…
          </motion.p>
        )}
      </motion.div>
    </motion.div>
  );
}
