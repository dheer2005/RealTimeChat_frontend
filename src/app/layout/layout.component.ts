import { Component, ElementRef, HostListener, OnInit } from '@angular/core';
import { AuthenticationService } from '../Services/authentication.service';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule, UpperCasePipe } from '@angular/common';
import { ChatService } from '../Services/chat.service';
import { SessionService } from '../Services/session.service';
import { filter, Subscription } from 'rxjs';
import { AlertService } from '../Services/alert.service';
import { FriendrequestService } from '../Services/friendrequest.service';

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
  friendRequests: number = 0;
  currentUserId: string = this.authSvc.getUserId();
  private routerSubscription?: Subscription;

  constructor(private eRef: ElementRef, 
    private sessionSvc: SessionService, 
    private chatService: ChatService, 
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

    this.loadFriendRequests();
  
    // Listen for friend request updates
    this.chatService.friendRequest$.subscribe(() => {
      this.friendRequests += 1;
    });
    
    this.chatService.unfriend$.subscribe(() => {
      if (this.friendRequests > 0) {
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
        this.friendRequests = data.length;
      },
      error: (err) => {
        this.alertSvc.error('Failed to load friend requests');
      }
    });
  }

  logout(){
    this.chatService.stopConnection();
    // this.authSvc.logoutCurrentUser();
    this.sessionSvc.logoutCurrentDevice().subscribe({
      next: (res)=>{
        this.authSvc.clearToken();
        this.toastr.success("Signed out successfully!");
        this.router.navigateByUrl('/login');
      }
    });
  }
  
}
