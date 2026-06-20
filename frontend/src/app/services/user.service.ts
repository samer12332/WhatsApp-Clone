import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';

import { ChatUser } from '../models/chat.models';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private readonly apiUrl = 'http://localhost:3000/api/chat';

  constructor(private http: HttpClient) {}

  getUsers(): Observable<ChatUser[]> {
    return this.http
      .get<{ users: ChatUser[] }>(`${this.apiUrl}/users`)
      .pipe(map((response) => response.users));
  }
}
