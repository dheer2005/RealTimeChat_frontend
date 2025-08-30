import { Injectable } from '@angular/core';
import { HubConnection } from '@microsoft/signalr';
import * as signalR from '@microsoft/signalr';
import { AuthenticationService } from './authentication.service';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class VideoService {

  public hubConnection!: HubConnection;
  private hubUrl = 'https://chatify.bsite.net/video';

  // private hubUrl = 'https://localhost:7180/video';
  private token: any;

  public incomingCall = false;
  public isCallActive = false;
  public remoteUserId = '';
  public isOpen: boolean = false;

  public peerConnection!: RTCPeerConnection;


  public offerReceived = new BehaviorSubject<{from: string, offer: RTCSessionDescriptionInit}|null>(null);
  public answerReceived = new BehaviorSubject<{from: string, answer: RTCSessionDescriptionInit}|null>(null);
  public candidateReceived = new BehaviorSubject<{from: string, candidate: RTCIceCandidate}|null>(null);

  constructor(private authSvc: AuthenticationService) { }
  

  startConnection(){
    this.token = this.authSvc.getToken();

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(this.hubUrl, {
        accessTokenFactory: () => this.token,
        withCredentials: false
      })
      .withAutomaticReconnect()
      .build();

    this.hubConnection.start().then(()=>{console.log("videoChat SignalR connected");})
    .catch((err)=>console.error("signalRConnectionError",err));

    this.hubConnection.on('ReceiveOffer', (from, offer)=>{
      this.offerReceived.next({from, offer:JSON.parse(offer)});
    });

    this.hubConnection.on('ReceiveAnswer', (from, answer)=>{
      this.answerReceived.next({from, answer:JSON.parse(answer)});
    });

    this.hubConnection.on('ReceiveCandidate', (from, candidate)=>{
      this.candidateReceived.next({from, candidate:JSON.parse(candidate)});
    });
  }


  public sendOffer(toUser: string, offer: RTCSessionDescriptionInit) {
    return this.hubConnection.invoke('SendOffer', toUser, JSON.stringify(offer));
  }

  public sendAnswer(toUser: string, answer: RTCSessionDescriptionInit) {
    return this.hubConnection.invoke('SendAnswer', toUser, JSON.stringify(answer));
  }

  public sendCandidate(toUser: string, candidate: RTCIceCandidateInit) {
    return this.hubConnection.invoke('SendIceCandidate', toUser, JSON.stringify(candidate));
  }

  public endCall(toUser: string) {
    return this.hubConnection.invoke('EndCall', toUser);
  }

}
