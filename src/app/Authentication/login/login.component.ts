import { HttpClient } from '@angular/common/http';
import { Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthenticationService } from '../../Services/authentication.service';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { LoginModel } from '../../Models/LoginModel.model';
import { FormsModule } from '@angular/forms';

import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterLink, CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent implements OnInit {
  constructor(private http:HttpClient, private authSvc: AuthenticationService,private toastr: ToastrService,private router: Router, @Inject(PLATFORM_ID) private platformId: any){}

  login:LoginModel={
    UserName: '',
    Password: ''
  }


  ngOnInit(): void {
      if(isPlatformBrowser(this.platformId)){
        if(localStorage.getItem('jwt') && this.authSvc.checkAuthentication()){
          this.router.navigateByUrl('/home');
        }
      }
  }

  onLogin(){
    this.authSvc.loginUser(this.login).subscribe({
      next: (res:any)=>{
        localStorage.setItem('jwt',res.token);
        localStorage.setItem('userName', res.userName);
        this.toastr.success("User logged in" , "Success");
        this.authSvc.getUserName();
        this.router.navigateByUrl('/home');
      },
      error: (err:any)=>{
        if(err.status==0){
          console.log(err);
          this.toastr.error(`Error at server side please try again later: ${err}`);
        }else{
          this.toastr.error("wrong username and password");
        }
      }
    });
  }
}
