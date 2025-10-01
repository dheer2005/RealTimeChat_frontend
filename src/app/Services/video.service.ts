import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HubConnection } from '@microsoft/signalr';
import * as signalR from '@microsoft/signalr';
import { AuthenticationService } from './authentication.service';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class VideoService {
  public hubConnection!: HubConnection;
  private hubUrl = 'https://realtime001.bsite.net/video';


  // private hubUrl = 'https://localhost:7180/video';
  private token: string | null = null;
  private isBrowser: boolean;

  public incomingCall = false;
  public isCallActive = false;
  public remoteUserId = '';
  public isOpen: boolean = false;

  public peerConnection!: RTCPeerConnection;

  public offerReceived = new BehaviorSubject<{from: string, offer: RTCSessionDescriptionInit} | null>(null);
  public answerReceived = new BehaviorSubject<{from: string, answer: RTCSessionDescriptionInit} | null>(null);
  public candidateReceived = new BehaviorSubject<{from: string, candidate: RTCIceCandidate} | null>(null);

  constructor(
    private authSvc: AuthenticationService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  startConnection(): void {
    // Only start connection in browser
    if (!this.isBrowser) {
      console.log("Skipping VideoChat SignalR connection - not in browser");
      return;
    }

    this.token = this.authSvc.getToken();

    if (!this.token) {
      console.warn("No token available for VideoChat SignalR connection");
      return;
    }

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(this.hubUrl, {
        accessTokenFactory: () => this.token!,
        withCredentials: false
      })
      .withAutomaticReconnect()
      .build();

    this.hubConnection.start()
      .then(() => {
        console.log("videoChat SignalR connected");
      })
      .catch((err) => {
        console.error("signalRConnectionError", err);
      });

    this.hubConnection.on('ReceiveOffer', (from: string, offer: string) => {
      this.offerReceived.next({from, offer: JSON.parse(offer)});
    });

    this.hubConnection.on('ReceiveAnswer', (from: string, answer: string) => {
      this.answerReceived.next({from, answer: JSON.parse(answer)});
    });

    this.hubConnection.on('ReceiveCandidate', (from: string, candidate: string) => {
      this.candidateReceived.next({from, candidate: JSON.parse(candidate)});
    });
  }

  public sendOffer(toUser: string, offer: RTCSessionDescriptionInit): Promise<any> {
    if (!this.isBrowser || !this.hubConnection) {
      return Promise.reject('SignalR not available');
    }
    return this.hubConnection.invoke('SendOffer', toUser, JSON.stringify(offer));
  }

  public sendAnswer(toUser: string, answer: RTCSessionDescriptionInit): Promise<any> {
    if (!this.isBrowser || !this.hubConnection) {
      return Promise.reject('SignalR not available');
    }
    return this.hubConnection.invoke('SendAnswer', toUser, JSON.stringify(answer));
  }

  public sendCandidate(toUser: string, candidate: RTCIceCandidateInit): Promise<any> {
    if (!this.isBrowser || !this.hubConnection) {
      return Promise.reject('SignalR not available');
    }
    return this.hubConnection.invoke('SendIceCandidate', toUser, JSON.stringify(candidate));
  }

  public endCall(toUser: string): Promise<any> {
    if (!this.isBrowser || !this.hubConnection) {
      return Promise.reject('SignalR not available');
    }
    return this.hubConnection.invoke('EndCall', toUser);
  }

  public stopConnection(): void {
    if (this.isBrowser && this.hubConnection) {
      this.hubConnection.stop()
        .then(() => console.log("VideoChat SignalR connection stopped"))
        .catch(err => console.error("Error stopping SignalR connection:", err));
    }
  }
}