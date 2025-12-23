import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthenticationService } from '../Services/authentication.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ChatService } from '../Services/chat.service';
import { SessionService } from '../Services/session.service';
import { AlertService } from '../Services/alert.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-profile-description',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile-description.component.html',
  styleUrl: './profile-description.component.css'
})
export class ProfileDescriptionComponent implements OnInit,OnDestroy {

  profileName = '';
  userInfo: any;
  isLoading: boolean = false;
  errorMessage: string = '';
  isCurrentUser: boolean = false;
  isEditing: boolean = false;
  previewImage: string | null = null;
  selectedImageFile: File | null = null;

  
  editModel = {
    fullName: '',
    userName: '',
    email: '',
    phoneNumber: ''
  };

  private onlineUsersSubscription?: Subscription;
  isUserOnline: boolean = false;

  constructor(
    private activatedRoute: ActivatedRoute, 
    private sessionSvc: SessionService,
    public router: Router, 
    private chatSvc: ChatService, 
    private authSvc: AuthenticationService, 
    private toastrSvc:AlertService
  ){
    this.activatedRoute.paramMap.subscribe(param=>{
      this.profileName = param.get('name')?? '';
    });

    if(this.profileName==null || this.profileName==''){
      this.profileName = this.authSvc.getUserName();
    }

    this.loadUserInfo();

    this.onlineUsersSubscription = this.chatSvc.onlineUsers$.subscribe(
      (users) => {
        const user = users.find(u => u.userName === this.profileName);
        this.isUserOnline = user?.isOnline || false;
      }
    );
  }

  ngOnInit(): void {
    this.isCurrentUser = this.profileName === this.authSvc.getUserName();
  }

  toggleEditMode(): void {
    this.isEditing = true;
    this.editModel = {
      fullName: this.userInfo.fullName,
      userName: this.userInfo.userName,
      email: this.userInfo.email,
      phoneNumber: this.userInfo.phoneNumber
    };
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
        this.errorMessage = 'Failed to load user information';
        this.isLoading = false;
      }
    });
  }

  saveProfileChanges(): void {
    this.authSvc.editUserProfile(this.userInfo.userId, this.editModel).subscribe({
      next: () => {
        this.toastrSvc.success('Profile updated successfully');
        this.isEditing = false;
        this.loadUserInfo();
      },
      error: () => this.toastrSvc.error('Failed to update profile')
    });
  }

  cancelEdit(): void {
    this.isEditing = false;
    this.previewImage = null;
  }

   onProfileImageChange(event: any): void {
    const file = event.target.files[0];
    if (!file) return;

    this.selectedImageFile = file;
    const reader = new FileReader();
    reader.onload = (e: any) => (this.previewImage = e.target.result);
    reader.readAsDataURL(file);

    const formData = new FormData();
    formData.append('NewProfileImage', file);

    this.authSvc.editUserProfilePic(this.userInfo.userId, formData).subscribe({
      next: () => {
        this.toastrSvc.success('Profile picture updated');
        this.loadUserInfo();
      },
      error: () => this.toastrSvc.error('Failed to upload image')
    });
  }

  
  triggerFileInput(): void {
    const input: HTMLElement | null = document.querySelector('input[type=file]');
    input?.click();
  }

  copyToClipboard(text: string): void {
    if (!text) return;

    navigator.clipboard.writeText(text).then(() => {
      this.toastrSvc.success('Text copied to clipboard');
    }).catch(err => {
      this.toastrSvc.error('Failed to copy text to clipboard');
    });
  }

  formatPhoneNumber(phone: string): string {
    if (!phone) return '';
    return phone.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
  }

  logout(){
    this.chatSvc.stopConnection();
    Swal.fire({
      title: 'Sure you want to Logout?',
      html: '<p style="color: #9ca3af; margin-top: 10px; line-height: 1.6;">You will need to login again to access your account.</p>',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Logout',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
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
            this.chatSvc.clearHomeCache();
            this.router.navigateByUrl('/login');
          }
        });
      }
    });
  }

}
