import * as functions from "firebase-functions";
import {SearchIndex} from "algoliasearch";
import {DocumentSnapshot} from "firebase-functions/lib/providers/firestore";

const algoliasearch = require("algoliasearch");

export const algoliaClient = algoliasearch(functions.config().algolia.appid, functions.config().algolia.apikey);

export async function algoliaUpdate(
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
