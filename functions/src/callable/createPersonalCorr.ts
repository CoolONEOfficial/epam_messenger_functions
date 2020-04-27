import * as functions from "firebase-functions";
import {db, FieldValue} from "../helpers";

export = functions
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
