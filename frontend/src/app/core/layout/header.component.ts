import { Component, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '@core/services/auth.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent {
  private authService = inject(AuthService);
  
  toggleSidebar = output<void>();
  currentUser = this.authService.currentUser;
  
  onLogout(): void {
    this.authService.logout();
  }
  
  onToggleSidebar(): void {
    this.toggleSidebar.emit();
  }
}
