import * as functions from "firebase-functions";
import {db} from "../../helpers";
import {DocumentSnapshot} from "firebase-functions/lib/providers/firestore";

export = functions.firestore
  .document("users/{userId}")
  .onUpdate((change, context) => {
    return personalCorrNamesUsers(change, context)
  });

function personalCorrNamesUsers(change: functions.Change<DocumentSnapshot>, context: functions.EventContext) {
  const beforeData = change.before.data();
  const afterData = change.after.data();
  if (beforeData && "name" in beforeData && "surname" in beforeData
    && afterData && "name" in afterData && "surname" in afterData) {
    const oldName = beforeData.name + " " + beforeData.surname
    const newName = afterData.name + " " + afterData.surname
    return db.collection("chats")
      //.where("type.personalCorr.between", "array-contains", context.params.userId) TODO: fix bug with equal user names
      .where("type.personalCorr.betweenNames", "array-contains", oldName)
      .get()
      .then(async (personalCorrs: any) => {
        for (const personalCorrDoc of personalCorrs.docs) {
          const personalCorrData = personalCorrDoc.data()
          if (personalCorrData) {
            const betweenNames = personalCorrData.type.personalCorr.betweenNames
            const updateIndex = betweenNames
              .indexOf(oldName)
            betweenNames[updateIndex] = newName

            await db.doc(`chats/${personalCorrDoc.id}`).update({
              "type.personalCorr.betweenNames": betweenNames
            }).catch((err: any) => "error while update personal corr! " + err);
          }
        }
      })
      .catch((err: any) => {
        console.log("Error getting personal corrs", err);
      })
  }
  return null
}
