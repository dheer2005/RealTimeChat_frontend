import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { HubConnection } from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { AuthenticationService } from './authentication.service';

@Injectable({
  providedIn: 'root'
})
export class AudioService {

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

  public offerReceived = new Subject<{from: string, offer: RTCSessionDescriptionInit}>();
  public answerReceived = new Subject<{from: string, answer: RTCSessionDescriptionInit}>();
  public candidateReceived = new Subject<{from: string, candidate: RTCIceCandidate}>();
  public incomingCallEvent = new Subject<{from: string, offer: RTCSessionDescriptionInit}>();
  public lastOffer: {from: string, offer: RTCSessionDescriptionInit} | null = null;

  constructor(
    private authSvc: AuthenticationService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  startConnection(): Promise<void> {
    if (!this.isBrowser) {
      return Promise.resolve();
    }

    this.token = this.authSvc.getToken();

    if (!this.token) {
      console.warn("No token available for VideoChat SignalR connection");
      return Promise.reject('No token');
    }

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(this.hubUrl, {
        accessTokenFactory: () => this.token!,
        withCredentials: false
      })
      .withAutomaticReconnect()
      .build();

    // Setup listeners BEFORE starting connection
    this.hubConnection.on('ReceiveOffer', (from: string, offer: string) => {
      const parsedOffer = JSON.parse(offer);
      
      // Store offer for later use
      this.lastOffer = {from, offer: parsedOffer};
      
      this.offerReceived.next({from, offer: parsedOffer});
      this.incomingCall = true;
      this.remoteUserId = from;
      
      console.log('📞 Incoming call from:', from);
    });

    this.hubConnection.on('ReceiveAnswer', (from: string, answer: string) => {
      this.answerReceived.next({from, answer: JSON.parse(answer)});
    });

    this.hubConnection.on('ReceiveCandidate', (from: string, candidate: any) => {
      this.candidateReceived.next({from, candidate});
    });

    this.hubConnection.on('CallEnded', (from: string) => {
      this.incomingCall = false;
      this.isCallActive = false;
      this.remoteUserId = '';
    });

    return this.hubConnection.start()
      .catch((err) => {
        console.error("signalRConnectionError", err);
        throw err;
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
        .catch(err => console.error("Error stopping SignalR connection:", err));
    }
  }
}
