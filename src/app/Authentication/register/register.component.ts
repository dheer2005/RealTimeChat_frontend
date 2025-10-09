import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthenticationService } from '../../Services/authentication.service';
import { RegisterModel } from '../../Models/Register.model';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [RouterLink, CommonModule, FormsModule],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css'
})
export class RegisterComponent {
  @ViewChild('fileInput') fileInputRef!: ElementRef;

  selectedProfileImage: File | null = null;
  previewImageUrl: string | null = null;

  constructor(private authSvc: AuthenticationService, private router: Router, private toastr: ToastrService) {}

  register:RegisterModel={
    UserName: '',
    FullName: '',
    Email: '',
    PhoneNumber: '',
    Password: '',
    ProfileImage: ''
  }

  isRegister: boolean = false;

  onFileSelected(event: any) {
    const file: File = event.target.files[0];

    if (!file.type.startsWith('image/')) {
      this.toastr.warning(`File ${file.name} is not a valid image.`);
      return;
    }
    this.selectedProfileImage = file;
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.previewImageUrl = e.target.result;
    };
    reader.readAsDataURL(file);
    this.register.ProfileImage = file.name;
  }

  onRegister(){
    this.isRegister = true;

    const formdata = new FormData();
    formdata.append('UserName', this.register.UserName);
    formdata.append('FullName', this.register.FullName);
    formdata.append('Email', this.register.Email);
    formdata.append('PhoneNumber', this.register.PhoneNumber ?? '');
    formdata.append('Password', this.register.Password);
    if(this.selectedProfileImage){
      formdata.append('ProfileImage', this.selectedProfileImage, this.selectedProfileImage.name);
    }

    this.authSvc.registerUser(formdata).subscribe({
      next: ()=>{
        this.toastr.success("New user registered");
        this.router.navigateByUrl('/login');

        if(this.fileInputRef){
          this.fileInputRef.nativeElement.value = '';
        }
      },
      error: (err:any)=>{
        console.log(err);
      }
    })
  }

}
