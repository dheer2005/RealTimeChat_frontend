import { Component, ElementRef, inject, OnInit, OnDestroy, ViewChild, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser, NgIf } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { VideoService } from '../Services/video.service';
import { MatDialogRef } from '@angular/material/dialog';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-video-chat',
  standalone: true,
  imports: [MatIconModule, CommonModule, FormsModule],
  templateUrl: './video-chat.component.html',
  styleUrl: './video-chat.component.css'
})
export class VideoChatComponent implements OnInit, OnDestroy {
  @ViewChild('localVideo') localVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo') remoteVideo!: ElementRef<HTMLVideoElement>;
  
  private peerConnection!: RTCPeerConnection;
  private remoteDescriptionSet = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private stream: MediaStream | null = null;
  private isBrowser: boolean;
  
  // Subscriptions for cleanup
  private answerSubscription?: Subscription;
  private candidateSubscription?: Subscription;

  constructor(
    public signalRService: VideoService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  private dialogRef: MatDialogRef<VideoChatComponent> = inject(MatDialogRef);

  ngOnInit(): void {
    // Only initialize in browser
    if (!this.isBrowser) {
      console.warn('Video chat not available during SSR');
      return;
    }

    this.setupPeerConnection();
    this.startLocalVideo();
    this.signalRService.startConnection();
    this.setupSignalListeners();
  }

  private setupSignalListeners(): void {
    if (!this.isBrowser) return;

    // Wait for connection to be established
    const setupCallEndedListener = () => {
      this.signalRService.hubConnection?.on('CallEnded', () => {
        this.stopLocalVideo();
        this.signalRService.isCallActive = false;
        this.signalRService.incomingCall = false;
        this.signalRService.remoteUserId = '';
        this.dialogRef.close();
      });
    };

    // If connection is already started, setup immediately
    if (this.signalRService.hubConnection?.state === 'Connected') {
      setupCallEndedListener();
    } else {
      // Wait for connection to start
      this.signalRService.hubConnection?.onreconnected(() => setupCallEndedListener());
    }

    // Handle answer received
    this.answerSubscription = this.signalRService.answerReceived.subscribe(async (data) => {
      if (!this.peerConnection || this.peerConnection.signalingState === 'closed') return;

      if (data && data.answer) {
        if (this.peerConnection.remoteDescription) {
          console.warn("Remote description already set. Skipping...");
          return;
        }
        
        try {
          if (this.peerConnection.signalingState === 'have-local-offer') {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            this.remoteDescriptionSet = true;

            for (const candidate of this.pendingCandidates) {
              await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
            this.pendingCandidates = [];
          } else {
            console.warn('Unexpected signaling state. Expected have-local-offer but got:', 
              this.peerConnection.signalingState);
          }
        } catch (error) {
          console.error("Error setting remote description or adding candidates:", error);
        }
      }
    });

    // Handle ICE candidate received
    this.candidateSubscription = this.signalRService.candidateReceived.subscribe(async (data) => {
      if (!this.peerConnection || this.peerConnection.signalingState === 'closed') return;

      if (!data || !data.candidate) return;

      const c = data.candidate;

      // Validation (prevents invalid ice candidate error)
      if (!c.candidate || c.sdpMLineIndex == null) {
        console.warn("Invalid ICE candidate received:", c);
        return;
      }

      const iceCandidate = new RTCIceCandidate({
        candidate: c.candidate,
        sdpMid: c.sdpMid ?? null,
        sdpMLineIndex: c.sdpMLineIndex
      });

      if (this.remoteDescriptionSet) {
        await this.peerConnection.addIceCandidate(iceCandidate);
      } else {
        this.pendingCandidates.push(iceCandidate);
      }
    });
  }

  async declineCall(): Promise<void> {
    if (!this.isBrowser) return;

    await this.signalRService.endCall(this.signalRService.remoteUserId);
    this.stopLocalVideo();
    this.signalRService.isOpen = false;
    this.dialogRef.close();
  }

  async acceptCall(): Promise<void> {
    if (!this.isBrowser) return;

    this.signalRService.incomingCall = false;
    this.signalRService.isCallActive = true;

    if (this.stream) {
      this.stream.getAudioTracks().forEach((track) => track.enabled = true);
    }

    const offerData = this.signalRService.offerReceived.getValue();
    const offer = offerData?.offer;

    if (offer) {
      try {
        if (this.peerConnection.signalingState === 'stable') {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await this.peerConnection.createAnswer();
          await this.peerConnection.setLocalDescription(answer);
          await this.signalRService.sendAnswer(this.signalRService.remoteUserId, answer);
        } else {
          console.warn("Cannot accept offer: invalid signaling state:", 
            this.peerConnection.signalingState);
        }
      } catch (error) {
        console.error("Error accepting call:", error);
      }
    }
  }

  async startCall(): Promise<void> {
    if (!this.isBrowser) return;
    try {
      this.signalRService.isCallActive = true;
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      await this.signalRService.sendOffer(this.signalRService.remoteUserId, offer);
    } catch (error) {
      console.error("Error starting call:", error);
      this.signalRService.isCallActive = false;
    }
  }

  private setupPeerConnection(): void {
    if (!this.isBrowser) return;

    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun.services.mozilla.com' },
        {
          urls: 'turn:relay1.expressturn.com:3480',
          username: 'efPU52K4SLOQ34W2QY',
          credential: '1TJPNFxHKXrZfelz'
        }
      ],
      iceCandidatePoolSize: 10
    };

    this.peerConnection = new RTCPeerConnection(configuration);

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.signalRService.sendCandidate(
          this.signalRService.remoteUserId, 
          event.candidate
        ).catch(err => console.error("Error sending ICE candidate:", err));
      }
    };

    // Handle remote track
    this.peerConnection.ontrack = (event) => {
      if (this.remoteVideo?.nativeElement) {
        this.remoteVideo.nativeElement.srcObject = event.streams[0];
      }
    };

    // Monitor connection state
    this.peerConnection.oniceconnectionstatechange = () => {
      
      if (this.peerConnection.iceConnectionState === 'failed' || 
          this.peerConnection.iceConnectionState === 'disconnected') {
        console.warn('Connection failed/disconnected. May need TURN server.');
      }
    };
  }

  private async startLocalVideo(): Promise<void> {
    if (!this.isBrowser) return;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      if (this.localVideo?.nativeElement) {
        this.localVideo.nativeElement.srcObject = this.stream;
      }

      // Mute audio initially if not in active call
      this.stream.getAudioTracks().forEach((track) => {
        track.enabled = this.signalRService.isCallActive;
      });

      // Add tracks to peer connection
      this.stream.getTracks().forEach((track) => {
        if (this.stream) {
          this.peerConnection.addTrack(track, this.stream);
        }
      });
    } catch (error) {
      console.error('Error accessing media devices:', error);
      alert('Unable to access camera/microphone. Please check permissions.');
    }
  }

  private stopLocalVideo(): void {
    if (!this.isBrowser) return;

    // Stop all tracks in the stream
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    // Clear local video
    if (this.localVideo?.nativeElement) {
      this.localVideo.nativeElement.srcObject = null;
    }

    // Clear remote video
    if (this.remoteVideo?.nativeElement) {
      this.remoteVideo.nativeElement.srcObject = null;
    }

    // Clean up peer connection
    if (this.peerConnection) {
      this.peerConnection.onicecandidate = null;
      this.peerConnection.ontrack = null;
      this.peerConnection.oniceconnectionstatechange = null;

      this.peerConnection.getSenders().forEach((sender) => {
        if (sender.track) {
          sender.track.stop();
        }
      });

      this.peerConnection.close();
    }

    // Reset state
    this.signalRService.isCallActive = false;
    this.signalRService.incomingCall = false;
    this.remoteDescriptionSet = false;
    this.pendingCandidates = [];
  }

  async endCall(): Promise<void> {
    if (!this.isBrowser || !this.peerConnection) return;

    try {
      await this.signalRService.endCall(this.signalRService.remoteUserId);
      this.stopLocalVideo();
      this.signalRService.remoteUserId = '';
      
      setTimeout(() => {
        this.signalRService.isOpen = false;
        this.dialogRef.close();
      }, 100);
    } catch (error) {
      console.error('Error ending call:', error);
      this.dialogRef.close();
    }
  }

  ngOnDestroy(): void {
    // Clean up subscriptions
    if (this.answerSubscription) {
      this.answerSubscription.unsubscribe();
    }
    if (this.candidateSubscription) {
      this.candidateSubscription.unsubscribe();
    }

    // Remove SignalR event listeners
    if (this.isBrowser && this.signalRService.hubConnection) {
      this.signalRService.hubConnection.off('CallEnded');
    }

    // Stop media and close connection
    this.stopLocalVideo();
  }
}