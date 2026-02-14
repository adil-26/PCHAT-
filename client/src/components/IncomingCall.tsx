import { motion } from 'framer-motion';
import { useCall } from '../hooks/useCall';

interface IncomingCallProps {
  fromUserId: string;
  fromUsername: string;
  type: 'audio' | 'video';
}

export function IncomingCall({ fromUserId, fromUsername, type }: IncomingCallProps) {
  const { acceptCall, rejectCall } = useCall();

  return (
    <motion.div
      className="incoming-call-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="incoming-call-card"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300 }}
      >
        <motion.div
          className="call-icon"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        >
          {type === 'video' ? '📹' : '📞'}
        </motion.div>
        <p className="call-type">{type === 'video' ? 'Video' : 'Voice'} call</p>
        <p className="caller-name">{fromUsername}</p>
        <div className="call-actions">
          <motion.button
            type="button"
            className="accept"
            onClick={() => acceptCall(fromUserId, type)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Accept
          </motion.button>
          <motion.button
            type="button"
            className="reject"
            onClick={() => rejectCall(fromUserId)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Decline
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
