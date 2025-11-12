import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { Router } from '@angular/router';
import { JwtHelperService } from '@auth0/angular-jwt';
import { jwtDecode } from 'jwt-decode';
import { Observable } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

@Injectable({
  providedIn: 'root'
})
export class AuthenticationService {

  constructor(private http:HttpClient, private jwtHelper: JwtHelperService, private router: Router, @Inject(PLATFORM_ID) private platformId: any, private toastrSvc: ToastrService) { }

  private tokenKey = 'jwt';
  
  public UserName:any;
  seenUrl: any = "https://realtime001.bsite.net/api/Seen/messages/" 
  chatUrl: any = "https://realtime001.bsite.net/api/ChatHub/"
  baseUrl: any = "https://realtime001.bsite.net/api/Authentication/"
  mediaUrl: any = "https://realtime001.bsite.net/api/Media/"

  // seenUrl: any = "https://localhost:7180/api/Seen/messages/" 
  // chatUrl: any = "https://localhost:7180/api/ChatHub/"
  // baseUrl: any = "https://localhost:7180/api/Authentication/"
  // mediaUrl: any = "https://localhost:7180/api/Media/"
  httpOptions:any={
    header: new Headers({
      'content-type': 'application/json'
    })
  };

  saveToken(token: string) {
    if(isPlatformBrowser(this.platformId)){
      localStorage.setItem(this.tokenKey, token);
    }
  }

  clearToken() {
    if(isPlatformBrowser(this.platformId)){
      localStorage.removeItem(this.tokenKey);
      localStorage.removeItem('userName');
    }
  }

  loginUser(data:any){
    return this.http.post(this.baseUrl+"Login", data, this.httpOptions);
  }

  registerUser(data:any){
    return this.http.post(this.baseUrl+"Register",data , this.httpOptions);
  }

  getAllUsers(userId: string){
    return this.http.get<any[]>(`${this.baseUrl}GetAllUsers/${userId}`, this.getHttpOptions());
  }

  getUserInfo(userName: string){
    return this.http.get<any>(`${this.baseUrl}get-user-info-by-userName/${userName}`, this.getHttpOptions());
  }

  uploadImage(formData: FormData): Observable<any> {
    return this.http.post(`${this.mediaUrl}uploadMedia`, formData);
  }

  editUserProfile(userId: string, data: any) {
    return this.http.put(`${this.baseUrl}edit-user-profile/${userId}`, data);
  }

  editUserProfilePic(userId: string, formData: FormData) {
    return this.http.put(`${this.baseUrl}edit-user-profile-pic/${userId}`, formData);
  }

  checkAuthentication(){
    const token = localStorage.getItem('jwt');
    if(token && !this.jwtHelper.isTokenExpired(token)){
      return true;
    }else{
      if(token){
        alert("Token is expired");
        localStorage.removeItem('jwt');
        this.router.navigateByUrl('/login');
      }
      return false;
    }
  }

  getUserName(){
    if(isPlatformBrowser(this.platformId)){
      const token = localStorage.getItem('jwt');
      if(token != null){
        const decodeToken:any = jwtDecode(token);
        this.UserName =decodeToken ? decodeToken["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"] : null;
        return this.UserName;
      }
      return token;
    }
  }

  getUserId(){
    if(isPlatformBrowser(this.platformId)){
      const token = localStorage.getItem('jwt');
      if(token != null){
        const decodeToken:any = jwtDecode(token);
        const userId =decodeToken ? decodeToken["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"] : null;
        return userId;
      }
    }
  }

  getToken(): string | null {
    if (isPlatformBrowser(this.platformId)) {
      return localStorage.getItem('jwt');
    }
    return null;
  }

  getJwtId() {
    if(isPlatformBrowser(this.platformId)){
      const token = localStorage.getItem('jwt');
      if(token != null){
        const decodeToken:any = jwtDecode(token);
        const jti =decodeToken ? decodeToken.jti : null;
        return jti;
      }
    }
  }

  public getHttpOptions(): { headers:HttpHeaders } {
    const token = this.getToken(); 
    let headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return {headers: headers};
  }

  logoutCurrentUser(){
    try {
      this.clearToken();
      this.router.navigate(['/login']);
      this.toastrSvc.success('Logout successful');

    } catch (error) {
      console.error('Logout error:', error);
      this.toastrSvc.error('Error during logout:');
    }
  }
  


}
