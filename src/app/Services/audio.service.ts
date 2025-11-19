import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { HubConnection } from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { AuthenticationService } from './authentication.service';
import { ToastrService } from 'ngx-toastr';

@Injectable({
  providedIn: 'root'
})
export class AudioService {

  public hubConnection!: HubConnection;
  private hubUrl = 'https://realtime001.bsite.net/audio';
  
  // private hubUrl = 'https://10.0.0.43:5000/audio';
  
  // private hubUrl = 'https://localhost:7180/audio';

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
  public incomingAudioCall = new Subject<string>();
  public callFailed = new Subject<string>();
  public callDeclined = new Subject<string>();

  constructor(
    private authSvc: AuthenticationService,
    private toastRService: ToastrService,
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
        accessTokenFactory: () => this.token!
      })
      .withAutomaticReconnect()
      .build();

    this.hubConnection.on('ReceiveOffer', (from: string, offer: string) => {
      if (this.isCallActive || this.incomingCall) {
        console.log('⚠️ Ignoring incoming call from', from, '- already in a call');
        return;
      }

      const parsedOffer = JSON.parse(offer);

      this.lastOffer = {from, offer: parsedOffer};
      this.offerReceived.next({from, offer: parsedOffer});
      
      this.incomingCall = true;
      this.remoteUserId = from;

      this.incomingAudioCall.next(from);
      console.log('📞 Incoming call from:', from);
    });

    this.hubConnection.on('CallFailed', (reason: string) => {
      this.toastRService.warning(reason);
      console.warn('🎤 Call failed:', reason);
      this.callFailed.next(reason);
      this.resetCallState();
    });

    this.hubConnection.on('CallDeclined', (by: string) => {
      console.log('🎤 Call declined by:', by);
      this.callDeclined.next(by);
      this.resetCallState();
    });

    this.hubConnection.on("IncomingAudioCall", (from: string) => {
      console.log("📞 Incoming audio call from:", from);

      if (this.isCallActive || this.incomingCall) {
        console.log('⚠️ Ignoring incoming call notification - already in a call');
        return;
      }
      this.incomingCall = true;
      this.remoteUserId = from;

      this.incomingAudioCall.next(from);
    });

    this.hubConnection.on('ReceiveAnswer', (from: string, answer: string) => {
      this.answerReceived.next({from, answer: JSON.parse(answer)});
    });

    this.hubConnection.on('ReceiveCandidate', (from: string, candidate: any) => {
      this.candidateReceived.next({from, candidate});
    });

    this.hubConnection.on('CallEnded', (from: string) => {
      console.log('🎤 Call ended by:', from);
      this.resetCallState();
    });

    return this.hubConnection.start()
      .catch((err) => {
        console.error("signalRConnectionError", err);
        throw err;
      });
  }

  private resetCallState(): void {
    this.incomingCall = false;
    this.isCallActive = false;
    this.remoteUserId = '';
    this.lastOffer = null;
  }

  public declineCall(fromUser: string): Promise<any> {
    if (!this.isBrowser || !this.hubConnection) {
      return Promise.reject('SignalR not available');
    }
    return this.hubConnection.invoke('DeclineCall', fromUser);
  }

  public async checkUserAvailability(userName: string): Promise<boolean> {
    if (!this.isBrowser || !this.hubConnection) {
      return false;
    }
    try {
      return await this.hubConnection.invoke('CheckUserAvailability', userName);
    } catch (error) {
      console.error('Error checking user availability:', error);
      return false;
    }
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
