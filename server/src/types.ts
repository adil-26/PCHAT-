export interface User {
  id: string;
  username: string;
  socketId: string;
}

export interface Room {
  id: string;
  name: string;
  participantIds: string[];
}

export interface Message {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  text: string;
  at: number;
}

export interface CallSignalingPayload {
  type: 'offer' | 'answer' | 'ice';
  data: RTCSessionDescriptionInit | RTCIceCandidateInit;
}
