import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthenticationService } from '../../Services/authentication.service';
import { CommonModule } from '@angular/common';
import { LoginModel } from '../../Models/LoginModel.model';
import { FormsModule } from '@angular/forms';
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
  constructor(private sessionSvc: SessionService,
    private authSvc: AuthenticationService,
    private alertSvc: AlertService,
    private activatedRoute: ActivatedRoute,
    private router: Router
  ){}

  login:LoginModel={
    UserName: '',
    Password: '',
    ClientIp: ''
  }

  isLoading: boolean = false;


  ngOnInit(): void {
    this.activatedRoute.queryParams.subscribe((params: any) => {
      if (params['sessionExpired'] === 'true') {
        this.alertSvc.warning('Your session has expired. Please login again.');
      }
    });
    if(localStorage.getItem('jwt') && this.authSvc.checkAuthentication()){
      this.router.navigateByUrl('/home');
    }
    this.sessionSvc.getClientIp().subscribe((ipData:any) => {
      this.login.ClientIp = ipData.ip;
    });
  }

  handleGoogleLogin(idToken: string){
    this.isLoading = true;

    const googleLoginModel = {
      IdToken: idToken,
      ClientIp: this.login.ClientIp
    }
  }

  onLogin(){
    this.isLoading = true;
    this.authSvc.loginUser(this.login).subscribe({
      next: (res:any)=>{
        this.authSvc.saveToken(res.token);
        this.alertSvc.success("User logged in");
        this.authSvc.getUserName();
        this.router.navigateByUrl('/home');
        this.isLoading = false;
      },
      error: (err:any)=>{
        this.isLoading = false;
        if(err.status==0){
          this.alertSvc.error(`Something wen wrong! please try again later`);
        }else{
          this.alertSvc.error("wrong username and password");
        }
      }
    });
  }
}
