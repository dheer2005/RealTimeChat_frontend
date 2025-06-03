import { Component, ElementRef, inject, OnInit, ViewChild } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { VideoService } from '../Services/video.service';
import { MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-video-chat',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './video-chat.component.html',
  styleUrl: './video-chat.component.css'
})
export class VideoChatComponent implements OnInit {
  @ViewChild('localVideo') localVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo') remoteVideo!: ElementRef<HTMLVideoElement>;
  private peerConnection!: RTCPeerConnection;
  private remoteDescriptionSet = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];


  constructor(public signalRService: VideoService) { }
  private dialogRef: MatDialogRef<VideoChatComponent> = inject(MatDialogRef);

  ngOnInit(): void {
    this.setupPeerConnection();
    this.startLocalVideo();
    this.signalRService.startConnection();
    this.setupSignalListers();
  }


  setupSignalListers() {
    this.signalRService.hubConnection.on('CallEnded', () => {
      this.stopLocalVideo();
      this.signalRService.isCallActive = false;
      this.signalRService.incomingCall = false;
      this.signalRService.remoteUserId = '';
      this.dialogRef.close();
    })

    this.signalRService.answerReceived.subscribe(async (data) => {
      // console.log("Answer received:", data);
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
            console.warn('Unexpected signaling state. Expected have-local-offer but got:', this.peerConnection.signalingState);
          }

        } catch (error) {
          console.error("Error setting remote description or adding candidates:", error);
        }
      }

    })

    this.signalRService.candidateReceived.subscribe(async (data) => {
      if (!this.peerConnection || this.peerConnection.signalingState === 'closed') return;

      if (!data || !data.candidate) {
        console.warn("Invalid ICE candidate data received:", data);
        return;
      }

      try {
        if (this.remoteDescriptionSet) {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(data?.candidate));
        } else {
          this.pendingCandidates.push(data!.candidate);
        }
      } catch (err) {
        console.error("Error adding ICE candidate:", err);
      }
    })
  }

  declineCall() {
    this.signalRService.endCall(this.signalRService.remoteUserId);
    this.stopLocalVideo();
    this.signalRService.isOpen = false;
  }


  async acceptCall() {
    this.signalRService.incomingCall = false;
    this.signalRService.isCallActive = true;

    // await this.startLocalVideo();

    this.stream.getAudioTracks().forEach((track: any) => track.enabled = true);

    let offer = await this.signalRService.offerReceived.getValue()?.offer;

    if (offer) {
      if (this.peerConnection.signalingState === 'stable') {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        let answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        this.signalRService.sendAnswer(this.signalRService.remoteUserId, answer);
      } else {
        console.warn("Cannot accept offer: invalid signaling state:", this.peerConnection.signalingState);
      }
    }
  }

  async startCall() {
    this.signalRService.isCallActive = true;
    // await this.startLocalVideo();
    let offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    this.signalRService.sendOffer(this.signalRService.remoteUserId, offer);
  }

  setupPeerConnection() {
    this.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, {
        urls: 'stun:stun.services.mozilla.com'
      }]
    });

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.signalRService.sendCandidate(this.signalRService.remoteUserId, event.candidate)
      }
    }

    this.peerConnection.ontrack = (event) => {
      this.remoteVideo.nativeElement.srcObject = event.streams[0];
    }
  }

  stream: any;
  async startLocalVideo() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    this.localVideo.nativeElement.srcObject = this.stream;
    this.stream.getAudioTracks().forEach((track: any) => {
      if (!this.signalRService.isCallActive) {
        track.enabled = false;  // Mic OFF if not in active call
      }
    });
    this.stream.getTracks().forEach((track: any) => this.peerConnection.addTrack(track, this.stream));
  }

  async stopLocalVideo() {
    if (this.stream) {
      this.stream.getTracks().forEach((track: any) => {
        track.stop();
      });
    }
    this.peerConnection.onicecandidate = null;
    this.peerConnection.ontrack = null;
    this.peerConnection.oniceconnectionstatechange = null;
    this.peerConnection.getSenders().forEach((sender) => {
      if (sender.track) {
        sender.track.stop();
      }
    });
    this.peerConnection.close();
    this.dialogRef.close();
    this.signalRService.isCallActive = false;
    this.signalRService.incomingCall = false;
    const stream = this.localVideo.nativeElement.srcObject as MediaStream;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      this.localVideo.nativeElement.srcObject = null;
    }

    setTimeout(() => {
      this.signalRService.isOpen = false;
    }, 0);
  }


  async endCall() {
    if (this.peerConnection) {
      this.signalRService.endCall(this.signalRService.remoteUserId);
      await this.stopLocalVideo();
      // this.dialogRef.close();
      this.localVideo.nativeElement.srcObject = null;
      this.signalRService.remoteUserId = '';
    }
  }


}
