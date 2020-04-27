import {algoliaClient, algoliaUpdate} from "../../algolia";
import * as functions from "firebase-functions";

const usersIndex = algoliaClient.initIndex("users");

export = exports.algoliaUsers = functions.firestore
  .document("users/{userId}")
  .onWrite((change) => {
    return algoliaUpdate(usersIndex, change)
  });
