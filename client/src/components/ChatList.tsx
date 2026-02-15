import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { useCall } from '../hooks/useCall';
import type { User } from '../types';

export function ChatList() {
  const { users, rooms, activeRoom, currentUser, selectRoom, startChat } = useApp();
  const { startCall } = useCall();
  const peers = users.filter((u) => u.id !== currentUser?.id);

  const openOrStartChat = (peer: User) => {
    const existing = rooms.find(
      (r) => r.participantIds.includes(peer.id) && r.participantIds.includes(currentUser!.id)
    );
    if (existing) selectRoom(existing);
    else startChat(peer.id);
  };

  return (
    <div className="chat-list">
      <motion.h2 initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
        Chats
      </motion.h2>
      {rooms.length === 0 && peers.length > 0 && (
        <motion.p className="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          Select a user to start a chat
        </motion.p>
      )}
      <ul className="room-list">
        {rooms.map((room, i) => {
          const peerId = room.participantIds.find((id) => id !== currentUser?.id);
          const peer = users.find((u) => u.id === peerId);
          const name = peer?.username ?? 'Unknown';
          const isActive = activeRoom?.id === room.id;
          return (
            <motion.li
              key={room.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * i }}
              className={isActive ? 'active' : ''}
            >
              <button type="button" className="room-btn" onClick={() => selectRoom(room)}>
                <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>
                <span className="name">{name}</span>
              </button>
            </motion.li>
          );
        })}
      </ul>
      <h3>Online users</h3>
      <ul className="user-list">
        {peers.map((peer, i) => (
          <motion.li
            key={peer.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
          >
            <div className="user-row">
              <span className="avatar">{peer.username.slice(0, 1).toUpperCase()}</span>
              <span className="name">{peer.username}</span>
              <div className="actions">
                <button
                  type="button"
                  className="icon-btn"
                  title="Start chat"
                  onClick={() => openOrStartChat(peer)}
                >
                  Chat
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title="Voice call"
                  onClick={() => startCall(peer.id, 'audio')}
                >
                  Audio
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title="Video call"
                  onClick={() => startCall(peer.id, 'video')}
                >
                  Video
                </button>
              </div>
            </div>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
