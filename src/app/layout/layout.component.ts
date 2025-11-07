import { Component, ElementRef, HostListener } from '@angular/core';
import { AuthenticationService } from '../Services/authentication.service';
import { Router, RouterLink } from '@angular/router';
import { CommonModule, UpperCasePipe } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { ChatService } from '../Services/chat.service';
import { SessionService } from '../Services/session.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterLink, CommonModule, UpperCasePipe],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css'
})
export class LayoutComponent {
  currentUserName: string = '';
  isNavbarOpen = false;

  constructor(private eRef: ElementRef, private sessionSvc: SessionService, private chatService: ChatService, public authSvc: AuthenticationService, private router: Router, private toastr: ToastrService){
    this.currentUserName = this.authSvc.getUserName();
  }

  toggleNavbar() {
    this.isNavbarOpen = !this.isNavbarOpen;
  }
  
  closeNavbar() {
    this.isNavbarOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: Event) {
    if (this.isNavbarOpen && !this.eRef.nativeElement.contains(event.target)) {
      this.isNavbarOpen = false;
    }
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
