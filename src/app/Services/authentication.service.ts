import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { Route, Router } from '@angular/router';
import { JwtHelperService } from '@auth0/angular-jwt';
import { jwtDecode } from 'jwt-decode';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthenticationService {

  constructor(private http:HttpClient, private jwtHelper: JwtHelperService, private router: Router, @Inject(PLATFORM_ID) private platformId: any) { }

  public chatList = new BehaviorSubject<boolean>(false); 
  public chatList$ = this.chatList.asObservable();
  
  
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

  loginUser(data:any){
    return this.http.post(this.baseUrl+"Login", data, this.httpOptions);
  }

  registerUser(data:any){
    return this.http.post(this.baseUrl+"Register",data , this.httpOptions);
  }

  getAllUsers(userName: string){
    return this.http.get<any[]>(`${this.baseUrl}GetAllUsers/${userName}`, this.httpOptions);
  }

  sendMsg(data:any){
    return this.http.post(this.chatUrl+"SendChatData", data);
  }

  markMessagesAsSeen(fromUser: string, toUser: string) {
    return this.http.post(this.seenUrl+"mark-seen", { fromUser, toUser });
  }

  getUserInfo(userName: string){
    return this.http.get<any>(`${this.baseUrl}get-user-info-by-userName/${userName}`, this.httpOptions);
  }

  uploadImage(formData: FormData): Observable<any> {
    return this.http.post(`${this.mediaUrl}uploadMedia`, formData);
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

  getToken(): string | null {
    if (isPlatformBrowser(this.platformId)) {
      return localStorage.getItem('jwt');
    }
    return null;
  }
}
