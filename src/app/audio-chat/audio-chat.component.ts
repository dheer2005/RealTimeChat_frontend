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
  private isEndingCall = false;
  
  // Audio state
  isMuted = false;
  isSpeakerOn = true;
  isRemoteUserMuted = false;
  callDuration = '00:00';
  private callTimer?: any;
  private callStartTime?: number;

  // Call states
  isRinging = false;
  
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
    
    // Ensure SignalR connection
    if (!this.audioService.hubConnection || 
        this.audioService.hubConnection.state !== 'Connected') {
      this.audioService.startConnection().then(() => {
        this.setupSignalListeners();
      });
    } else {
      this.setupSignalListeners();
    }

    // If caller (not receiving), initiate the call
    if (!this.audioService.incomingCall) {
      // Small delay to ensure everything is set up
      setTimeout(() => this.initiateCall(), 500);
    }
  }

  private setupSignalListeners(): void {
    if (!this.isBrowser || !this.audioService.hubConnection) return;

    // Listen for incoming offers
    this.offerSubscription = this.audioService.offerReceived.subscribe(async (data) => {
      if (!this.peerConnection || this.peerConnection.signalingState === 'closed') return;

      console.log('📞 Offer received from:', data.from);
      
      this.audioService.lastOffer = data;
      this.audioService.incomingCall = true;
      this.audioService.remoteUserId = data.from;
    });

    // Setup call ended listener
    this.audioService.hubConnection.on('CallEnded', (fromUser: string) => {
      console.log('📞 Call ended by:', fromUser);
      
      if (!this.isEndingCall) {
        this.cleanupCall();
        this.dialogRef.close();
      }
    });

    // Handle answer received
    this.answerSubscription = this.audioService.answerReceived.subscribe(async (data) => {
      if (!this.peerConnection || this.peerConnection.signalingState === 'closed') return;

      console.log('✅ Answer received from:', data.from);

      if (data && data.answer) {
        if (this.peerConnection.remoteDescription) {
          console.warn("Remote description already set");
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

            // Call is now connected!
            this.isRinging = false;
            this.audioService.isCallActive = true;
            this.startCallTimer();

            console.log('🎉 Call connected!');
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
        console.warn("Invalid ICE candidate:", c);
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

  async initiateCall(): Promise<void> {
    if (!this.isBrowser) return;

    try {
      console.log('📞 Initiating call to:', this.audioService.remoteUserId);
      
      this.isRinging = true;
      
      // Create offer
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true
      });
      
      await this.peerConnection.setLocalDescription(offer);
      
      // Send offer via SignalR
      await this.audioService.sendOffer(this.audioService.remoteUserId, offer);
      
      console.log('📤 Offer sent successfully');
    } catch (error) {
      console.error("Error initiating call:", error);
      this.isRinging = false;
      this.toastrSvc.error('Failed to initiate call');
    }
  }

  async declineCall(): Promise<void> {
    if (!this.isBrowser || this.isEndingCall) return;
    
    this.isEndingCall = true;
    console.log('📞 Declining call...');

    try {
      await this.audioService.endCall(this.audioService.remoteUserId);
    } catch (error) {
      console.error('Error declining call:', error);
    }

    this.cleanupCall();
    this.audioService.lastOffer = null;
    this.dialogRef.close();
  }

  async acceptCall(): Promise<void> {
    if (!this.isBrowser) return;

    console.log('✅ Accepting call from:', this.audioService.remoteUserId);

    this.audioService.incomingCall = false;
    this.audioService.isCallActive = true;
    this.startCallTimer();

    // CRITICAL: Enable microphone immediately on accept
    if (this.stream) {
      this.stream.getAudioTracks().forEach(track => {
        track.enabled = true;
        console.log('🎤 Microphone enabled:', track.label);
      });
      this.isMuted = false;
    }

    const offerData = this.audioService.lastOffer;
    if (offerData && offerData.offer) {
      try {
        if (this.peerConnection.remoteDescription) {
          console.warn("Remote description already set");
          return;
        }

        if (this.peerConnection.signalingState === 'stable') {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offerData.offer));
          this.remoteDescriptionSet = true;

          // Process pending candidates
          for (const candidate of this.pendingCandidates) {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          }
          this.pendingCandidates = [];

          // Create answer
          const answer = await this.peerConnection.createAnswer();
          await this.peerConnection.setLocalDescription(answer);
          
          // Send answer
          await this.audioService.sendAnswer(this.audioService.remoteUserId, answer);

          console.log('📤 Answer sent successfully');
        }
      } catch (error) {
        console.error("Error accepting call:", error);
      }
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
      console.log('🎵 Remote audio track received');
      
      if (!this.remoteAudioElement) {
        this.remoteAudioElement = new Audio();
        this.remoteAudioElement.autoplay = true;
      }
      
      this.remoteAudioElement.srcObject = event.streams[0];
      
      // Monitor remote audio levels to detect mute
      this.monitorRemoteAudio(event.streams[0]);
      
      this.remoteAudioElement.play()
        .then(() => console.log('🔊 Remote audio playing'))
        .catch(err => console.error("Error playing remote audio:", err));
    };

    // Monitor connection state
    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('📡 ICE Connection State:', this.peerConnection.iceConnectionState);
      
      if (this.peerConnection.iceConnectionState === 'connected') {
        console.log('✅ ICE Connected!');
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      console.log('📡 Connection State:', this.peerConnection.connectionState);
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
        if (!this.audioService.isCallActive) return;
        
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        
        // If average is very low for extended period, user might be muted
        this.isRemoteUserMuted = average < 2;
        
        requestAnimationFrame(checkAudioLevel);
      };
      
      checkAudioLevel();
    } catch (error) {
      console.error('Error monitoring remote audio:', error);
    }
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

      // For CALLER: Enable mic immediately
      // For RECEIVER: Keep muted until they accept
      const shouldEnableMic = !this.audioService.incomingCall;
      
      this.stream.getAudioTracks().forEach(track => {
        track.enabled = shouldEnableMic;
        console.log(`🎤 Mic ${shouldEnableMic ? 'enabled' : 'muted'} initially:`, track.label);
      });

      this.isMuted = !shouldEnableMic;

      // Add tracks to peer connection IMMEDIATELY
      this.stream.getTracks().forEach(track => {
        const sender = this.peerConnection.addTrack(track, this.stream!);
        console.log('✅ Added audio track to peer connection:', track.label);
      });

    } catch (error) {
      console.error("⚠️ Microphone access error:", error);
      
      this.toastrSvc.warning('Microphone access denied. You will not be able to speak.', 'Warning', {
        timeOut: 5000
      });
      
      // Create silent track as fallback
      try {
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        const dst = oscillator.connect(ctx.createMediaStreamDestination()) as MediaStreamAudioDestinationNode;
        oscillator.start();
        
        this.stream = dst.stream;
        this.stream.getAudioTracks().forEach(track => track.enabled = false);
        this.stream.getTracks().forEach(track => {
          this.peerConnection.addTrack(track, this.stream!);
        });
        
        this.isMuted = true;
      } catch (silentError) {
        console.error("Failed to create silent track:", silentError);
      }
    }
  }

  private cleanupCall(): void {
    if (!this.isBrowser) return;

    console.log('📞 Cleaning up call...');

    // Stop local stream
    if (this.stream) {
      this.stream.getTracks().forEach(track => {
        track.stop();
        console.log('Stopped track:', track.kind);
      });
      this.stream = null;
    }

    // Stop remote audio
    if (this.remoteAudioElement) {
      this.remoteAudioElement.pause();
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
    this.audioService.isOpen = false;
    this.remoteDescriptionSet = false;
    this.pendingCandidates = [];
    this.isRinging = false;
    this.isMuted = false;
    this.isRemoteUserMuted = false;
  }

  async endCall(): Promise<void> {
    if (!this.isBrowser || !this.peerConnection || this.isEndingCall) return;

    this.isEndingCall = true;
    console.log('📞 Ending call...');

    try {
      await this.audioService.endCall(this.audioService.remoteUserId);
      console.log('📞 End call signal sent');
    } catch (error) {
      console.error('Error sending end call signal:', error);
    }

    this.cleanupCall();
    this.stopCallTimer();
    this.audioService.remoteUserId = '';
    this.audioService.lastOffer = null;

    setTimeout(() => {
      this.dialogRef.close();
    }, 200);
  }

  toggleMute(): void {
    if (!this.stream) return;

    this.isMuted = !this.isMuted;
    
    this.stream.getAudioTracks().forEach(track => {
      track.enabled = !this.isMuted;
      console.log(`🎤 Microphone ${this.isMuted ? 'muted' : 'unmuted'}:`, track.label);
    });

    this.toastrSvc.info(this.isMuted ? 'Microphone muted' : 'Microphone unmuted', '', {
      timeOut: 1500
    });
  }

  async toggleSpeaker(): Promise<void> {
    this.isSpeakerOn = !this.isSpeakerOn;
    
    if (this.remoteAudioElement) {
      try {
        const audioContext = new AudioContext();
        const source = audioContext.createMediaElementSource(this.remoteAudioElement);
        
        if (this.isSpeakerOn) {
          source.connect(audioContext.destination);
          console.log('🔊 Speaker mode: ON (loudspeaker)');
        } else {
          this.remoteAudioElement.volume = 0.3; 
          source.connect(audioContext.destination);
          console.log('📱 Speaker mode: OFF (earpiece simulation)');
        }
        
        if (this.isSpeakerOn) {
          this.remoteAudioElement.volume = 1.0;
        }
        
      } catch (error) {
        this.remoteAudioElement.volume = this.isSpeakerOn ? 1.0 : 0.3;
      }
    }
    
    this.toastrSvc.info(
      this.isSpeakerOn ? '🔊 Speaker mode' : '📱 Earpiece mode', 
      '', 
      { timeOut: 1500 }
    );
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
    console.log('📞 Component destroying...');
    
    if (this.answerSubscription) this.answerSubscription.unsubscribe();
    if (this.candidateSubscription) this.candidateSubscription.unsubscribe();
    if (this.offerSubscription) this.offerSubscription.unsubscribe();

    if (this.isBrowser && this.audioService.hubConnection) {
      this.audioService.hubConnection.off('CallEnded');
    }

    if (!this.isEndingCall) {
      this.cleanupCall();
    }
    this.stopCallTimer();
  }
}