import * as functions from "firebase-functions";
import {db} from "../../../helpers";
import {DocumentSnapshot} from "firebase-functions/lib/providers/firestore";

export = functions.firestore
  .document("chats/{chatId}/messages/{messageId}")
  .onCreate((snap, context) => {
    return createMessageContent(snap, context)
  });

function createMessageContent(snap: DocumentSnapshot, context: functions.EventContext) {
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
}
