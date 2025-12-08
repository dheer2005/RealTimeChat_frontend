import { Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthenticationService } from '../../Services/authentication.service';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { LoginModel } from '../../Models/LoginModel.model';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../../Services/chat.service';
import { SessionService } from '../../Services/session.service';
import { AlertService } from '../../Services/alert.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterLink, CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent implements OnInit {
  constructor(private sessionSvc: SessionService,private chatSvc: ChatService, private authSvc: AuthenticationService,private alert: AlertService,private router: Router, @Inject(PLATFORM_ID) private platformId: any){}

  login:LoginModel={
    UserName: '',
    Password: '',
    ClientIp: ''
  }

  isLoading: boolean = false;


  ngOnInit(): void {
    if(isPlatformBrowser(this.platformId)){
      if(localStorage.getItem('jwt') && this.authSvc.checkAuthentication()){
        this.router.navigateByUrl('/home');
      }
    }
    this.sessionSvc.getClientIp().subscribe((ipData:any) => {
      this.login.ClientIp = ipData.ip;
    });
  }

  onLogin(){
    this.isLoading = true;
    this.authSvc.loginUser(this.login).subscribe({
      next: (res:any)=>{
        this.authSvc.saveToken(res.token);
        this.alert.success("User logged in");
        this.authSvc.getUserName();
        this.router.navigateByUrl('/home');
        this.isLoading = false;
      },
      error: (err:any)=>{
        this.isLoading = false;
        if(err.status==0){
          this.alert.error(`Something wen wrong! please try again later`);
        }else{
          this.alert.error("wrong username and password");
        }
      }
    });
  }
}
