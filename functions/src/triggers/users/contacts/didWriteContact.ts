import * as functions from "firebase-functions";
import {db} from "../../../helpers";
import {DocumentSnapshot} from "firebase-functions/lib/providers/firestore";

export = functions.firestore
  .document("users/{userId}/contacts/{contactId}")
  .onWrite((change, context) => {
    return personalCorrNamesSync(change, context)
  });

function personalCorrNamesSync(change: functions.Change<DocumentSnapshot>, context: functions.EventContext) {
  const currentUserId = context.params.userId
  const oldContact = change.before.data()
  if (oldContact === undefined) {
    return null
  }

  const contact = change.after.data()
  if ((contact && "userId" in contact) || "userId" in oldContact) {
    const contactUserId = contact !== undefined ? contact.userId : oldContact.userId
    return db.collection("chats")
      .where('type.personalCorr.between', 'in',
        [[contactUserId, currentUserId], [currentUserId, contactUserId]])
      .limit(1)
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
}
