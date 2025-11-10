import { Injectable } from '@angular/core';
import { AuthenticationService } from './authentication.service';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class SessionService {

  private baseUrl = 'https://realtime001.bsite.net/api/Session';

  // private baseUrl = 'https://localhost:7180/api/Session';

  constructor(private authSvc: AuthenticationService, private http: HttpClient) { }

  getAllActiveSession(){
    return this.http.get(`${this.baseUrl}/active-session`, this.authSvc.getHttpOptions());
  }

  getClientIp(){
    return this.http.get('https://ipapi.co/json');
  }

  logoutFromAllDevices(){
    return this.http.post(`${this.baseUrl}/logout/all`, {}, this.authSvc.getHttpOptions());
  }

  logoutCurrentDevice(){
    return this.http.post(`${this.baseUrl}/logout/current`, {}, this.authSvc.getHttpOptions());
  }

  logoutSessionById(sessionId: string){
    return this.http.post(`${this.baseUrl}/logout-device/${sessionId}`, {}, this.authSvc.getHttpOptions());
  }
}
