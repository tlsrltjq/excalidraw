import { firebaseCollabPersistence } from "./firebase";

import type { CollabPersistence } from "./types";

// Legacy links keep their existing persistence until a new provider is explicit.
export const collabPersistence: CollabPersistence = firebaseCollabPersistence;
