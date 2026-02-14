import { AnimatePresence } from 'framer-motion';
import { AppProvider, useApp } from './context/AppContext';
import { useCall } from './hooks/useCall';
import { Login } from './components/Login';
import { ChatList } from './components/ChatList';
import { ChatRoom } from './components/ChatRoom';
import { IncomingCall } from './components/IncomingCall';
import { ActiveCall } from './components/ActiveCall';
import './App.css';

function AppContent() {
  const { currentUser, logout, connected, incomingCall, activeCall } = useApp();
  useCall(); // register call listeners

  if (!currentUser) {
    return <Login />;
  }

  return (
    <div className="app-layout">
      <header className="app-header">
        <span className="logo">Realtime Messenger</span>
        <div className="header-right">
          <span className={`status-dot ${connected ? 'online' : 'offline'}`} title={connected ? 'Connected' : 'Disconnected'} />
          <span className="username">{currentUser.username}</span>
          <button type="button" className="logout-btn" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      <main className="app-main">
        <aside className="sidebar">
          <ChatList />
        </aside>
        <section className="content">
          <ChatRoom />
        </section>
      </main>
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
      <AppContent />
    </AppProvider>
  );
}
