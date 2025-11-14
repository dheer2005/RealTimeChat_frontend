import { HttpClient } from '@angular/common/http';
import { Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthenticationService } from '../../Services/authentication.service';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { LoginModel } from '../../Models/LoginModel.model';
import { FormsModule } from '@angular/forms';

import { ToastrService } from 'ngx-toastr';
import { ChatService } from '../../Services/chat.service';
import { SessionService } from '../../Services/session.service';
import { log } from 'node:console';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterLink, CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent implements OnInit {
  constructor(private sessionSvc: SessionService,private chatSvc: ChatService, private authSvc: AuthenticationService,private toastr: ToastrService,private router: Router, @Inject(PLATFORM_ID) private platformId: any){}

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
        if(res && res.token){
          this.authSvc.saveToken(res.token);
          this.toastr.success("User logged in" , "Success");
          this.authSvc.getUserName();
          this.router.navigateByUrl('/home');
        }
        this.isLoading = false;
      },
      error: (err:any)=>{
        this.isLoading = false;
        if(err.status==0){
          this.toastr.error(`Error at server side please try again later: ${err}`);
        }else{
          this.toastr.error("wrong username and password");
        }
      }
    });
  }
}
