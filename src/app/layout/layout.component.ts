import { Component, ElementRef, HostListener, OnInit } from '@angular/core';
import { AuthenticationService } from '../Services/authentication.service';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule, UpperCasePipe } from '@angular/common';
import { ChatService } from '../Services/chat.service';
import { SessionService } from '../Services/session.service';
import { filter, Subscription } from 'rxjs';
import { AlertService } from '../Services/alert.service';
import { FriendrequestService } from '../Services/friendrequest.service';
import Swal from 'sweetalert2';

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
  currentUserId: string = this.authSvc.getUserId();
  private routerSubscription?: Subscription;

  constructor(private eRef: ElementRef, 
    private sessionSvc: SessionService, 
    public chatService: ChatService, 
    public authSvc: AuthenticationService, 
    private router: Router, 
    private toastr: AlertService,
    private alertSvc: AlertService, 
    private friendRequestSvc: FriendrequestService
  ){
    this.currentUserName = this.authSvc.getUserName();
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: Event) {
    const target = event.target as HTMLElement;

    if (this.isNavbarOpen && !this.eRef.nativeElement.contains(target)) {
      this.isNavbarOpen = false;
    }

    if (!target.closest('.user-menu')) {
      this.isDropdownOpen = false;
    }

    if (
      this.isMobileMenuOpen &&
      !target.closest('.tablet-menu') &&
      !target.closest('.navbar-toggler')
    ) {
      this.isMobileMenuOpen = false;
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

    if(this.authSvc.getToken()){
      this.loadFriendRequests();
    }
  
    this.chatService.friendRequest$.subscribe(() => {
      this.chatService.PendingfriendRequestsCount += 1;
    });
    
    this.chatService.unfriend$.subscribe(() => {
      if (this.chatService.PendingfriendRequestsCount > 0) {
        this.loadFriendRequests();
      }
    });
    
    
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

  loadFriendRequests(): void {
    this.friendRequestSvc.getPendingRequests(this.currentUserId).subscribe({
      next: (data) => {
        this.chatService.PendingfriendRequestsCount = data.length;
      },
      error: (err) => {
        this.alertSvc.error('Failed to load friend requests');
      }
    });
  }

  

  logout(){
    Swal.fire({
      title: 'Sure you want to Logout?',
      html: '<p style="color: #9ca3af; margin-top: 10px; line-height: 1.6;">You will need to login again to access your account.</p>',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Logout',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      allowOutsideClick: true,
      allowEscapeKey: true,
      background: '#ffffff',
      color: '#1f2937',
      iconColor: '#f59e0b',
      backdrop: 'rgba(102, 126, 234, 0.3)',
      confirmButtonColor: '#667eea',
      cancelButtonColor: '#1f2937',
      customClass: {
        popup: 'purple-gradient-popup',
        confirmButton: 'purple-gradient-confirm-btn',
        cancelButton: 'purple-gradient-cancel-btn',
        title: 'purple-gradient-title'
      }
    }).then((result) => {
      if (result.isConfirmed) {
        this.chatService.stopConnection();
        Swal.fire({
          title: 'Logging out...',
          text: 'See you soon!',
          icon: 'success',
          background: '#ffffff',
          color: '#1f2937',
          iconColor: '#10b981',
          showConfirmButton: false,
          timer: 2000,
          timerProgressBar: true,
          customClass: {
            popup: 'purple-gradient-popup',
            timerProgressBar: 'purple-gradient-timer',
            title: 'purple-gradient-title'
          }
        });
        
      this.sessionSvc.logoutCurrentDevice().subscribe({
          next: (res)=>{
            this.authSvc.clearToken();
            this.router.navigateByUrl('/login');
          }
        });
      } 
    });
  }
  
}
