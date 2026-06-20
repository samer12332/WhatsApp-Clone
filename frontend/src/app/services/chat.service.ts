import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';

import { ChatMessage, Conversation } from '../models/chat.models';

@Injectable({
  providedIn: 'root',
})
export class ChatService {
  private readonly apiUrl = 'http://localhost:3000/api/chat';

  constructor(private http: HttpClient) {}

  getConversations(): Observable<Conversation[]> {
    return this.http
      .get<{ conversations: Conversation[] }>(`${this.apiUrl}/conversations`)
      .pipe(map((response) => response.conversations));
  }

  getMessages(conversationId: string): Observable<ChatMessage[]> {
    return this.http
      .get<{ messages: ChatMessage[] }>(`${this.apiUrl}/conversations/${conversationId}/messages`)
      .pipe(map((response) => response.messages));
  }

  getOrCreatePrivateConversation(userId: string): Observable<Conversation> {
    return this.http
      .post<{ conversation: Conversation }>(`${this.apiUrl}/conversations/private`, { userId })
      .pipe(map((response) => response.conversation));
  }

  createGroupConversation(name: string, memberIds: string[]): Observable<Conversation> {
    return this.http
      .post<{ conversation: Conversation }>(`${this.apiUrl}/conversations/group`, {
        name,
        memberIds,
      })
      .pipe(map((response) => response.conversation));
  }

  renameGroup(conversationId: string, name: string): Observable<Conversation> {
    return this.http
      .patch<{ conversation: Conversation }>(`${this.apiUrl}/conversations/${conversationId}/name`, {
        name,
      })
      .pipe(map((response) => response.conversation));
  }

  addMembers(conversationId: string, memberIds: string[]): Observable<Conversation> {
    return this.http
      .patch<{ conversation: Conversation }>(
        `${this.apiUrl}/conversations/${conversationId}/members`,
        { memberIds },
      )
      .pipe(map((response) => response.conversation));
  }

  removeMember(conversationId: string, memberId: string): Observable<Conversation> {
    return this.http
      .delete<{ conversation: Conversation }>(
        `${this.apiUrl}/conversations/${conversationId}/members/${memberId}`,
      )
      .pipe(map((response) => response.conversation));
  }

  leaveGroup(conversationId: string): Observable<{ deletedConversationId?: string; conversation?: Conversation }> {
    return this.http.post<{ deletedConversationId?: string; conversation?: Conversation }>(
      `${this.apiUrl}/conversations/${conversationId}/leave`,
      {},
    );
  }
}
