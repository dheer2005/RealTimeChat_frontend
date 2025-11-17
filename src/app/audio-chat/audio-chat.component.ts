import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, Inject, inject, PLATFORM_ID } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { Subscription } from 'rxjs';
import { AudioService } from '../Services/audio.service';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-audio-chat',
  standalone: true,
  imports: [MatIconModule, CommonModule, FormsModule],
  templateUrl: './audio-chat.component.html',
  styleUrl: './audio-chat.component.css'
})
export class AudioChatComponent {
  private peerConnection!: RTCPeerConnection;
  private remoteDescriptionSet = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private stream: MediaStream | null = null;
  private isBrowser: boolean;
  
  // Audio state
  isMuted = false;
  isSpeakerOn = true;
  callDuration = '00:00';
  private callTimer?: any;
  private callStartTime?: number;

  // Subscriptions for cleanup
  private answerSubscription?: Subscription;
  private candidateSubscription?: Subscription;

  constructor(
    public audioService: AudioService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  private dialogRef: MatDialogRef<AudioChatComponent> = inject(MatDialogRef);

  ngOnInit(): void {
    if (!this.isBrowser) {
      console.warn('Audio chat not available during SSR');
      return;
    }

    this.setupPeerConnection();
    this.startLocalAudio();
    this.audioService.startConnection();
    this.setupSignalListeners();
  }

  private setupSignalListeners(): void {
    if (!this.isBrowser) return;

    this.audioService.offerReceived.subscribe(async (data) => {
      if (!this.peerConnection || this.peerConnection.signalingState === 'closed') return;

      if (data && data.offer && !this.audioService.isCallActive) {
        console.log('Offer received from:', data.from);
      }
    });

    // Call ended listener
    const setupCallEndedListener = () => {
      this.audioService.hubConnection?.on('CallEnded', () => {
        this.stopLocalAudio();
        this.stopCallTimer();
        this.audioService.isCallActive = false;
        this.audioService.incomingCall = false;
        this.audioService.remoteUserId = '';
        this.dialogRef.close();
      });
    };

    if (this.audioService.hubConnection?.state === 'Connected') {
      setupCallEndedListener();
    } else {
      this.audioService.hubConnection?.onreconnected(() => setupCallEndedListener());
    }

    // Handle answer received
    this.answerSubscription = this.audioService.answerReceived.subscribe(async (data) => {
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

    // Handle ICE candidate received
    this.candidateSubscription = this.audioService.candidateReceived.subscribe(async (data) => {
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

  async declineCall(): Promise<void> {
    if (!this.isBrowser) return;

    await this.audioService.endCall(this.audioService.remoteUserId);
    this.stopLocalAudio();
    this.audioService.isOpen = false;
    this.audioService.lastOffer = null;
    this.dialogRef.close();
  }

  async acceptCall(): Promise<void> {
    if (!this.isBrowser) return;

    this.audioService.incomingCall = false;
    this.audioService.isCallActive = true;
    this.startCallTimer();

    if (this.stream) {
      this.stream.getAudioTracks().forEach((track) => track.enabled = true);
    }

    const offerData = this.audioService.lastOffer;
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
          await this.audioService.sendAnswer(this.audioService.remoteUserId, answer);
        } else {
          console.warn("Cannot accept offer: invalid signaling state:", this.peerConnection.signalingState);
        }
      } catch (error) {
        console.error("Error accepting call:", error);
      }
    } else {
      console.error("No offer available to accept");
    }
  }

  async startCall(): Promise<void> {
    if (!this.isBrowser) return;

    try {
      this.audioService.isCallActive = true;
      this.startCallTimer();

      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      await this.audioService.sendOffer(this.audioService.remoteUserId, offer);
    } catch (error) {
      console.error("Error starting call:", error);
      this.audioService.isCallActive = false;
      this.stopCallTimer();
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
        this.audioService.sendCandidate(
          this.audioService.remoteUserId,
          event.candidate
        ).catch((err:any) => console.error("Error sending ICE candidate:", err));
      }
    };

    // Handle remote track (audio only)
    this.peerConnection.ontrack = (event) => {
      const audioElement = new Audio();
      audioElement.srcObject = event.streams[0];
      audioElement.play().catch(err => console.error("Error playing remote audio:", err));
    };

    // Monitor connection state
    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE Connection State:', this.peerConnection.iceConnectionState);
      if (this.peerConnection.iceConnectionState === 'failed' || 
          this.peerConnection.iceConnectionState === 'disconnected') {
        console.warn('Connection failed/disconnected.');
      }
    };
  }

  private async startLocalAudio(): Promise<void> {
    if (!this.isBrowser) return;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Mute audio initially if not in active call
      this.stream.getAudioTracks().forEach((track) => {
        track.enabled = this.audioService.isCallActive;
      });

      // Add tracks to peer connection
      this.stream.getTracks().forEach((track) => {
        if (this.stream) {
          this.peerConnection.addTrack(track, this.stream);
        }
      });
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Unable to access microphone. Please check permissions.');
    }
  }

  private stopLocalAudio(): void {
    if (!this.isBrowser) return;

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
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

    this.audioService.isCallActive = false;
    this.audioService.incomingCall = false;
    this.remoteDescriptionSet = false;
    this.pendingCandidates = [];
  }

  async endCall(): Promise<void> {
    if (!this.isBrowser || !this.peerConnection) return;

    try {
      await this.audioService.endCall(this.audioService.remoteUserId);
      this.stopLocalAudio();
      this.stopCallTimer();
      this.audioService.remoteUserId = '';
      this.audioService.lastOffer = null;

      setTimeout(() => {
        this.audioService.isOpen = false;
        this.dialogRef.close();
      }, 100);
    } catch (error) {
      console.error('Error ending call:', error);
      this.dialogRef.close();
    }
  }

  toggleMute(): void {
    if (!this.stream) return;

    this.isMuted = !this.isMuted;
    this.stream.getAudioTracks().forEach((track) => {
      track.enabled = !this.isMuted;
    });
  }

  toggleSpeaker(): void {
    this.isSpeakerOn = !this.isSpeakerOn;
    // Note: Web browsers don't have direct speaker control
    // This is mainly for UI state
  }

  private startCallTimer(): void {
    this.callStartTime = Date.now();
    this.callTimer = setInterval(() => {
      if (this.callStartTime) {
        const elapsed = Math.floor((Date.now() - this.callStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        this.callDuration = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      }
    }, 1000);
  }

  private stopCallTimer(): void {
    if (this.callTimer) {
      clearInterval(this.callTimer);
      this.callTimer = undefined;
    }
    this.callDuration = '00:00';
    this.callStartTime = undefined;
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
    if (this.isBrowser && this.audioService.hubConnection) {
      this.audioService.hubConnection.off('CallEnded');
    }

    // Stop media and close connection
    this.stopLocalAudio();
    this.stopCallTimer();
  }
}
