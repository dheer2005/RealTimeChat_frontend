import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { Subscription } from 'rxjs';
import { AudioService } from '../Services/audio.service';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AlertService } from '../Services/alert.service';

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
  private remoteAudioElement: HTMLAudioElement | null = null;
  private isEndingCall = false;
  
  isMuted = false;
  isSpeakerOn = true;
  isRemoteUserMuted = false;
  callDuration = '00:00';
  private callTimer?: any;
  private callStartTime?: number;

  isRinging = false;
  
  private answerSubscription?: Subscription;
  private candidateSubscription?: Subscription;
  private offerSubscription?: Subscription;

  private callFailedSubscription?: Subscription;
  private callDeclinedSubscription?: Subscription;


  constructor(
    public audioService: AudioService,
    private toastrSvc: AlertService,
    private snackBar: MatSnackBar
  ) {
    
  }

  private dialogRef: MatDialogRef<AudioChatComponent> = inject(MatDialogRef);

  private showNotification(message: string, type: 'info' | 'error' = 'info'): void {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'top',
      panelClass: type === 'error' ? ['error-snackbar'] : ['info-snackbar']
    });
  }

  ngOnInit(): void {

    this.setupPeerConnection();
    this.startLocalAudio();
    
    if (!this.audioService.hubConnection || 
        this.audioService.hubConnection.state !== 'Connected') {
      this.audioService.startConnection().then(() => {
        this.setupSignalListeners();
      });
    } else {
      this.setupSignalListeners();
    }
  }

  private setupSignalListeners(): void {
    if (!this.audioService.hubConnection) return;

    this.offerSubscription = this.audioService.offerReceived.subscribe(async (data) => {
      if (!this.peerConnection || this.peerConnection.signalingState === 'closed') return;

      
      this.audioService.lastOffer = data;
      this.audioService.incomingCall = true;
      this.audioService.remoteUserId = data.from;
    });

    this.audioService.hubConnection.on('CallEnded', (fromUser: string) => {
      
      if (!this.isEndingCall) {
        this.showNotification('Call ended');
        this.cleanupCall();
        this.dialogRef.close();
      }
    });

    this.answerSubscription = this.audioService.answerReceived.subscribe(async (data) => {
      if (!this.peerConnection || this.peerConnection.signalingState === 'closed') return;


      if (data && data.answer) {
        if (this.peerConnection.remoteDescription) {
          console.warn("Remote description already set");
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

            this.isRinging = false;
            this.audioService.isCallActive = true;
            this.startCallTimer();
          }
        } catch (error) {
          console.error("Error setting remote description:", error);
        }
      }
    });

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

    this.callFailedSubscription = this.audioService.callFailed.subscribe((reason: string) => {
      this.showNotification(reason, 'error');
      this.cleanupCall();
      this.dialogRef.close();
    });

    this.callDeclinedSubscription = this.audioService.callDeclined.subscribe((userName: string) => {
      this.showNotification(`${userName} declined your call`);
      this.cleanupCall();
      this.dialogRef.close();
    });
  }

  async initiateCall(): Promise<void> {

    try {
      
      this.isRinging = true;
      
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true
      });
      
      await this.peerConnection.setLocalDescription(offer);
      
      await this.audioService.sendOffer(this.audioService.remoteUserId, offer);
      
    } catch (error) {
      console.error("Error initiating call:", error);
      this.isRinging = false;
      this.toastrSvc.error('Failed to initiate call');
    }
  }

  async declineCall(): Promise<void> {
    if (this.isEndingCall) return;
    
    this.isEndingCall = true;

    try {
      await this.audioService.declineCall(this.audioService.remoteUserId);
    } catch (error) {
      console.error('Error declining call:', error);
    }

    this.cleanupCall();
    this.audioService.lastOffer = null;
    this.dialogRef.close();
  }

  async acceptCall(): Promise<void> {
    this.audioService.incomingCall = false;
    this.audioService.isCallActive = true;
    this.startCallTimer();

    if (this.stream) {
      this.stream.getAudioTracks().forEach(track => {
        track.enabled = true;
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

          for (const candidate of this.pendingCandidates) {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          }
          this.pendingCandidates = [];

          const answer = await this.peerConnection.createAnswer();
          await this.peerConnection.setLocalDescription(answer);
          
          await this.audioService.sendAnswer(this.audioService.remoteUserId, answer);

        }
      } catch (error) {
        console.error("Error accepting call:", error);
        this.showNotification('Failed to accept call', 'error');
      }
    }
  }

  private setupPeerConnection(): void {
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

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.audioService.sendCandidate(
          this.audioService.remoteUserId,
          event.candidate
        ).catch(err => console.error("Error sending ICE candidate:", err));
      }
    };

    this.peerConnection.ontrack = (event) => {
      
      if (!this.remoteAudioElement) {
        this.remoteAudioElement = new Audio();
        this.remoteAudioElement.autoplay = true;
      }
      
      this.remoteAudioElement.srcObject = event.streams[0];
      
      this.monitorRemoteAudio(event.streams[0]);
      
      this.remoteAudioElement.play()
        .catch(err => console.error("Error playing remote audio:", err));
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
        
        this.isRemoteUserMuted = average < 2;
        
        requestAnimationFrame(checkAudioLevel);
      };
      
      checkAudioLevel();
    } catch (error) {
      console.error('Error monitoring remote audio:', error);
    }
  }

  private async startLocalAudio(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const shouldEnableMic = !this.audioService.incomingCall;
      
      this.stream.getAudioTracks().forEach(track => {
        track.enabled = shouldEnableMic;
      });

      this.isMuted = !shouldEnableMic;

      this.stream.getTracks().forEach(track => {
        const sender = this.peerConnection.addTrack(track, this.stream!);
      });

    } catch (error) {
      console.error("⚠️ Microphone access error:", error);

      this.showNotification('Microphone access denied. You will not be able to speak', 'error');
      
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
    if (this.stream) {
      this.stream.getTracks().forEach(track => {
        track.stop();
      });
      this.stream = null;
    }

    if (this.remoteAudioElement) {
      this.remoteAudioElement.pause();
      this.remoteAudioElement.srcObject = null;
      this.remoteAudioElement = null;
    }

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
    if (!this.peerConnection || this.isEndingCall) return;

    this.isEndingCall = true;

    try {
      await this.audioService.endCall(this.audioService.remoteUserId);
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
    });

    this.toastrSvc.info(this.isMuted ? 'Microphone muted' : 'Microphone unmuted');
  }

  async toggleSpeaker(): Promise<void> {
    this.isSpeakerOn = !this.isSpeakerOn;
    
    if (this.remoteAudioElement) {
      try {
        const audioContext = new AudioContext();
        const source = audioContext.createMediaElementSource(this.remoteAudioElement);
        
        if (this.isSpeakerOn) {
          source.connect(audioContext.destination);
        } else {
          this.remoteAudioElement.volume = 0.3; 
          source.connect(audioContext.destination);
        }
        
        if (this.isSpeakerOn) {
          this.remoteAudioElement.volume = 1.0;
        }
        
      } catch (error) {
        this.remoteAudioElement.volume = this.isSpeakerOn ? 1.0 : 0.3;
      }
    }
    
    this.toastrSvc.info(this.isSpeakerOn ? ' Speaker mode' : ' Earpiece mode');
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
    if (this.callFailedSubscription) this.callFailedSubscription.unsubscribe();
    if (this.callDeclinedSubscription) this.callDeclinedSubscription.unsubscribe();

    if (this.audioService.hubConnection) {
      this.audioService.hubConnection.off('CallEnded');
    }

    if (!this.isEndingCall) {
      this.cleanupCall();
    }
    this.stopCallTimer();
  }
}