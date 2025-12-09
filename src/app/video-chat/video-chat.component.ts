import { Component, ElementRef, inject, OnInit, OnDestroy, ViewChild, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { VideoService } from '../Services/video.service';
import { MatDialogRef } from '@angular/material/dialog';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';

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
  private isEndingCall = false;

  isMuted = false;
  isCameraOn = true;
  isRemoteUserMuted = false;
  
  private answerSubscription?: Subscription;
  private candidateSubscription?: Subscription;
  private offerSubscription?: Subscription;
  private callFailedSubscription?: Subscription;
  private callDeclinedSubscription?: Subscription;

  constructor(
    public signalRService: VideoService,
    private snackBar: MatSnackBar
  ) {
  }

  private dialogRef: MatDialogRef<VideoChatComponent> = inject(MatDialogRef);

  ngOnInit(): void {

    this.setupPeerConnection();
    this.startLocalVideo();
    
    if (!this.signalRService.hubConnection || 
        this.signalRService.hubConnection.state !== 'Connected') {
      this.signalRService.startConnection().then(() => {
        this.setupSignalListeners();
      });
    } else {
      this.setupSignalListeners();
    }
  }

  private setupSignalListeners(): void {
    if (!this.signalRService.hubConnection) return;

    this.offerSubscription = this.signalRService.offerReceived.subscribe(async (data) => {
      if (!this.peerConnection || this.peerConnection.signalingState === 'closed') return;
      
      if (data && data.offer && !this.signalRService.isCallActive) {
        console.log('📹 Offer received from:', data.from);
      }
    });

    this.signalRService.hubConnection.on('CallEnded', (fromUser: string) => {
      console.log('📹 Call ended by:', fromUser);
      
      if (!this.isEndingCall) {
        this.showNotification('Call ended');
        this.cleanupCall();
        this.dialogRef.close();
      }
    });

    this.callFailedSubscription = this.signalRService.callFailed.subscribe((reason: string) => {
      this.showNotification(reason, 'error');
      this.cleanupCall();
      this.dialogRef.close();
    });

    this.callDeclinedSubscription = this.signalRService.callDeclined.subscribe((userName: string) => {
      this.showNotification(`${userName} declined your call`);
      this.cleanupCall();
      this.dialogRef.close();
    });

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
            console.warn('Unexpected signaling state:', this.peerConnection.signalingState);
          }
        } catch (error) {
          console.error("Error setting remote description:", error);
        }
      }
    });

    this.candidateSubscription = this.signalRService.candidateReceived.subscribe(async (data) => {
      if (!this.peerConnection || this.peerConnection.signalingState === 'closed') return;

      if (!data || !data.candidate) return;

      const c = data.candidate;

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

  private showNotification(message: string, type: 'info' | 'error' = 'info'): void {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'top',
      panelClass: type === 'error' ? ['error-snackbar'] : ['info-snackbar']
    });
  }

  async declineCall(): Promise<void> {
    if (this.isEndingCall) return;
    
    this.isEndingCall = true;
    console.log('📹 Declining call...');

    try {
      await this.signalRService.declineCall(this.signalRService.remoteUserId);
    } catch (error) {
      console.error('Error declining call:', error);
    }

    this.cleanupCall();
    this.signalRService.lastOffer = null;
    this.dialogRef.close();
  }

  async acceptCall(): Promise<void> {
    this.signalRService.incomingCall = false;
    this.signalRService.isCallActive = true;

    if (this.stream) {
      this.stream.getAudioTracks().forEach((track) => track.enabled = true);
    }
    
    const offerData = this.signalRService.lastOffer;

    if (offerData && offerData.offer) {
      try {
        if (this.peerConnection.remoteDescription) {
          console.warn("Remote description already set, skipping...");
          return;
        }

        if (this.peerConnection.signalingState === 'stable') {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offerData.offer));
          this.remoteDescriptionSet = true;

          for (const candidate of this.pendingCandidates) {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          }
          this.pendingCandidates = [];

          const answer = await this.peerConnection.createAnswer();
          await this.peerConnection.setLocalDescription(answer);
          await this.signalRService.sendAnswer(this.signalRService.remoteUserId, answer);
          
          console.log('📹 Answer sent successfully');
        } else {
          console.warn("Cannot accept: invalid signaling state:", this.peerConnection.signalingState);
        }
      } catch (error) {
        console.error("Error accepting call:", error);
        this.showNotification('Failed to accept call', 'error');
      }
    } else {
      console.error("No offer available to accept");
    }
  }

  async startCall(): Promise<void> {
    try {
      console.log('📹 Starting call...');
      this.signalRService.isCallActive = true;
      
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      await this.signalRService.sendOffer(this.signalRService.remoteUserId, offer);
      
      console.log('📹 Offer sent successfully');
    } catch (error) {
      console.error("Error starting call:", error);
      this.signalRService.isCallActive = false;
      this.showNotification('Failed to start call', 'error');
    }
  }

  private setupPeerConnection(): void {
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

    this.peerConnection.ontrack = (event) => {
      if (this.remoteVideo?.nativeElement) {
        this.remoteVideo.nativeElement.srcObject = event.streams[0];
        
        this.monitorRemoteAudio(event.streams[0]);
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('📹 ICE Connection State:', this.peerConnection.iceConnectionState);
      
      if (this.peerConnection.iceConnectionState === 'failed' || 
          this.peerConnection.iceConnectionState === 'disconnected') {
        console.warn('Connection failed/disconnected');
      }
    };
  }

  private monitorRemoteAudio(stream: MediaStream): void {
    try {
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const checkAudioLevel = () => {
        if (!this.signalRService.isCallActive) return;
        
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        
        this.isRemoteUserMuted = average < 2;
        
        requestAnimationFrame(checkAudioLevel);
      };
      
      checkAudioLevel();
    } catch (error) {
      console.error('Error monitoring remote audio:', error);
    }
  }

  private async startLocalVideo(): Promise<void> {
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

      this.stream.getAudioTracks().forEach((track) => {
        track.enabled = this.signalRService.isCallActive;
      });

      this.stream.getTracks().forEach((track) => {
        if (this.stream) {
          this.peerConnection.addTrack(track, this.stream);
        }
      });
      
      console.log('📹 Local video started');
    } catch (error) {
      console.error('Error accessing media devices:', error);
      this.showNotification('Unable to access camera/microphone. Please check permissions.', 'error');
    }
  }

  private cleanupCall(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        track.stop();
        console.log('Stopped track:', track.kind);
      });
      this.stream = null;
    }

    if (this.localVideo?.nativeElement) {
      this.localVideo.nativeElement.srcObject = null;
    }

    if (this.remoteVideo?.nativeElement) {
      this.remoteVideo.nativeElement.srcObject = null;
    }

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

    this.signalRService.isCallActive = false;
    this.signalRService.incomingCall = false;
    this.signalRService.isOpen = false;
    this.remoteDescriptionSet = false;
    this.pendingCandidates = [];
    this.isMuted = false;
    this.isCameraOn = true;
    this.isRemoteUserMuted = false;
  }

  async endCall(): Promise<void> {
    if (!this.peerConnection || this.isEndingCall) return;

    this.isEndingCall = true;
    console.log('📹 Ending call...');

    try {
      await this.signalRService.endCall(this.signalRService.remoteUserId);
      console.log('📹 End call signal sent');
    } catch (error) {
      console.error('Error sending end call signal:', error);
    }

    this.cleanupCall();
    this.signalRService.remoteUserId = '';
    this.signalRService.lastOffer = null;
    
    setTimeout(() => {
      this.dialogRef.close();
    }, 200);
  }

  toggleMute(): void {
    if (!this.stream) return;

    this.isMuted = !this.isMuted;
    
    this.stream.getAudioTracks().forEach((track) => {
      track.enabled = !this.isMuted;
      console.log(`🎤 Audio ${this.isMuted ? 'muted' : 'unmuted'}`);
    });
  }

  toggleCamera(): void {
    if (!this.stream) return;

    this.isCameraOn = !this.isCameraOn;
    
    this.stream.getVideoTracks().forEach((track) => {
      track.enabled = this.isCameraOn;
    });
  }

  ngOnDestroy(): void {
    
    if (this.answerSubscription) {
      this.answerSubscription.unsubscribe();
    }
    if (this.candidateSubscription) {
      this.candidateSubscription.unsubscribe();
    }
    if (this.offerSubscription) {
      this.offerSubscription.unsubscribe();
    }
    if (this.callFailedSubscription) {
      this.callFailedSubscription.unsubscribe();
    }
    if (this.callDeclinedSubscription) {
      this.callDeclinedSubscription.unsubscribe();
    }

    if (this.signalRService.hubConnection) {
      this.signalRService.hubConnection.off('CallEnded');
    }

    if (!this.isEndingCall) {
      this.cleanupCall();
    }
  }
}