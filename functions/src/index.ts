import * as functions from 'firebase-functions';
import {DocumentSnapshot} from "firebase-functions/lib/providers/firestore";
import { SearchIndex } from "algoliasearch";
const admin = require('firebase-admin');
const algoliasearch = require('algoliasearch');
admin.initializeApp();

const db = admin.firestore();
const storage = admin.storage().bucket();

exports.chatsLastMessage = functions.firestore
  .document('chats/{chatId}/messages/{messageId}')
  .onCreate((snapshot, context) => {
    const lastMessageModel = snapshot.data();

    if (lastMessageModel !== undefined) {
      return db.doc(`chats/${context.params.chatId}`).update({
        lastMessage: {
          documentId: context.params.messageId,
          ...lastMessageModel
        }
      }).catch((err: any) => 'error while add chat! ' + err);
    }
  });

const algoliaClient = algoliasearch(functions.config().algolia.appid, functions.config().algolia.apikey);
const chatsIndex = algoliaClient.initIndex('chats');
const messagesIndex = algoliaClient.initIndex('messages');

function algoliaUpdate(index: SearchIndex, change: functions.Change<DocumentSnapshot>) {
  if(change.before.data() === undefined) { // insertion
    const ss = change.after;
    const model = ss.data();
    if(model !== undefined) {
      model.objectID = ss.id;
      console.log(`save object ${model}`);
      return index.saveObject(model);
    }
  } else if(change.after.data() === undefined) { // deletion
    const ss = change.before;
    console.log(`delete object ${ss.id}`);
    return index.deleteObject(ss.id);
  } else { // updating
    const ss = change.after;
    const model = ss.data();
    if(model !== undefined) {
      model.objectID = ss.id;
      console.log(`update object ${model}`);
      return index.partialUpdateObject(model);
    }
  }

  console.error("something went wrong")
  return null
}

exports.algoliaChats = functions.firestore
  .document('chats/{chatId}')
  .onWrite((change, context) => {
    console.log(`chat before ${change.before.data()} after ${change.after.data()}`)

    return algoliaUpdate(chatsIndex, change)
  });

exports.algoliaMessages = functions.firestore
  .document('chats/{chatId}/messages/{messageId}')
  .onWrite((change, context) => {
    console.log(`message before ${change.before.data()} after ${change.after.data()}`)

    return algoliaUpdate(messagesIndex, change)
  });

exports.deleteMessageContent = functions.firestore
  .document('chats/{chatId}/messages/{messageId}')
  .onDelete((snap, context) => {
    const deletedValue = snap.data();
    if (deletedValue && deletedValue['kind']) {
      const imagesRemovePromises = deletedValue['kind'].map((content: any) => {
        const image = content["image"]
        if (image) {
          console.log("delete path: " + image.path)
          return storage.file(image.path).delete()
        }
      })

      return Promise.all(imagesRemovePromises);
    }
    return null
  });
