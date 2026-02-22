import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AppProvider, useApp } from './context/AppContext';
import { CallProvider } from './hooks/useCall';
import { ChatList } from './components/ChatList';
import { ChatRoom } from './components/ChatRoom';
import { FreedomWall } from './components/FreedomWall';
import { LiveShareStream } from './components/LiveShareStream';
import { ConfessionsPage } from './components/ConfessionsPage';
import { AuraHuntPage } from './components/AuraHuntPage';
import { IncomingCall } from './components/IncomingCall';
import { ActiveCall } from './components/ActiveCall';
import { Onboarding } from './components/Onboarding';
import './App.css';

const ONBOARDING_KEY = 'pulsely_onboarded';

const isPhoneViewport = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(max-width: 640px)').matches ||
    window.matchMedia('(max-width: 820px) and (pointer: coarse)').matches);

function AppContent() {
  const { currentUser, logout, connected, incomingCall, activeCall, users, activeRoom, messages, nodeProfile, claimDailyNodeCharge } = useApp();
  const [view, setView] = useState<'chat' | 'wall' | 'confession' | 'hunt'>('chat');
  const [privacyShield, setPrivacyShield] = useState(false);
  const [isMobile, setIsMobile] = useState(isPhoneViewport);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [mobileUnread, setMobileUnread] = useState(0);
  const lastMessageIdRef = useRef<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(ONBOARDING_KEY) !== 'true';
  });

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

  useEffect(() => {
    const onResize = () => setIsMobile(isPhoneViewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setMobileChatOpen(false);
      setMobileUnread(0);
    }
  }, [isMobile]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;
    if (last.id === lastMessageIdRef.current) return;
    const incoming = last.userId !== currentUser?.id;
    if (isMobile && !mobileChatOpen && incoming) {
      setMobileUnread((value) => value + 1);
    }
    lastMessageIdRef.current = last.id;
  }, [messages, isMobile, mobileChatOpen, currentUser?.id]);

  if (!currentUser) return null;

  const today = new Date().toISOString().slice(0, 10);
  const canClaimDaily = !!nodeProfile && nodeProfile.lastDailyClaimDate !== today;
  const nodeEnergy = nodeProfile?.energy ?? 0;
  const skin =
    !nodeProfile ? 'Dormant' :
    nodeProfile.level >= 20 ? 'Nova' :
    nodeProfile.level >= 12 ? 'Flux' :
    nodeProfile.level >= 6 ? 'Neon' : 'Rookie';

  const completeOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setShowOnboarding(false);
  };

  return (
    <div className="app-layout">
      <header className="app-header">
        <span className="logo">PULSELY</span>
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
          <button type="button" className={view === 'hunt' ? 'active' : ''} onClick={() => setView('hunt')}>
            Aura Hunt
          </button>
        </div>
        <div className="header-right">
          {nodeProfile && (
            <div className="node-panel">
              <div className="node-row">
                <span className="node-pill">Node L{nodeProfile.level}</span>
                <span className={`node-skin skin-${skin.toLowerCase()}`}>{skin}</span>
                <span className="node-xp">{nodeProfile.xp} XP</span>
                <button type="button" className="charge-btn" onClick={claimDailyNodeCharge} disabled={!canClaimDaily}>
                  {canClaimDaily ? 'Daily Charge' : 'Charged'}
                </button>
              </div>
              <div className="energy-track">
                <i style={{ width: `${nodeEnergy}%` }} />
              </div>
            </div>
          )}
          <span className="online-badge">{users.length} online</span>
          <span className={`status-dot ${connected ? 'online' : 'offline'}`} title={connected ? 'In the layer' : 'Signal lost'} />
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
                {isMobile ? (
                  <div className="chat-mobile-shell">
                    <LiveShareStream onPostPulse={() => setView('wall')} onOpenConfessions={() => setView('confession')} />
                    {activeRoom ? (
                      <button
                        type="button"
                        className="mobile-chat-fab"
                        onClick={() => {
                          setMobileChatOpen(true);
                          setMobileUnread(0);
                        }}
                      >
                        Chat
                        {mobileUnread > 0 && <span>{mobileUnread}</span>}
                      </button>
                    ) : (
                      <p className="mobile-chat-hint">Select a node to open chat.</p>
                    )}
                    <AnimatePresence>
                      {mobileChatOpen && (
                        <motion.div
                          className="mobile-chat-overlay"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          <motion.div
                            className="mobile-chat-window"
                            initial={{ y: 28, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 28, opacity: 0 }}
                          >
                            <button
                              type="button"
                              className="mobile-chat-close"
                              onClick={() => setMobileChatOpen(false)}
                            >
                              Close
                            </button>
                            <ChatRoom />
                          </motion.div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="chat-content-grid">
                    <ChatRoom />
                    <LiveShareStream onPostPulse={() => setView('wall')} onOpenConfessions={() => setView('confession')} />
                  </div>
                )}
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
          ) : view === 'confession' ? (
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
          ) : (
            <motion.div
              key="hunt-page"
              className="page-shell wall-page"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
            >
              <section className="wall-content">
                <AuraHuntPage />
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <div className="privacy-watermark" aria-hidden>
        PRIVATE LIVE SESSION - {currentUser.username}
      </div>
      {privacyShield && (
        <div className="privacy-shield">
          <div>Eyes on glass detected. Veil raised.</div>
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
      <AnimatePresence>
        {showOnboarding && <Onboarding onComplete={completeOnboarding} />}
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
