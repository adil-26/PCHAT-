import { useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../context/AppContext';
import type { Message } from '../types';

function MessageBubble({
  msg,
  isOwn,
  status,
}: {
  msg: Message;
  isOwn: boolean;
  status?: 'Sent' | 'Delivered' | 'Seen';
}) {
  return (
    <motion.div
      className={`message-bubble ${isOwn ? 'own' : 'other'}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {!isOwn && <span className="sender">{msg.username}</span>}
      <span className="text">{msg.text}</span>
      <span className="time">
        {new Date(msg.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
      {isOwn && status && <span className="delivery-state">{status}</span>}
    </motion.div>
  );
}

export function ChatRoom() {
  const {
    activeRoom,
    messages,
    currentUser,
    sendMessage,
    users,
    typingByRoom,
    seenByRoom,
    setTyping,
    markRoomSeen,
  } = useApp();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typingStopTimerRef = useRef<number | null>(null);

  const peerId =
    activeRoom && currentUser
      ? activeRoom.participantIds.find((id) => id !== currentUser.id) ?? null
      : null;

  const peerName =
    activeRoom && currentUser
      ? users.find((u) => u.id === peerId)?.username ?? 'Unknown'
      : '';

  const isPeerOnline = !!peerId && users.some((u) => u.id === peerId);

  const seenMessageId = activeRoom ? seenByRoom[activeRoom.id]?.messageId : undefined;
  const seenIndex = useMemo(
    () => (seenMessageId ? messages.findIndex((m) => m.id === seenMessageId) : -1),
    [messages, seenMessageId],
  );

  const peerTyping = useMemo(() => {
    if (!activeRoom || !peerId) return false;
    const t = typingByRoom[activeRoom.id];
    if (!t) return false;
    if (t.userId !== peerId) return false;
    return Date.now() - t.at < 4000 && t.isTyping;
  }, [activeRoom, peerId, typingByRoom]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, peerTyping]);

  useEffect(() => {
    if (!activeRoom || !currentUser) return;
    const lastPeerMessage = [...messages].reverse().find((m) => m.userId !== currentUser.id);
    if (!lastPeerMessage) return;
    markRoomSeen(activeRoom.id, lastPeerMessage.id);
  }, [activeRoom, messages, currentUser, markRoomSeen]);

  useEffect(() => {
    return () => {
      if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
      if (activeRoom) setTyping(activeRoom.id, false);
    };
  }, [activeRoom, setTyping]);

  if (!activeRoom) {
    return (
      <motion.div
        className="chat-room empty"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <p>Select a chat or start one with an online user</p>
      </motion.div>
    );
  }

  const submitCurrentMessage = () => {
    const text = inputRef.current?.value?.trim();
    if (!text) return;
    sendMessage(text);
    if (inputRef.current) inputRef.current.value = '';
    setTyping(activeRoom.id, false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitCurrentMessage();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitCurrentMessage();
    }
  };

  const handleTyping = () => {
    setTyping(activeRoom.id, true);
    if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = window.setTimeout(() => {
      setTyping(activeRoom.id, false);
    }, 1200);
  };

  return (
    <motion.div
      className="chat-room"
      key={activeRoom.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="chat-header">
        <span className="avatar">{peerName.slice(0, 1).toUpperCase()}</span>
        <span className="peer-name">{peerName}</span>
        {peerTyping && <span className="typing-pill">typing...</span>}
      </div>
      <div className="messages" ref={listRef}>
        <AnimatePresence initial={false}>
          {messages.map((msg, idx) => {
            const isOwn = msg.userId === currentUser?.id;
            let status: 'Sent' | 'Delivered' | 'Seen' | undefined;
            if (isOwn) {
              if (seenIndex >= idx && seenIndex !== -1) status = 'Seen';
              else if (isPeerOnline) status = 'Delivered';
              else status = 'Sent';
            }
            return <MessageBubble key={msg.id} msg={msg} isOwn={isOwn} status={status} />;
          })}
        </AnimatePresence>
      </div>
      <form className="input-row" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          className="message-input"
          placeholder="Type a message..."
          rows={1}
          onKeyDown={handleKeyDown}
          onChange={handleTyping}
        />
        <motion.button type="submit" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          Send
        </motion.button>
      </form>
    </motion.div>
  );
}
