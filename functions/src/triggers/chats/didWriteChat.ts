import * as functions from "firebase-functions";
import {algoliaClient, algoliaUpdate} from "../../algolia";

const chatsIndex = algoliaClient.initIndex("chats");

export = functions.firestore
  .document("chats/{chatId}")
  .onWrite((change) => {
    return algoliaUpdate(
      chatsIndex,
      change
    )
  });
