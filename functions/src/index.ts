import * as functions from "firebase-functions";
import {DocumentSnapshot} from "firebase-functions/lib/providers/firestore";
import { SearchIndex } from "algoliasearch";
const admin = require("firebase-admin");
const algoliasearch = require("algoliasearch");
admin.initializeApp();

const db = admin.firestore();
const storage = admin.storage().bucket();

exports.chatsLastMessage = functions.firestore
  .document("chats/{chatId}/messages/{messageId}")
  .onWrite((change, context) => {

    const chatDocRef = db.doc(`chats/${context.params.chatId}`);

    return chatDocRef.collection("messages").orderBy("timestamp", "desc").limit(1).get()
      .then(async (snapshotMessages: any) => {
        if (snapshotMessages.empty) {
          console.log("No matching documents.");
          return;
        }

        const lastMessageModel = snapshotMessages.docs[0].data();

        await db.doc(`chats/${context.params.chatId}`).update({
          lastMessage: {
            documentId: context.params.messageId,
            ...lastMessageModel
          }
        }).catch((err: any) => "error while add chat! " + err);
      })
      .catch((err: any) => {
        console.log("Error getting documents", err);
      })
  });

const algoliaClient = algoliasearch(functions.config().algolia.appid, functions.config().algolia.apikey);
const chatsIndex = algoliaClient.initIndex("chats");
const messagesIndex = algoliaClient.initIndex("messages");
const usersIndex = algoliaClient.initIndex("users");

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

  console.error("something went wrong");
  return null
}

exports.algoliaChats = functions.firestore
  .document("chats/{chatId}")
  .onWrite((change) => {
    console.log(`chat before ${change.before.data()} after ${change.after.data()}`);

    return algoliaUpdate(chatsIndex, change)
  });

exports.algoliaMessages = functions.firestore
  .document("chats/{chatId}/messages/{messageId}")
  .onWrite((change) => {
    console.log(`message before ${change.before.data()} after ${change.after.data()}`);

    return algoliaUpdate(messagesIndex, change)
  });

exports.algoliaUsers = functions.firestore
  .document("users/{userId}")
  .onWrite((change) => {
    console.log(`user before ${change.before.data()} after ${change.after.data()}`);

    return algoliaUpdate(usersIndex, change)
  });

exports.createMessageContent = functions.firestore
  .document("chats/{chatId}/messages/{messageId}")
  .onCreate((snap, context) => {
    const createdValue = snap.data();
    if (createdValue && createdValue["kind"]) {
      const imagesRemovePromises = createdValue["kind"].map((content: any) => {
        const image = content["image"];
        if (image) {
          console.log("create media path: " + image.path);

          image.timestamp = createdValue["timestamp"];

          return db.collection("chats").doc(context.params.chatId)
            .collection("media").doc(image.path.replace(/\//g, "_"))
            .set(image)
        }
        return null
      }).filter(Boolean);

      console.log("count: " + imagesRemovePromises.length);

      return Promise.all(imagesRemovePromises);
    }
    return null
  });

exports.deleteMessageContent = functions.firestore
  .document("chats/{chatId}/messages/{messageId}")
  .onDelete((snap, context) => {
    const deletedValue = snap.data();
    if (deletedValue && deletedValue["kind"]) {
      const kindList = deletedValue["kind"];

      const forward = kindList[0]["forward"];

      console.log("forward: " + forward);

      const imagesRemovePromises = kindList.map((content: any) => {
        const image = content["image"];
        if (image) {
          console.log("delete media path: " + image.path);

          const promiseList = [];

          if (!forward) {
            const pathIndex = image.path.length - 4
            promiseList.push(storage.file([
              image.path.slice(0, pathIndex),
              "_200x200",
              image.path.slice(pathIndex)
            ].join("")).delete())
            promiseList.push(storage.file(image.path).delete())
          }

          promiseList.push(db.collection("chats").doc(context.params.chatId)
            .collection("media").doc(image.path.replace(/\//g, "_"))
            .delete());

          return promiseList
        }

        const audio = content["audio"];
        if (!forward && audio) {
          console.log("delete audio path: " + audio.path);
          return storage.file(audio.path).delete()
        }

        return null
      }).filter(Boolean);

      return Promise.all(imagesRemovePromises);
    }
    return null
  });
