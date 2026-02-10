import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent {
  isOpen = input<boolean>(false);
  closeSidebar = output<void>();

  onCloseSidebar(): void {
    this.closeSidebar.emit();
  }

  onNavigate(): void {
    // Close sidebar on mobile after navigation
    if (window.innerWidth < 992) {
      this.closeSidebar.emit();
    }
  }
}
