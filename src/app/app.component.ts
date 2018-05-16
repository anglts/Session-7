import { Component, Inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AngularFireDatabase, AngularFireList } from 'angularfire2/database';
import { AngularFireAuth } from 'angularfire2/auth';
import { MatSnackBar } from '@angular/material';
import { firebase } from '@firebase/app';
import { UserInfo } from '@firebase/auth-types';
import { AngularFireStorage } from 'angularfire2/storage';

import 'firebase/messaging';
const LOADING_IMAGE_URL = 'https://www.google.com/images/spin-32.gif';
const PROFILE_PLACEHOLDER_IMAGE_URL = '/assets/images/profile_placeholder.png';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  user: Observable<UserInfo>;
  currentUser: UserInfo;
  messages: Observable<any[]>;
  profilePicStyles: {};
  topics = '';
  value = '';

  constructor(
    public db: AngularFireDatabase,
    public afAuth: AngularFireAuth,
    public snackBar: MatSnackBar,
    private storage: AngularFireStorage
  ) {
    this.user = afAuth.authState;
    this.user.subscribe((user: UserInfo) => {
      this.currentUser = user;
      if (user) {
        this.profilePicStyles = {
          'background-image': `url(${this.currentUser.photoURL})`
        };

        this.messages = this.db
          .list<any>('/messages', ref => ref.limitToLast(12))
          .valueChanges();
        this.messages.subscribe(messages => {
          const topicsMap = {};
          const topics = [];
          let hasEntities = false;
          messages.forEach(message => {
            if (message.entities) {
              for (let entity of message.entities) {
                if (!topicsMap.hasOwnProperty(entity.name)) {
                  topicsMap[entity.name] = 0;
                }
                topicsMap[entity.name] += entity.salience;
                hasEntities = true;
              }
            }
          });
          if (hasEntities) {
            for (let name in topicsMap) {
              topics.push({ name, score: topicsMap[name] });
            }
            topics.sort((a, b) => b.score - a.score);
            this.topics = topics.map(topic => topic.name).join(', ');
          }

          setTimeout(() => {
            const messageList = document.getElementById('messages');
            messageList.scrollTop = messageList.scrollHeight;
            document.getElementById('message').focus();
          }, 500);
        });

        this.saveMessagingDeviceToken();
      } else {
        this.profilePicStyles = {
          'background-image': PROFILE_PLACEHOLDER_IMAGE_URL
        };
        this.topics = '';
      }
    });
  }

  login() {
    this.afAuth.auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
  }

  logout() {
    this.afAuth.auth.signOut();
  }

  update(value: string) {
    this.value = value;
  }

  checkSignedInWithMessage() {
    if (this.currentUser) {
      return true;
    }

    this.snackBar
      .open('You must sign-in first', 'Sign in', {
        duration: 5000
      })
      .onAction()
      .subscribe(() => this.login());

    return false;
  }

  saveMessage(event: any, el: HTMLInputElement) {
    event.preventDefault();

    if (this.value && this.checkSignedInWithMessage()) {
      const messages = this.db.list('/messages');
      messages
        .push({
          name: this.currentUser.displayName,
          text: this.value,
          photoUrl: this.currentUser.photoURL || PROFILE_PLACEHOLDER_IMAGE_URL
        })
        .then(
          () => {
            el.value = '';
          },
          err => {
            this.snackBar.open(
              'Error writing new message to Firebase Database.',
              null,
              {
                duration: 5000
              }
            );
            console.error(err);
          }
        );
    }
  }

  saveImageMessage(event: any) {
    event.preventDefault();
    const file = event.target.files[0];

    const imageForm = <HTMLFormElement>document.getElementById('image-form');
    imageForm.reset();

    if (!file.type.match('image.*')) {
      this.snackBar.open('You can only share images', null, {
        duration: 5000
      });
      return;
    }

    if (this.checkSignedInWithMessage()) {
      const messages = this.db.list('/messages');
      messages
        .push({
          name: this.currentUser.displayName,
          imageUrl: LOADING_IMAGE_URL,
          photoUrl: this.currentUser.photoURL || PROFILE_PLACEHOLDER_IMAGE_URL
        })
        .then(data => {
          const filePath = `${this.currentUser.uid}/${data.key}/${file.name}`;
          var storageRef = this.storage.ref(filePath);
          return storageRef
            .put(file)
            .then(res => res.ref.getDownloadURL())
            .then(downloadUrl => data.update({ imageUrl: downloadUrl }));
        })
        .then(console.log, err => {
          this.snackBar.open(
            'There was an error uploading a file to Cloud Storage.',
            null,
            {
              duration: 5000
            }
          );
          console.error(err);
        });
    }
  }

  onImageClick(event: any) {
    event.preventDefault();
    document.getElementById('mediaCapture').click();
  }

  saveMessagingDeviceToken() {
    return firebase
      .messaging()
      .getToken()
      .then(currentToken => {
        if (currentToken) {
          this.db
            .object(`/fcmTokens/${currentToken}`)
            .set(this.currentUser.uid);
        } else {
          return this.requestNotificationsPermissions();
        }
      })
      .catch(err => {
        this.snackBar.open('Unable to get messaging token.', null, {
          duration: 5000
        });
        console.error(err);
      });
  }

  requestNotificationsPermissions() {
    console.log('Requesting notifications permission...');
    return firebase
      .messaging()
      .requestPermission()
      .then(() => this.saveMessagingDeviceToken())
      .catch(err => {
        this.snackBar.open('Unable to get permission to notify.', null, {
          duration: 5000
        });
        console.error(err);
      });
  }
}
