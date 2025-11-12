import { Component, ElementRef, HostListener } from '@angular/core';
import { AuthenticationService } from '../Services/authentication.service';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule, UpperCasePipe } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { ChatService } from '../Services/chat.service';
import { SessionService } from '../Services/session.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterLink, CommonModule, UpperCasePipe, RouterLinkActive],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css'
})
export class LayoutComponent {
  currentUserName: string = '';
  isNavbarOpen = false;
  isMobileMenuOpen = false;

  constructor(private eRef: ElementRef, private sessionSvc: SessionService, private chatService: ChatService, public authSvc: AuthenticationService, private router: Router, private toastr: ToastrService){
    this.currentUserName = this.authSvc.getUserName();
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: Event) {
    if (this.isNavbarOpen && !this.eRef.nativeElement.contains(event.target)) {
      this.isNavbarOpen = false;
    }
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen = false;
  }

  
}
