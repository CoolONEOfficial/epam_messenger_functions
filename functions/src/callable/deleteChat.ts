import * as functions from "firebase-functions";
import {firebase_tools} from "../helpers";

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
