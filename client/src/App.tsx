import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
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
const MAX_NOTIFICATIONS = 40;
const XP_PER_LEVEL = 120;

type AlertKind = 'chat' | 'pulse' | 'confession' | 'hunt' | 'call' | 'system';

type AppNotification = {
  id: string;
  kind: AlertKind;
  title: string;
  body: string;
  at: number;
  read: boolean;
};

const isPhoneViewport = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(max-width: 820px)').matches;

function AppContent() {
  const {
    currentUser,
    logout,
    connected,
    incomingCall,
    activeCall,
    users,
    activeRoom,
    messages,
    freedomPosts,
    confessions,
    incomingBorrowRequests,
    nodeProfile,
    claimDailyNodeCharge,
  } = useApp();
  const [view, setView] = useState<'chat' | 'wall' | 'confession' | 'hunt'>('chat');
  const [privacyShield, setPrivacyShield] = useState(false);
  const [isMobile, setIsMobile] = useState(isPhoneViewport);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [mobileUnread, setMobileUnread] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [dropLogOpen, setDropLogOpen] = useState(false);
  const [dropLogUnread, setDropLogUnread] = useState(0);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });
  const lastMessageIdRef = useRef<string | null>(null);
  const currentRoomRef = useRef<string | null>(null);
  const knownPulseIdsRef = useRef<Set<string>>(new Set());
  const pulseHydratedRef = useRef(false);
  const knownConfessionIdsRef = useRef<Set<string>>(new Set());
  const confessionHydratedRef = useRef(false);
  const knownBorrowRequestKeysRef = useRef<Set<string>>(new Set());
  const borrowHydratedRef = useRef(false);
  const lastIncomingCallKeyRef = useRef<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(ONBOARDING_KEY) !== 'true';
  });

  const pushNotification = useCallback(
    (
      kind: AlertKind,
      title: string,
      body: string,
      options?: { browser?: boolean },
    ) => {
      const at = Date.now();
      const id = `${at}_${Math.random().toString(36).slice(2, 8)}`;
      setNotifications((items) =>
        [{ id, kind, title, body, at, read: false }, ...items].slice(0, MAX_NOTIFICATIONS),
      );

      if (options?.browser === false) return;
      if (notificationPermission !== 'granted') return;
      if (typeof window === 'undefined' || !('Notification' in window)) return;
      if (document.visibilityState === 'visible') return;

      try {
        const browserNote = new Notification(title, { body });
        window.setTimeout(() => browserNote.close(), 4600);
      } catch {
        // Ignore Notification API runtime errors.
      }
    },
    [notificationPermission],
  );

  const requestBrowserAlerts = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === 'granted') {
        pushNotification('system', 'Alerts enabled', 'You will get notified when the layer moves.', {
          browser: false,
        });
      }
    } catch {
      setNotificationPermission('unsupported');
    }
  }, [pushNotification]);

  const toggleNotifications = useCallback(() => {
    setDropLogOpen(false);
    setNotificationsOpen((open) => {
      if (!open) {
        setNotifications((items) => items.map((item) => ({ ...item, read: true })));
      }
      return !open;
    });
  }, []);

  const toggleDropLog = useCallback(() => {
    setNotificationsOpen(false);
    setDropLogOpen((open) => {
      if (!open) setDropLogUnread(0);
      return !open;
    });
  }, []);

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
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const syncPermission = () => setNotificationPermission(Notification.permission);
    window.addEventListener('focus', syncPermission);
    document.addEventListener('visibilitychange', syncPermission);
    return () => {
      window.removeEventListener('focus', syncPermission);
      document.removeEventListener('visibilitychange', syncPermission);
    };
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setMobileChatOpen(false);
      setMobileUnread(0);
    }
  }, [isMobile]);

  useEffect(() => {
    const roomId = activeRoom?.id ?? null;
    if (currentRoomRef.current !== roomId) {
      currentRoomRef.current = roomId;
      lastMessageIdRef.current = messages[messages.length - 1]?.id ?? null;
      return;
    }

    const last = messages[messages.length - 1];
    if (!last) return;
    if (last.id === lastMessageIdRef.current) return;
    const incoming = last.userId !== currentUser?.id;
    if (incoming) {
      if (isMobile && !mobileChatOpen) {
        setMobileUnread((value) => value + 1);
      }
      const chatFocused =
        view === 'chat' &&
        (!isMobile || mobileChatOpen) &&
        document.visibilityState === 'visible';
      if (!chatFocused) {
        pushNotification(
          'chat',
          `${last.username} sent a message`,
          last.text.length > 90 ? `${last.text.slice(0, 90)}...` : last.text,
        );
      }
    }
    lastMessageIdRef.current = last.id;
  }, [
    messages,
    activeRoom?.id,
    isMobile,
    mobileChatOpen,
    currentUser?.id,
    view,
    pushNotification,
  ]);

  useEffect(() => {
    if (!currentUser) return;

    if (!pulseHydratedRef.current) {
      knownPulseIdsRef.current = new Set(freedomPosts.map((post) => post.id));
      pulseHydratedRef.current = true;
      return;
    }

    let freshDrops = 0;
    for (const post of freedomPosts) {
      if (knownPulseIdsRef.current.has(post.id)) continue;
      knownPulseIdsRef.current.add(post.id);
      if (post.userId === currentUser.id) continue;
      freshDrops += 1;
    }
    if (freshDrops > 0 && !dropLogOpen) {
      setDropLogUnread((value) => Math.min(99, value + freshDrops));
    }
  }, [freedomPosts, currentUser, dropLogOpen]);

  useEffect(() => {
    if (!currentUser) return;

    if (!confessionHydratedRef.current) {
      knownConfessionIdsRef.current = new Set(confessions.map((item) => item.id));
      confessionHydratedRef.current = true;
      return;
    }

    for (const item of confessions) {
      if (knownConfessionIdsRef.current.has(item.id)) continue;
      knownConfessionIdsRef.current.add(item.id);
      if (item.userId === currentUser.id) continue;
      const author = item.isAnonymous ? 'Anon' : item.username ?? 'Node';
      pushNotification(
        'confession',
        `${author} dropped a confession`,
        item.text.slice(0, 90),
      );
    }
  }, [confessions, currentUser, pushNotification]);

  useEffect(() => {
    if (!currentUser) return;

    if (!borrowHydratedRef.current) {
      knownBorrowRequestKeysRef.current = new Set(
        incomingBorrowRequests.map((req) => `${req.zoneId}:${req.fromUserId}`),
      );
      borrowHydratedRef.current = true;
      return;
    }

    for (const req of incomingBorrowRequests) {
      const key = `${req.zoneId}:${req.fromUserId}`;
      if (knownBorrowRequestKeysRef.current.has(key)) continue;
      knownBorrowRequestKeysRef.current.add(key);
      if (req.fromUserId === currentUser.id) continue;
      pushNotification(
        'hunt',
        `${req.fromUsername} wants your aura`,
        'New borrow request in Aura Hunt.',
      );
    }
  }, [incomingBorrowRequests, currentUser, pushNotification]);

  useEffect(() => {
    if (!incomingCall) {
      lastIncomingCallKeyRef.current = null;
      return;
    }
    const callKey = `${incomingCall.fromUserId}:${incomingCall.type}`;
    if (lastIncomingCallKeyRef.current === callKey) return;
    lastIncomingCallKeyRef.current = callKey;
    pushNotification(
      'call',
      `${incomingCall.fromUsername} is calling`,
      incomingCall.type === 'video' ? 'Incoming video call.' : 'Incoming audio call.',
    );
  }, [incomingCall, pushNotification]);

  if (!currentUser) return null;

  const today = new Date().toISOString().slice(0, 10);
  const canClaimDaily = !!nodeProfile && nodeProfile.lastDailyClaimDate !== today;
  const nodeEnergy = nodeProfile?.energy ?? 0;
  const nodeLevel = nodeProfile?.level ?? 1;
  const nodeXp = nodeProfile?.xp ?? 0;
  const levelStartXp = Math.max(0, (nodeLevel - 1) * XP_PER_LEVEL);
  const xpIntoLevel = Math.max(0, nodeXp - levelStartXp);
  const xpToNextLevel = Math.max(0, nodeLevel * XP_PER_LEVEL - nodeXp);
  const levelProgressPct = Math.max(0, Math.min(100, (xpIntoLevel / XP_PER_LEVEL) * 100));
  const tier = !nodeProfile
    ? { name: 'Dormant', className: 'rookie', nextHint: 'Activate your node' }
    : nodeLevel >= 18
      ? { name: 'Nova', className: 'nova', nextHint: 'Max tier unlocked' }
      : nodeLevel >= 10
        ? { name: 'Flux', className: 'flux', nextHint: 'Nova unlocks at L18' }
        : nodeLevel >= 5
          ? { name: 'Neon', className: 'neon', nextHint: 'Flux unlocks at L10' }
          : { name: 'Rookie', className: 'rookie', nextHint: 'Neon unlocks at L5' };

  const completeOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setShowOnboarding(false);
  };

  const shouldRenderMobileChatOverlay =
    isMobile && view === 'chat' && typeof document !== 'undefined';
  const unreadNotifications = notifications.filter((item) => !item.read).length;
  const recentDrops = freedomPosts.slice(0, 60);

  return (
    <div className="app-layout">
      <header className="app-header">
        <span className="logo">PULSELY</span>
        <div className="view-tabs">
          <button
            type="button"
            className={view === 'chat' ? 'active' : ''}
            onClick={() => setView('chat')}
            title="Chat Ops: direct chat, calls, and live side stream."
          >
            Chat Ops
          </button>
          <button
            type="button"
            className={view === 'wall' ? 'active' : ''}
            onClick={() => setView('wall')}
            title="Freedom Wall: drop live pulses with text/image/video."
          >
            Freedom Wall
          </button>
          <button
            type="button"
            className={view === 'confession' ? 'active' : ''}
            onClick={() => setView('confession')}
            title="Confessions: anonymous thoughts with threaded replies."
          >
            Confessions
          </button>
          <button
            type="button"
            className={view === 'hunt' ? 'active' : ''}
            onClick={() => setView('hunt')}
            title="Aura Hunt: location loot, nearby hunters, and borrow flow."
          >
            Aura Hunt
          </button>
        </div>
        <div className="header-right">
          {nodeProfile && (
            <div className="node-panel">
              <div className="node-row">
                <span className="node-pill">Node L{nodeProfile.level}</span>
                <span className={`node-skin skin-${tier.className}`} title="Your current node rank tier.">{tier.name}</span>
                <span
                  className="node-xp"
                  title={`XP progress in current level: ${xpIntoLevel}/${XP_PER_LEVEL}`}
                >
                  {nodeXp} XP
                </span>
                <span className="node-next" title={`XP needed to reach Node L${nodeLevel + 1}.`}>
                  {xpToNextLevel} to L{nodeLevel + 1}
                </span>
                <span className="node-tier-next" title="Tier progression path for your node.">
                  {tier.nextHint}
                </span>
                <button
                  type="button"
                  className="charge-btn"
                  title="Claim one energy + XP boost each day."
                  onClick={claimDailyNodeCharge}
                  disabled={!canClaimDaily}
                >
                  {canClaimDaily ? 'Daily Charge' : 'Charged Today'}
                </button>
              </div>
              <div className="node-tracks">
                <div className="energy-track" title={`Energy ${Math.round(nodeEnergy)}%`}>
                  <i style={{ width: `${nodeEnergy}%` }} />
                </div>
                <div className="xp-track" title={`Level progress ${Math.round(levelProgressPct)}%`}>
                  <i style={{ width: `${levelProgressPct}%` }} />
                </div>
              </div>
            </div>
          )}
          <div className="notif-wrap">
            <button
              type="button"
              className={`notif-btn ${unreadNotifications > 0 ? 'has-unread' : ''}`}
              onClick={toggleNotifications}
              title="Alerts: chat, calls, confessions, and hunt updates."
            >
              Alerts
              {unreadNotifications > 0 && <span>{Math.min(unreadNotifications, 99)}</span>}
            </button>
            <AnimatePresence>
              {notificationsOpen && (
                <motion.section
                  className="notif-panel"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <header className="notif-panel-head">
                    <strong>Signal Log</strong>
                    <button
                      type="button"
                      className="notif-clear"
                      title="Clear all alerts in this panel."
                      onClick={() => setNotifications([])}
                    >
                      Clear
                    </button>
                  </header>
                  {notificationPermission !== 'granted' && notificationPermission !== 'unsupported' && (
                    <button
                      type="button"
                      className="notif-enable"
                      title="Allow browser push notifications when app is in background."
                      onClick={requestBrowserAlerts}
                    >
                      Enable Browser Alerts
                    </button>
                  )}
                  <div className="notif-list">
                    {notifications.length === 0 ? (
                      <p className="notif-empty">No new signals yet.</p>
                    ) : (
                      notifications.map((item) => (
                        <article key={item.id} className={`notif-item ${item.read ? '' : 'unread'}`}>
                          <div className="notif-meta">
                            <span className={`notif-kind kind-${item.kind}`}>{item.kind}</span>
                            <time>
                              {new Date(item.at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </time>
                          </div>
                          <strong>{item.title}</strong>
                          <p>{item.body}</p>
                        </article>
                      ))
                    )}
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
          </div>
          <div className="notif-wrap drop-log-wrap">
            <button
              type="button"
              className={`notif-btn ${dropLogUnread > 0 ? 'has-unread' : ''}`}
              onClick={toggleDropLog}
              title="Pulse Log: who dropped recent pulses."
            >
              Pulse Log
              {dropLogUnread > 0 && <span>{Math.min(dropLogUnread, 99)}</span>}
            </button>
            <AnimatePresence>
              {dropLogOpen && (
                <motion.section
                  className="notif-panel drop-log-panel"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <header className="notif-panel-head">
                    <strong>Pulse Log</strong>
                  </header>
                  <div className="notif-list">
                    {recentDrops.length === 0 ? (
                      <p className="notif-empty">No pulse drops yet.</p>
                    ) : (
                      recentDrops.map((post) => (
                        <article key={post.id} className="notif-item">
                          <div className="notif-meta">
                            <span className={`notif-kind kind-pulse ${(post.scope ?? 'global') === 'local' ? 'scope-local' : 'scope-global'}`}>
                              {(post.scope ?? 'global').toUpperCase()}
                            </span>
                            <time>
                              {new Date(post.at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </time>
                          </div>
                          <strong>{post.username} dropped a pulse</strong>
                          <p>
                            {post.text?.trim()
                              ? post.text.slice(0, 96)
                              : post.imageDataUrl || post.videoDataUrl
                                ? 'Media pulse dropped.'
                                : 'Live pulse dropped.'}
                          </p>
                        </article>
                      ))
                    )}
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
          </div>
          <span className="online-badge" title="Current online nodes in this live layer.">{users.length} online</span>
          <span className={`status-dot ${connected ? 'online' : 'offline'}`} title={connected ? 'In the layer' : 'Signal lost'} />
          <span className="username" title="Your current device-node identity.">{currentUser.username}</span>
          <button type="button" className="logout-btn" title="Reset session to a fresh node identity." onClick={logout}>
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
      {shouldRenderMobileChatOverlay &&
        createPortal(
          <AnimatePresence>
            {mobileChatOpen && (
              <motion.div
                className="mobile-chat-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMobileChatOpen(false)}
              >
                <motion.div
                  className="mobile-chat-window"
                  initial={{ y: 28, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 28, opacity: 0 }}
                  onClick={(event) => event.stopPropagation()}
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
          </AnimatePresence>,
          document.body
        )}
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
