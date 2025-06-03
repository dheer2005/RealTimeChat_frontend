import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthenticationService } from '../../Services/authentication.service';
import { RegisterModel } from '../../Models/Register.model';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [RouterLink, CommonModule, FormsModule],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css'
})
export class RegisterComponent {
  constructor(private authSvc: AuthenticationService, private router: Router){}

  register:RegisterModel={
    UserName: '',
    Email: '',
    Password: ''
  }

  onRegister(){
    this.authSvc.registerUser(this.register).subscribe({
      next: ()=>{
        alert("User Created");
        this.router.navigateByUrl('/login');
      },
      error: (err:any)=>{
        console.log(err);
      }
    })
  }

}
