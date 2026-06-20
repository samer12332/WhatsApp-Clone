import { Component, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AuthService, AuthResponse } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  @Output() loginSuccess = new EventEmitter<AuthResponse>();
  @Output() switchToRegister = new EventEmitter<void>();

  email = '';
  password = '';
  errorMessage = '';

  constructor(private authService: AuthService) {}

  login(): void {
    this.errorMessage = '';

    if (!this.email || !this.password) {
      this.errorMessage = 'Email and password are required';
      return;
    }

    this.authService.login(this.email, this.password).subscribe({
      next: (response) => {
        this.authService.saveAuthData(response);
        this.loginSuccess.emit(response);
      },
      error: (error) => {
        this.errorMessage = error.error?.message || 'Login failed';
      },
    });
  }
}
