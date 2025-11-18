// audio-chat.component.ts
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, Inject, inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { Subscription } from 'rxjs';
import { AudioService } from '../Services/audio.service';
import { MatIconModule } from '@angular/material/icon';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-audio-chat',
  standalone: true,
  imports: [MatIconModule, CommonModule],
  templateUrl: './audio-chat.component.html',
  styleUrl: './audio-chat.component.css'
})
export class AudioChatComponent implements OnInit, OnDestroy {
  private peerConnection!: RTCPeerConnection;
  private remoteDescriptionSet = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private stream: MediaStream | null = null;
  private isBrowser: boolean;
  private remoteAudioElement: HTMLAudioElement | null = null;
  
  // Audio state
  isMuted = false;
  isSpeakerOn = true;
  callDuration = '00:00';
  private callTimer?: any;
  private callStartTime?: number;

  // Call states
  isRinging = false; // For caller - showing "Ringing..."
  
  // Subscriptions
  private answerSubscription?: Subscription;
  private candidateSubscription?: Subscription;
  private offerSubscription?: Subscription;

  constructor(
    public audioService: AudioService,
    private toastrSvc: ToastrService,
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
    this.setupSignalListeners();

    // If this user initiated the call (not incoming), start immediately
    if (!this.audioService.incomingCall) {
      this.initiateCall();
    }
  }

  private setupSignalListeners(): void {
    if (!this.isBrowser) return;

    // Listen for incoming offers (when someone calls you)
    this.offerSubscription = this.audioService.offerReceived.subscribe(async (data) => {
      if (!this.peerConnection || this.peerConnection.signalingState === 'closed') return;

      console.log('📞 Offer received from:', data.from);
      
      // Store the offer for when user clicks accept
      this.audioService.lastOffer = data;
      this.audioService.incomingCall = true;
      this.audioService.remoteUserId = data.from;
    });

    // Setup call ended listener
    const setupCallEndedListener = () => {
      this.audioService.hubConnection?.on('CallEnded', () => {
        console.log('Call ended by remote user');
        this.stopLocalAudio();
        this.stopCallTimer();
        this.audioService.isCallActive = false;
        this.audioService.incomingCall = false;
        this.audioService.remoteUserId = '';
        this.isRinging = false;
        this.dialogRef.close();
      });
    };

    if (this.audioService.hubConnection?.state === 'Connected') {
      setupCallEndedListener();
    } else {
      this.audioService.hubConnection?.onreconnected(() => setupCallEndedListener());
    }

    // Handle answer received (when receiver accepts)
    this.answerSubscription = this.audioService.answerReceived.subscribe(async (data) => {
      if (!this.peerConnection || this.peerConnection.signalingState === 'closed') return;

      console.log('✅ Answer received from:', data.from);

      if (data && data.answer) {
        if (this.peerConnection.remoteDescription) {
          console.warn("Remote description already set. Skipping...");
          return;
        }

        try {
          if (this.peerConnection.signalingState === 'have-local-offer') {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            this.remoteDescriptionSet = true;

            // Process pending ICE candidates
            for (const candidate of this.pendingCandidates) {
              await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
            this.pendingCandidates = [];

            // Call is now active!
            this.isRinging = false;
            this.audioService.isCallActive = true;
            this.startCallTimer();

            console.log('🎉 Call connected!');
          } else {
            console.warn('Unexpected signaling state:', this.peerConnection.signalingState);
          }
        } catch (error) {
          console.error("Error setting remote description:", error);
        }
      }
    });

    // Handle ICE candidates
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

      try {
        if (this.remoteDescriptionSet) {
          await this.peerConnection.addIceCandidate(iceCandidate);
        } else {
          this.pendingCandidates.push(iceCandidate);
        }
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    });
  }

  // CALLER initiates the call
  async initiateCall(): Promise<void> {
    if (!this.isBrowser) return;

    try {
      console.log('📞 Initiating call to:', this.audioService.remoteUserId);
      
      this.isRinging = true; // Show "Ringing..." status
      
      // Create and send offer
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true
      });
      
      await this.peerConnection.setLocalDescription(offer);
      
      // Send offer to remote user
      await this.audioService.sendOffer(this.audioService.remoteUserId, offer);
      
      console.log('📤 Offer sent successfully');
    } catch (error) {
      console.error("Error initiating call:", error);
      this.isRinging = false;
    }
  }

  // RECEIVER declines the call
  async declineCall(): Promise<void> {
    if (!this.isBrowser) return;

    await this.audioService.endCall(this.audioService.remoteUserId);
    this.stopLocalAudio();
    this.audioService.isOpen = false;
    this.audioService.lastOffer = null;
    this.audioService.incomingCall = false;
    this.dialogRef.close();
  }

  // RECEIVER accepts the call
  async acceptCall(): Promise<void> {
    if (!this.isBrowser) return;

    console.log('✅ Accepting call from:', this.audioService.remoteUserId);

    this.audioService.incomingCall = false;
    this.audioService.isCallActive = true;
    this.startCallTimer();

    // Enable microphone
    if (this.stream) {
      this.stream.getAudioTracks().forEach(t => t.enabled = true);
    }

    const offerData = this.audioService.lastOffer;
    if (offerData && offerData.offer) {
      try {
        if (this.peerConnection.remoteDescription) {
          console.warn("Remote description already set");
          return;
        }

        if (this.peerConnection.signalingState === 'stable') {
          // Set remote offer
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offerData.offer));
          this.remoteDescriptionSet = true;

          // Process pending candidates
          for (const candidate of this.pendingCandidates) {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          }
          this.pendingCandidates = [];

          // Create and send answer
          const answer = await this.peerConnection.createAnswer();
          await this.peerConnection.setLocalDescription(answer);
          await this.audioService.sendAnswer(this.audioService.remoteUserId, answer);

          console.log('📤 Answer sent successfully');
        } else {
          console.warn("Invalid signaling state:", this.peerConnection.signalingState);
        }
      } catch (error) {
        console.error("Error accepting call:", error);
      }
    } else {
      console.error("No offer available to accept");
    }
  }

  private setupPeerConnection(): void {
    if (!this.isBrowser) return;

    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        {
          urls: 'turn:relay1.expressturn.com:3480',
          username: 'efPU52K4SLOQ34W2QY',
          credential: '1TJPNFxHKXrZfelz'
        }
      ],
      iceCandidatePoolSize: 10
    };

    this.peerConnection = new RTCPeerConnection(configuration);

    // Send ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.audioService.sendCandidate(
          this.audioService.remoteUserId,
          event.candidate
        ).catch(err => console.error("Error sending ICE candidate:", err));
      }
    };

    // Handle remote audio track
    this.peerConnection.ontrack = (event) => {
      console.log('🎵 Remote track received');
      
      if (!this.remoteAudioElement) {
        this.remoteAudioElement = new Audio();
        this.remoteAudioElement.autoplay = true;
      }
      
      this.remoteAudioElement.srcObject = event.streams[0];
      this.remoteAudioElement.play()
        .then(() => console.log('🔊 Remote audio playing'))
        .catch(err => console.error("Error playing remote audio:", err));
    };

    // Monitor connection state
    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE Connection State:', this.peerConnection.iceConnectionState);
      
      if (this.peerConnection.iceConnectionState === 'connected') {
        console.log('✅ ICE Connected!');
      } else if (this.peerConnection.iceConnectionState === 'failed') {
        console.warn('❌ ICE Connection failed');
      } else if (this.peerConnection.iceConnectionState === 'disconnected') {
        console.warn('⚠️ ICE Disconnected');
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      console.log('Connection State:', this.peerConnection.connectionState);
      
      if (this.peerConnection.connectionState === 'connected') {
        console.log('✅ Peer connection established!');
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

      console.log('🎤 Microphone access granted');

      // Mute initially if incoming call (unmute on accept)
      this.stream.getAudioTracks().forEach(track => {
        track.enabled = !this.audioService.incomingCall;
      });

      // Add tracks to peer connection
      this.stream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.stream!);
      });

    } catch (error) {
      console.error("⚠️ Microphone access denied or unavailable:", error);
      
      // Create silent audio track so call can still proceed
      try {
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        const dst = oscillator.connect(ctx.createMediaStreamDestination()) as MediaStreamAudioDestinationNode;
        oscillator.start();
        
        this.stream = dst.stream;
        
        // Mute the silent track
        this.stream.getAudioTracks().forEach(track => {
          track.enabled = false;
        });

        // Add silent track to peer connection
        this.stream.getTracks().forEach(track => {
          this.peerConnection.addTrack(track, this.stream!);
        });

        console.log('🔇 Using silent track (microphone unavailable)');
        
        // Only show alert, don't block the call
        this.toastrSvc?.warning('Microphone access denied. You will not be able to speak.', 'Warning', {
          timeOut: 5000
        });
      } catch (silentError) {
        console.error("Failed to create silent track:", silentError);
      }
    }
  }

  private stopLocalAudio(): void {
    if (!this.isBrowser) return;

    // Stop local stream
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    // Stop remote audio
    if (this.remoteAudioElement) {
      this.remoteAudioElement.srcObject = null;
      this.remoteAudioElement = null;
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.onicecandidate = null;
      this.peerConnection.ontrack = null;
      this.peerConnection.oniceconnectionstatechange = null;
      this.peerConnection.onconnectionstatechange = null;
      
      this.peerConnection.getSenders().forEach(sender => {
        if (sender.track) {
          sender.track.stop();
        }
      });
      
      this.peerConnection.close();
    }

    // Reset states
    this.audioService.isCallActive = false;
    this.audioService.incomingCall = false;
    this.remoteDescriptionSet = false;
    this.pendingCandidates = [];
    this.isRinging = false;
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
    this.stream.getAudioTracks().forEach(track => {
      track.enabled = !this.isMuted;
    });
  }

  toggleSpeaker(): void {
    this.isSpeakerOn = !this.isSpeakerOn;
    // Browser doesn't support speaker toggle directly
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
    if (this.answerSubscription) this.answerSubscription.unsubscribe();
    if (this.candidateSubscription) this.candidateSubscription.unsubscribe();
    if (this.offerSubscription) this.offerSubscription.unsubscribe();

    if (this.isBrowser && this.audioService.hubConnection) {
      this.audioService.hubConnection.off('CallEnded');
    }

    this.stopLocalAudio();
    this.stopCallTimer();
  }
}
