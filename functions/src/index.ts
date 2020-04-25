import * as functions from "firebase-functions";
import {DocumentSnapshot} from "firebase-functions/lib/providers/firestore";
import { SearchIndex } from "algoliasearch";
const admin = require("firebase-admin");
const FieldValue = admin.firestore.FieldValue;
const firebase_tools = require('firebase-tools');
const algoliasearch = require("algoliasearch");
admin.initializeApp();

const db = admin.firestore();
const storage = admin.storage().bucket();

exports.chatsLastMessage = functions.firestore
  .document("chats/{chatId}/messages/{messageId}")
  .onWrite((change, context) => {

    const chatDocRef = db.doc(`chats/${context.params.chatId}`);

    return chatDocRef.collection("messages")
      .orderBy("timestamp", "desc")
      .limit(1)
      .get()
      .then(async (snapshotMessages: any) => {
        if (snapshotMessages.empty) {
          console.log("No matching documents.");

          await db.doc(`chats/${context.params.chatId}`).set({
              lastMessage: {
                kind: FieldValue.delete(),
                documentId: FieldValue.delete()
              }}, {merge: true})
            .catch((err: any) => "error while add chat! " + err);

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

async function algoliaUpdate(
  index: SearchIndex,
  change: functions.Change<DocumentSnapshot>,
  dataTransform = async (model: any) => {}
) {
  if (change.before.data() === undefined) { // insertion
    const ss = change.after;
    const model = ss.data();
    if (model !== undefined) {
      model.objectID = ss.id;
      await dataTransform(model);
      console.log(`save object ${model}`);
      return index.saveObject(model);
    }
  } else if (change.after.data() === undefined) { // deletion
    const ss = change.before;
    console.log(`delete object ${ss.id}`);
    return index.deleteObject(ss.id);
  } else { // updating
    const ss = change.after;
    const model = ss.data();
    if (model !== undefined) {
      model.objectID = ss.id;
      await dataTransform(model);
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

    return algoliaUpdate(
      chatsIndex,
      change
    )
  });

exports.algoliaMessages = functions.firestore
  .document("chats/{chatId}/messages/{messageId}")
  .onWrite((change, context) => {
    console.log(`message before ${change.before.data()} after ${change.after.data()}`);

    return db.doc(`chats/${context.params.chatId}`).get()
      .then(async (snapshot: any) => {
        await algoliaUpdate(
          messagesIndex,
          change,
          async (data) => {
            data.chatId = context.params.chatId
            data.chatUsers = snapshot.data()["users"]
          }
        );
      })
      .catch((err: any) => {
        console.log("Error getting documents", err);
      })
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

          return db
            .collection("chats").doc(context.params.chatId)
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

          promiseList.push(db
            .collection("chats").doc(context.params.chatId)
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

exports.clearSavedMessages = functions
  .runWith({
    timeoutSeconds: 540,
    memory: '2GB'
  })
  .https.onCall((data, context) => {
    // Only allow authenticated users to execute this function.
    if (!(context.auth)) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Must be an user to initiate clear.'
      );
    }

    const chatId = data.chatId;
    console.log(
      `User ${context.auth.uid} has requested to delete chat chats/${chatId}/messages`
    );

    const path = `chats/${chatId}/messages`;
    return firebase_tools.firestore
      .delete(path, {
        project: process.env.GCLOUD_PROJECT,
        recursive: true,
        yes: true
      })
      .then(() => {
        return {
          path: path
        };
      });
  });

exports.deleteChat = functions
  .runWith({
    timeoutSeconds: 540,
    memory: '2GB'
  })
  .https.onCall((data, context) => {
    // Only allow authenticated users to execute this function.
    if (!(context.auth)) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Must be an user to initiate delete.'
      );
    }

    const chatId = data.chatId;
    console.log(
      `User ${context.auth.uid} has requested to delete chat chats/${chatId}/messages`
    );

    const path = `chats/${chatId}`;
    return firebase_tools.firestore
      .delete(path, {
        project: process.env.GCLOUD_PROJECT,
        recursive: true,
        yes: true
      })
      .then(() => {
        return {
          path: path
        };
      });
  });

exports.createPersonalCorr = functions
  .runWith({
    timeoutSeconds: 540,
    memory: '2GB'
  })
  .https.onCall((data, context) => {
    // Only allow authenticated users to execute this function.
    if (!(context.auth)) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Must be an user to initiate create chat (personal corr).'
      );
    }

    const currentUserId = context.auth.uid
    const chat = data.chat;
    const chatId = data.chatId;
    console.log(
      `User ${context.auth.uid} has requested to create chat (personal corr)`
    );

    const friendId = chat.type.personalCorr.between.find((userId: String) => userId !== currentUserId)

    return Promise.all(
      chat.type.personalCorr.between
        .map((betweenUserId: any) => {
          return db.collection(
            `users/${betweenUserId === currentUserId ? friendId : currentUserId}/contacts`
          ).where(
            "userId",
            "==",
            betweenUserId === currentUserId
              ? currentUserId
              : friendId
          ).limit(1).get()
        })
    ).then(async (snapshots) => {
      chat.type.personalCorr.betweenNames = await Promise.all(
        snapshots.map(async (snap: any, index) => {
          if (snap.empty) {
            const user = await db.doc(`users/${chat.type.personalCorr.between[index]}`).get()
            const userData = user.data()
            if ("name" in userData && "surname" in userData) {
              return userData.name + " " + userData.surname;
            } else {
              return "DELETED";
            }
          }

          const docData = snap.docs[0].data()
          if ("localName" in docData) {
            return docData.localName;
          }
        })
      )

      chat.lastMessage.timestamp = FieldValue.serverTimestamp()

      await db.doc(`chats/${chatId}`).set(chat)
    })
  });

exports.personalCorrNames = functions.firestore
  .document("users/{userId}/contacts/{contactId}")
  .onWrite((change, context) => {
    const oldContact = change.before.data()
    if (oldContact === undefined) {
      return null
    }

    const contact = change.after.data()
    if ((contact && "userId" in contact) || "userId" in oldContact) {
      const contactUserId = contact !== undefined ? contact.userId : oldContact.userId
      return db.collection("chats")
        .where('type.personalCorr.between', 'array-contains', contactUserId)
        .get()
        .then(async (personalCorrs: any) => {
          for (const personalCorrDoc of personalCorrs.docs) {
            const personalCorrData = personalCorrDoc.data()
            if (personalCorrData) {
              const betweenNames = personalCorrData.type.personalCorr.betweenNames
              const updateIndex = personalCorrData.type.personalCorr.between
                .indexOf(contactUserId)
              if (contact !== undefined) {
                betweenNames[updateIndex] = contact.localName
              } else {
                const user = await db.doc(`users/${contactUserId}`).get()
                const userData = user.data()
                if (userData !== undefined) {
                  betweenNames[updateIndex] = userData.name + " " + userData.surname
                }
              }

              await db.doc(`chats/${personalCorrDoc.id}`).set({
                type: {
                  personalCorr: {
                    betweenNames: betweenNames
                  }
                }}, {merge: true}).catch((err: any) => "error while update personal corr! " + err);
            }
          }
        })
        .catch((err: any) => {
          console.log("Error getting documents", err);
        })
    }
    return null
  });
