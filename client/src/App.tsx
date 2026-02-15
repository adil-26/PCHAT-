import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AppProvider, useApp } from './context/AppContext';
import { CallProvider } from './hooks/useCall';
import { Login } from './components/Login';
import { ChatList } from './components/ChatList';
import { ChatRoom } from './components/ChatRoom';
import { FreedomWall } from './components/FreedomWall';
import { LiveShareStream } from './components/LiveShareStream';
import { ConfessionsPage } from './components/ConfessionsPage';
import { IncomingCall } from './components/IncomingCall';
import { ActiveCall } from './components/ActiveCall';
import './App.css';

function AppContent() {
  const { currentUser, logout, connected, incomingCall, activeCall, users } = useApp();
  const [view, setView] = useState<'chat' | 'wall' | 'confession'>('chat');
  const [privacyShield, setPrivacyShield] = useState(false);

  useEffect(() => {
    const onPrintScreen = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') {
        setPrivacyShield(true);
        window.setTimeout(() => setPrivacyShield(false), 2400);
      }
    };
    const disableContext = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('keydown', onPrintScreen);
    document.addEventListener('contextmenu', disableContext);
    return () => {
      document.removeEventListener('keydown', onPrintScreen);
      document.removeEventListener('contextmenu', disableContext);
    };
  }, []);

  if (!currentUser) {
    return <Login />;
  }

  return (
    <div className="app-layout">
      <header className="app-header">
        <span className="logo">Fchat Network</span>
        <div className="view-tabs">
          <button type="button" className={view === 'chat' ? 'active' : ''} onClick={() => setView('chat')}>
            Chat Ops
          </button>
          <button type="button" className={view === 'wall' ? 'active' : ''} onClick={() => setView('wall')}>
            Freedom Wall
          </button>
          <button type="button" className={view === 'confession' ? 'active' : ''} onClick={() => setView('confession')}>
            Confessions
          </button>
        </div>
        <div className="header-right">
          <span className="online-badge">{users.length} online</span>
          <span className={`status-dot ${connected ? 'online' : 'offline'}`} title={connected ? 'Connected' : 'Disconnected'} />
          <span className="username">{currentUser.username}</span>
          <button type="button" className="logout-btn" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      <main className="app-main">
        <AnimatePresence mode="wait">
          {view === 'chat' ? (
            <motion.div
              key="chat-page"
              className="page-shell chat-page"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
            >
              <aside className="sidebar">
                <ChatList />
              </aside>
              <section className="content">
                <div className="chat-content-grid">
                  <ChatRoom />
                  <LiveShareStream />
                </div>
              </section>
            </motion.div>
          ) : view === 'wall' ? (
            <motion.div
              key="wall-page"
              className="page-shell wall-page"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
            >
              <section className="wall-content">
                <FreedomWall />
              </section>
            </motion.div>
          ) : (
            <motion.div
              key="confession-page"
              className="page-shell wall-page"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
            >
              <section className="wall-content">
                <ConfessionsPage />
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <div className="privacy-watermark" aria-hidden>
        PRIVATE LIVE SESSION · {currentUser.username}
      </div>
      {privacyShield && (
        <div className="privacy-shield">
          <div>Screen capture detected. Protected mode enabled.</div>
        </div>
      )}
      <AnimatePresence>
        {incomingCall && (
          <IncomingCall
            key={incomingCall.fromUserId}
            fromUserId={incomingCall.fromUserId}
            fromUsername={incomingCall.fromUsername}
            type={incomingCall.type}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {activeCall && (
          <ActiveCall
            key={activeCall.peerUserId}
            peerUserId={activeCall.peerUserId}
            type={activeCall.type}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <CallProvider>
        <AppContent />
      </CallProvider>
    </AppProvider>
  );
}
