import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AutomationService } from '@core/services/automation.service';
import { AuthService } from '@core/services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <router-outlet />
  `,
  styles: []
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'Job Application Automation';

  private automationService = inject(AutomationService);
  private authService = inject(AuthService);

  ngOnInit(): void {
    const token = this.authService.getToken();
    if (token) {
      this.automationService.initializeSocket(token);
    }
  }

  ngOnDestroy(): void {
    this.automationService.disconnectSocket();
  }
}
