import { Component, Input } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthenticationService } from '../Services/authentication.service';
import { ToastrService } from 'ngx-toastr';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ChatService } from '../Services/chat.service';

@Component({
  selector: 'app-profile-description',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile-description.component.html',
  styleUrl: './profile-description.component.css'
})
export class ProfileDescriptionComponent {
  // @Input() userName: string = '';

  profileName = '';
  userInfo: any;
  isLoading: boolean = false;
  errorMessage: string = '';

  private onlineUsersSubscription?: Subscription;
  isUserOnline: boolean = false;

  constructor(private activatedRoute: ActivatedRoute, private Router: Router, private chatSvc: ChatService, private authSvc: AuthenticationService, private toastrSvc:ToastrService){
    this.activatedRoute.paramMap.subscribe(param=>{
      this.profileName = param.get('name')?? '';
      this.loadUserInfo();
    });

    this.onlineUsersSubscription = this.chatSvc.onlineUsers$.subscribe(
      (users) => {
        const user = users.find(u => u.userName === this.profileName);
        this.isUserOnline = user?.isOnline || false;
      }
    );
  }

  ngOnDestroy(): void {
    this.onlineUsersSubscription?.unsubscribe();
  }

  loadUserInfo(): void {
    this.isLoading = true;
    this.errorMessage = '';
    
    this.authSvc.getUserInfo(this.profileName).subscribe({
      next: (res) => {
        this.userInfo = res;
        this.isLoading = false;
      },
      error: (err) => {
        console.log(err);
        this.errorMessage = 'Failed to load user information';
        this.isLoading = false;
      }
    });
  }

  copyToClipboard(text: string): void {
    if (!text) return;

    navigator.clipboard.writeText(text).then(() => {
      this.toastrSvc.success('Text copied to clipboard');
    }).catch(err => {
      this.toastrSvc.error('Failed to copy text: ', err);
    });
  }

  getInitials(): string {
    if (!this.userInfo?.fullName) return '';
    return this.userInfo.fullName
      .split(' ')
      .map((n:any) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  formatPhoneNumber(phone: string): string {
    if (!phone) return '';
    return phone.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
  }

}
