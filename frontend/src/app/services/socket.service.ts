import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';

import { AuthService } from './auth.service';
import {
  ChatMessage,
  Conversation,
  MessageReadEvent,
  TypingEvent,
  UserStatusEvent,
} from '../models/chat.models';

@Injectable({
  providedIn: 'root',
})
export class SocketService {
  private socket: Socket | null = null;
  private readonly socketUrl = 'http://localhost:3000';
  private listenersBound = false;

  private readonly newMessageSubject = new Subject<ChatMessage>();
  private readonly conversationUpdatedSubject = new Subject<Conversation>();
  private readonly typingStartedSubject = new Subject<TypingEvent>();
  private readonly typingStoppedSubject = new Subject<TypingEvent>();
  private readonly userStatusSubject = new Subject<UserStatusEvent>();
  private readonly messageReadSubject = new Subject<MessageReadEvent>();
  private readonly connectionErrorSubject = new Subject<string>();

  readonly newMessage$ = this.newMessageSubject.asObservable();
  readonly conversationUpdated$ = this.conversationUpdatedSubject.asObservable();
  readonly typingStarted$ = this.typingStartedSubject.asObservable();
  readonly typingStopped$ = this.typingStoppedSubject.asObservable();
  readonly userStatus$ = this.userStatusSubject.asObservable();
  readonly messageRead$ = this.messageReadSubject.asObservable();
  readonly connectionError$ = this.connectionErrorSubject.asObservable();

  constructor(private authService: AuthService) {}

  connect(): void {
    const token = this.authService.getToken();

    if (!token || this.socket?.connected) {
      return;
    }

    this.socket = io(this.socketUrl, {
      auth: { token },
    });

    this.bindCoreListeners();
  }

  joinConversation(conversationId: string): void {
    this.socket?.emit('joinConversation', { conversationId });
  }

  leaveConversation(conversationId: string): void {
    this.socket?.emit('leaveConversation', { conversationId });
  }

  sendMessage(conversationId: string, text: string): void {
    this.socket?.emit('sendMessage', { conversationId, text });
  }

  startTyping(conversationId: string): void {
    this.socket?.emit('typingStart', { conversationId });
  }

  stopTyping(conversationId: string): void {
    this.socket?.emit('typingStop', { conversationId });
  }

  markMessageRead(conversationId: string, messageId: string): void {
    this.socket?.emit('markMessageRead', { conversationId, messageId });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.listenersBound = false;
  }

  private bindCoreListeners(): void {
    if (!this.socket || this.listenersBound) {
      return;
    }

    this.listenersBound = true;

    this.socket.on('newMessage', (message: ChatMessage) => {
      this.newMessageSubject.next(message);
    });

    this.socket.on('conversationUpdated', (conversation: Conversation) => {
      this.conversationUpdatedSubject.next(conversation);
    });

    this.socket.on('typingStarted', (event: TypingEvent) => {
      this.typingStartedSubject.next(event);
    });

    this.socket.on('typingStopped', (event: TypingEvent) => {
      this.typingStoppedSubject.next(event);
    });

    this.socket.on('userStatusChanged', (event: UserStatusEvent) => {
      this.userStatusSubject.next(event);
    });

    this.socket.on('messageRead', (event: MessageReadEvent) => {
      this.messageReadSubject.next(event);
    });

    this.socket.on('connect_error', (error) => {
      this.connectionErrorSubject.next(error.message);
    });
  }
}
