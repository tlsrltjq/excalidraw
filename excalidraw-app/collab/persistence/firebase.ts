import {
  isSavedToFirebase,
  loadFilesFromFirebase,
  loadFromFirebase,
  saveFilesToFirebase,
  saveToFirebase,
} from "../../data/firebase";

import type { CollabPersistence } from "./types";

export const firebaseCollabPersistence: CollabPersistence = {
  isSaved: isSavedToFirebase,
  saveScene: saveToFirebase,
  loadScene: loadFromFirebase,
  saveFiles: saveFilesToFirebase,
  loadFiles: loadFilesFromFirebase,
};
