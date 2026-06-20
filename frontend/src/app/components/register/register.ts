import { Component, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AuthService, AuthResponse } from '../../services/auth.service';

@Component({
  selector: 'app-register',
  imports: [FormsModule],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class Register {
  @Output() registerSuccess = new EventEmitter<AuthResponse>();
  @Output() switchToLogin = new EventEmitter<void>();

  username = '';
  email = '';
  password = '';
  errorMessage = '';

  constructor(private authService: AuthService) {}

  register(): void {
    this.errorMessage = '';

    if (!this.username || !this.email || !this.password) {
      this.errorMessage = 'Username, email, and password are required';
      return;
    }

    this.authService.register(this.username, this.email, this.password).subscribe({
      next: (response) => {
        this.authService.saveAuthData(response);
        this.registerSuccess.emit(response);
      },
      error: (error) => {
        this.errorMessage = error.error?.message || 'Register failed';
      },
    });
  }
}
