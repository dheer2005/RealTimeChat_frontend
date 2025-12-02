import { Component, ElementRef, HostListener, OnInit } from '@angular/core';
import { AuthenticationService } from '../Services/authentication.service';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule, UpperCasePipe } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { ChatService } from '../Services/chat.service';
import { SessionService } from '../Services/session.service';
import { filter, Subscription } from 'rxjs';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterLink, CommonModule, UpperCasePipe, RouterLinkActive],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css'
})
export class LayoutComponent implements OnInit {
  currentUserName: string = '';
  isNavbarOpen = false;
  isMobileMenuOpen = false;
  isDropdownOpen = false;
  showNavbar = false;
  private routerSubscription?: Subscription;

  constructor(private eRef: ElementRef, private sessionSvc: SessionService, private chatService: ChatService, public authSvc: AuthenticationService, private router: Router, private toastr: ToastrService){
    this.currentUserName = this.authSvc.getUserName();
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: Event) {
    if (this.isNavbarOpen && !this.eRef.nativeElement.contains(event.target)) {
      this.isNavbarOpen = false;
    }
    const target = event.target as HTMLElement;
    if (!target.closest('.user-menu')) {
      this.isDropdownOpen = false;
    }
  }

  ngOnInit(): void {
    this.routerSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        this.checkRoute(event.urlAfterRedirects);
        this.closeMobileMenu();
      });

    this.checkRoute(this.router.url);
  }

  private checkRoute(url: string): void {
    const chatRoutes = ['/chats', '/group-chat'];
    this.showNavbar = !chatRoutes.some(route => url === route || url.startsWith(route + '/'));
  }

  toggleDropdown() {
    this.isDropdownOpen = !this.isDropdownOpen;
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen = false;
  }

  logout(){
    this.chatService.stopConnection();
    // this.authSvc.logoutCurrentUser();
    this.sessionSvc.logoutCurrentDevice().subscribe({
      next: (res)=>{
        this.authSvc.clearToken();
        this.toastr.success("User logged out from current device" , "Success");
        this.router.navigateByUrl('/login');
      }
    });
  }
  
}
