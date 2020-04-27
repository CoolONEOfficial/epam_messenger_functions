import * as functions from "firebase-functions";
import {db, FieldValue} from "../../../helpers";
import {DocumentSnapshot} from "firebase-functions/lib/providers/firestore";
import {algoliaClient, algoliaUpdate} from "../../../algolia";

export = functions.firestore
  .document("chats/{chatId}/messages/{messageId}")
  .onWrite((change, context) => {
    return Promise.all([
      chatsLastMessage(change, context),
      algoliaMessages(change, context)
    ])
  });

const messagesIndex = algoliaClient.initIndex("messages");

function chatsLastMessage(change: functions.Change<DocumentSnapshot>, context: functions.EventContext) {
  const chatDocRef = db.doc(`chats/${context.params.chatId}`);

  return chatDocRef.collection("messages")
    .orderBy("timestamp", "desc")
    .limit(1)
    .get()
    .then(async (snapshotMessages: any) => {
      if (snapshotMessages.empty) {
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
}

function algoliaMessages(change: functions.Change<DocumentSnapshot>, context: functions.EventContext) {
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
}
