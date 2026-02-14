import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../context/AppContext';
import type { Message } from '../types';

function MessageBubble({ msg, isOwn }: { msg: Message; isOwn: boolean }) {
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
    </motion.div>
  );
}

export function ChatRoom() {
  const { activeRoom, messages, currentUser, sendMessage, users } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const peerName =
    activeRoom && currentUser
      ? users.find((u) => u.id === activeRoom.participantIds.find((id) => id !== currentUser.id))?.username ?? 'Unknown'
      : '';

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputRef.current?.value?.trim();
    if (text) {
      sendMessage(text);
      if (inputRef.current) inputRef.current.value = '';
    }
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
      </div>
      <div className="messages" ref={listRef}>
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} isOwn={msg.userId === currentUser?.id} />
          ))}
        </AnimatePresence>
      </div>
      <form className="input-row" onSubmit={handleSubmit}>
        <input ref={inputRef} type="text" placeholder="Type a message…" autoComplete="off" />
        <motion.button type="submit" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          Send
        </motion.button>
      </form>
    </motion.div>
  );
}
