export interface ChatUser {
  _id: string;
  username: string;
  email: string;
  avatar?: string;
  onlineStatus?: boolean;
  lastSeen?: string;
}

export interface ChatMessage {
  _id: string;
  conversation: string;
  sender: ChatUser;
  text: string;
  messageType: 'text';
  readBy: ChatUser[];
  deliveredTo: ChatUser[];
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  _id: string;
  type: 'private' | 'group';
  name: string;
  members: ChatUser[];
  admins: ChatUser[];
  lastMessage: ChatMessage | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserStatusEvent {
  userId: string;
  onlineStatus: boolean;
  lastSeen: string;
}

export interface TypingEvent {
  conversationId: string;
  userId: string;
  username?: string;
}

export interface MessageReadEvent {
  conversationId: string;
  messageId: string;
  userId: string;
}
