import { Component } from '@angular/core';
import { AuthenticationService } from '../Services/authentication.service';
import { Router, RouterLink } from '@angular/router';
import { CommonModule, UpperCasePipe } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { ChatService } from '../Services/chat.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterLink, CommonModule, UpperCasePipe],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css'
})
export class LayoutComponent {
  constructor(private chatService: ChatService, public authSvc: AuthenticationService, private router: Router, private toastr: ToastrService){}
 
  logout(){
    // localStorage.removeItem('jwt');
    // this.authSvc.UserName = null;
    // this.toastr.warning("User Log out", "Warning");
    // this.router.navigateByUrl('/login');

    try {
      this.chatService.stopConnection();
      
      localStorage.removeItem('jwt');
      localStorage.removeItem('userName');
      
      this.router.navigate(['/login']);
      
      console.log('Logout successful');
    } catch (error) {
      console.error('Error during logout:', error);
      localStorage.removeItem('jwt');
      localStorage.removeItem('userName');
      this.router.navigate(['/login']);
    }
  }
}
