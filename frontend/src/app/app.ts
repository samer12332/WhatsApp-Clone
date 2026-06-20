import { Component, OnInit } from '@angular/core';

import { Login } from './components/login/login';
import { Register } from './components/register/register';
import { Chat } from './components/chat/chat';

import { AuthResponse, AuthService, AuthUser } from './services/auth.service';

type CurrentView = 'login' | 'register' | 'chat';

@Component({
  selector: 'app-root',
  imports: [Login, Register, Chat],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  currentView: CurrentView = 'login';
  currentUser: AuthUser | null = null;

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    if (this.authService.isLoggedIn()) {
      this.currentUser = this.authService.getUser();
      this.currentView = 'chat';

      this.authService.getCurrentUser().subscribe({
        next: (user) => {
          this.currentUser = user;
        },
        error: () => {
          this.logout();
        },
      });
    }
  }

  showLogin(): void {
    this.currentView = 'login';
  }

  showRegister(): void {
    this.currentView = 'register';
  }

  handleAuthSuccess(response: AuthResponse): void {
    this.currentUser = response.user;
    this.currentView = 'chat';
  }

  logout(): void {
    this.authService.logout();
    this.currentUser = null;
    this.currentView = 'login';
  }
}
