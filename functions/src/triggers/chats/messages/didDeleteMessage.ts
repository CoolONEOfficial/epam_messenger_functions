import * as functions from "firebase-functions";
import {db, storage} from "../../../helpers";
import {DocumentSnapshot} from "firebase-functions/lib/providers/firestore";

export = functions.firestore
  .document("chats/{chatId}/messages/{messageId}")
  .onDelete((snap, context) => {
    return deleteMessageContent(snap, context)
  });

function deleteMessageContent(snap: DocumentSnapshot, context: functions.EventContext) {
  const deletedValue = snap.data();
  if (deletedValue && deletedValue["kind"]) {
    const kindList = deletedValue["kind"];
    const forward = kindList[0]["forward"];

    const imagesRemovePromises = kindList.map((content: any) => {
      const image = content["image"];
      if (image) {
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
        return storage.file(audio.path).delete()
      }

      return null
    }).filter(Boolean);

    return Promise.all(imagesRemovePromises);
  }
  return null
}
