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
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ repeat: Infinity, duration: 2, repeatDelay: 1 }}
        >
          💬
        </motion.div>
        <h1>Realtime Messenger</h1>
        <p>Enter your name to start chatting and calling</p>
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
