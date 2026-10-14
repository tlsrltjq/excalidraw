import {
  CaptureUpdateAction,
  getSceneVersion,
  restoreElements,
  zoomToFitBounds,
  reconcileElements,
} from "@excalidraw/excalidraw";
import { ErrorDialog } from "@excalidraw/excalidraw/components/ErrorDialog";
import { APP_NAME, cloneJSON, EVENT, toBrandedType } from "@excalidraw/common";
import {
  IDLE_THRESHOLD,
  ACTIVE_THRESHOLD,
  UserIdleState,
  assertNever,
  isDevEnv,
  isTestEnv,
  preventUnload,
  resolvablePromise,
  throttleRAF,
} from "@excalidraw/common";
import { decryptData } from "@excalidraw/excalidraw/data/encryption";
import { getVisibleSceneBounds } from "@excalidraw/element";
import { newElementWith } from "@excalidraw/element";
import { isImageElement, isInitializedImageElement } from "@excalidraw/element";
import { AbortError } from "@excalidraw/excalidraw/errors";
import { t } from "@excalidraw/excalidraw/i18n";
import { withBatchedUpdates } from "@excalidraw/excalidraw/reactUtils";

import throttle from "lodash.throttle";
import { PureComponent } from "react";

import { bumpElementVersions } from "@excalidraw/excalidraw/data/restore";

import type {
  ReconciledExcalidrawElement,
  RemoteExcalidrawElement,
} from "@excalidraw/excalidraw/data/reconcile";
import type { ImportedDataState } from "@excalidraw/excalidraw/data/types";
import type {
  ExcalidrawElement,
  FileId,
  InitializedExcalidrawImageElement,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type {
  BinaryFileData,
  ExcalidrawImperativeAPI,
  SocketId,
  Collaborator,
  Gesture,
  UserToFollow,
} from "@excalidraw/excalidraw/types";
import type { Mutable, ValueOf } from "@excalidraw/common/utility-types";

import { appJotaiStore, atom } from "../app-jotai";
import {
  CURSOR_SYNC_TIMEOUT,
  FILE_UPLOAD_MAX_BYTES,
  FIREBASE_STORAGE_PREFIXES,
  INITIAL_SCENE_UPDATE_TIMEOUT,
  LOAD_IMAGES_TIMEOUT,
  WS_SUBTYPES,
  SYNC_FULL_SCENE_INTERVAL_MS,
  WS_EVENTS,
} from "../app_constants";
import {
  generateCollaborationLinkData,
  getCollaborationLink,
  getSyncableElements,
} from "../data";
import {
  encodeFilesForUpload,
  FileManager,
  updateStaleImageStatuses,
} from "../data/FileManager";
import { FileStatusStore } from "../data/fileStatusStore";
import { LocalData } from "../data/LocalData";
import {
  importUsernameFromLocalStorage,
  saveUsernameToLocalStorage,
} from "../data/localStorage";
import { resetBrowserStateVersions } from "../data/tabSync";
import { cloudSessionAtom } from "../cloud/session";
import { clearAutosaveBaseline } from "../cloud/autosave";
import { setCurrentDrawing } from "../cloud/currentDrawing";
import { setDrawingIdInUrl } from "../cloud/urlDrawingId";

import { collabErrorIndicatorAtom } from "./CollabError";
import Portal from "./Portal";
import { collabPersistence } from "./persistence";
import { needsCollabEntry } from "./persistence/entryRoute";
import { leaveCollabEntry } from "./persistence/entryRoute";
import { getCollabParticipantClient } from "./persistence/admission";
import { parseCollabPersistenceRoute } from "./persistence/invites";

import {
  inviteConnectionAtom,
  inviteViewModeAtom,
  isSupabaseCollabEnabled,
} from "./persistence/inviteState";

import type { createRelaySession } from "./persistence/relaySession";

import type { ParticipationMode } from "./persistence/admission";

import type { CollabPersistence } from "./persistence/types";

import type {
  SocketUpdateDataSource,
  SyncableExcalidrawElement,
} from "../data";

export const collabAPIAtom = atom<CollabAPI | null>(null);
export const isCollaboratingAtom = atom(false);
export const isOfflineAtom = atom(false);

interface CollabState {
  errorMessage: string | null;
  /** errors related to saving */
  dialogNotifiedErrors: Record<string, boolean>;
  username: string;
  activeRoomLink: string | null;
}

export const activeRoomLinkAtom = atom<string | null>(null);
export const userToFollowAtom = atom<UserToFollow | null>(null);

type CollabInstance = InstanceType<typeof Collab>;

export interface CollabAPI {
  /** function so that we can access the latest value from stale callbacks */
  isCollaborating: () => boolean;
  onPointerUpdate: CollabInstance["onPointerUpdate"];
  startCollaboration: CollabInstance["startCollaboration"];
  startInvitation: CollabInstance["startInvitation"];
  cancelInvitationConnection: CollabInstance["cancelInvitationConnection"];
  stopCollaboration: CollabInstance["stopCollaboration"];
  syncElements: CollabInstance["syncElements"];
  fetchImageFilesFromFirebase: CollabInstance["fetchImageFilesFromFirebase"];
  setUsername: CollabInstance["setUsername"];
  getUsername: CollabInstance["getUsername"];
  getActiveRoomLink: CollabInstance["getActiveRoomLink"];
  setCollabError: CollabInstance["setErrorDialog"];
  setUserToFollow: CollabInstance["setUserToFollow"];
}

interface CollabProps {
  excalidrawAPI: ExcalidrawImperativeAPI;
}

class Collab extends PureComponent<CollabProps, CollabState> {
  portal: Portal;
  fileManager: FileManager;
  excalidrawAPI: CollabProps["excalidrawAPI"];
  activeIntervalId: number | null;
  idleTimeoutId: number | null;

  private socketInitializationTimer?: number;
  private lastBroadcastedOrReceivedSceneVersion: number = -1;
  private collaborators = new Map<SocketId, Collaborator>();
  private persistence: CollabPersistence = collabPersistence;
  private roomGeneration = 0;
  private secureRoom: {
    committed: boolean;
    scope: "read" | "write" | null;
    route: string;
    viewModeBefore: boolean;
    loading: boolean;
    epoch: number;
    messages: readonly RemoteExcalidrawElement[][];
    incoming: Promise<void>;
    bytes: number;
    bufferBytes: number;
    count: number;
    worker: ReturnType<typeof createRelaySession> | null;
    cleanup(): void;
    reject(error: Error): void;
  } | null = null;

  canWrite = () =>
    !this.secureRoom ||
    (this.secureRoom.committed &&
      this.secureRoom.scope === "write" &&
      !this.secureRoom.loading &&
      !!this.secureRoom.worker?.canWrite());

  cancelInvitationConnection = () => {
    if (this.secureRoom && !this.secureRoom.committed) {
      this.destroySocketClient();
    }
  };

  captureRoomOperation = () => {
    const { roomId, roomKey, socket } = this.portal;
    const generation = this.roomGeneration;
    const persistence = this.persistence;
    return () =>
      generation === this.roomGeneration &&
      persistence === this.persistence &&
      roomId === this.portal.roomId &&
      roomKey === this.portal.roomKey &&
      socket === this.portal.socket;
  };
  /** the socket ids of the users following the current user */
  private followedBy = new Set<SocketId>();

  constructor(props: CollabProps) {
    super(props);
    this.state = {
      errorMessage: null,
      dialogNotifiedErrors: {},
      username: importUsernameFromLocalStorage() || "",
      activeRoomLink: null,
    };
    this.portal = new Portal(this);
    this.fileManager = new FileManager({
      onFileStatusChange: FileStatusStore.updateStatuses.bind(FileStatusStore),
      getFiles: async (fileIds) => {
        const current = this.captureRoomOperation();
        const { roomId, roomKey } = this.portal;
        if (!roomId || !roomKey) {
          throw new AbortError();
        }

        const result = await this.persistence.loadFiles(
          `files/rooms/${roomId}`,
          roomKey,
          fileIds,
        );
        if (!current()) {
          throw new AbortError();
        }
        return result;
      },
      saveFiles: async ({ addedFiles }) => {
        const current = this.captureRoomOperation();
        const { roomId, roomKey } = this.portal;
        if (!roomId || !roomKey) {
          throw new AbortError();
        }

        const encoded = await encodeFilesForUpload({
          files: addedFiles,
          encryptionKey: roomKey,
          maxBytes: FILE_UPLOAD_MAX_BYTES,
        });
        if (!current()) {
          throw new AbortError();
        }
        const { savedFiles, erroredFiles } = await this.persistence.saveFiles({
          prefix: `${FIREBASE_STORAGE_PREFIXES.collabFiles}/${roomId}`,
          files: encoded,
        });
        if (!current()) {
          throw new AbortError();
        }

        return {
          savedFiles: savedFiles.reduce(
            (acc: Map<FileId, BinaryFileData>, id) => {
              const fileData = addedFiles.get(id);
              if (fileData) {
                acc.set(id, fileData);
              }
              return acc;
            },
            new Map(),
          ),
          erroredFiles: erroredFiles.reduce(
            (acc: Map<FileId, BinaryFileData>, id) => {
              const fileData = addedFiles.get(id);
              if (fileData) {
                acc.set(id, fileData);
              }
              return acc;
            },
            new Map(),
          ),
        };
      },
    });
    this.excalidrawAPI = props.excalidrawAPI;
    this.activeIntervalId = null;
    this.idleTimeoutId = null;
  }

  private onUmmount: (() => void) | null = null;

  componentDidMount() {
    window.addEventListener(EVENT.BEFORE_UNLOAD, this.beforeUnload);
    window.addEventListener("online", this.onOfflineStatusToggle);
    window.addEventListener("offline", this.onOfflineStatusToggle);
    window.addEventListener(EVENT.UNLOAD, this.onUnload);

    const unsubOnUserFollow = this.excalidrawAPI.onUserFollow((payload) => {
      this.setUserToFollow(
        payload.action === "FOLLOW" ? payload.userToFollow : null,
      );
    });
    const throttledRelayUserViewportBounds = throttleRAF(
      this.relayVisibleSceneBounds,
    );
    const unsubOnScrollChange = this.excalidrawAPI.onScrollChange(() =>
      throttledRelayUserViewportBounds(),
    );
    this.onUmmount = () => {
      unsubOnUserFollow();
      unsubOnScrollChange();
    };

    this.onOfflineStatusToggle();

    const collabAPI: CollabAPI = {
      isCollaborating: this.isCollaborating,
      onPointerUpdate: this.onPointerUpdate,
      startCollaboration: this.startCollaboration,
      startInvitation: this.startInvitation,
      cancelInvitationConnection: this.cancelInvitationConnection,
      syncElements: this.syncElements,
      fetchImageFilesFromFirebase: this.fetchImageFilesFromFirebase,
      stopCollaboration: this.stopCollaboration,
      setUsername: this.setUsername,
      getUsername: this.getUsername,
      getActiveRoomLink: this.getActiveRoomLink,
      setCollabError: this.setErrorDialog,
      setUserToFollow: this.setUserToFollow,
    };

    appJotaiStore.set(collabAPIAtom, collabAPI);

    if (isTestEnv() || isDevEnv()) {
      window.collab = window.collab || ({} as Window["collab"]);
      Object.defineProperties(window, {
        collab: {
          configurable: true,
          value: this,
        },
      });
    }
  }

  onOfflineStatusToggle = () => {
    appJotaiStore.set(isOfflineAtom, !window.navigator.onLine);
  };

  componentWillUnmount() {
    if (this.secureRoom) {
      this.destroySocketClient({ isUnload: true });
    }
    this.roomGeneration++;
    window.removeEventListener("online", this.onOfflineStatusToggle);
    window.removeEventListener("offline", this.onOfflineStatusToggle);
    window.removeEventListener(EVENT.BEFORE_UNLOAD, this.beforeUnload);
    window.removeEventListener(EVENT.UNLOAD, this.onUnload);
    window.removeEventListener(EVENT.POINTER_MOVE, this.onPointerMove);
    window.removeEventListener(
      EVENT.VISIBILITY_CHANGE,
      this.onVisibilityChange,
    );
    if (this.activeIntervalId) {
      window.clearInterval(this.activeIntervalId);
      this.activeIntervalId = null;
    }
    if (this.idleTimeoutId) {
      window.clearTimeout(this.idleTimeoutId);
      this.idleTimeoutId = null;
    }
    this.onUmmount?.();
  }

  isCollaborating = () => appJotaiStore.get(isCollaboratingAtom)!;

  private setIsCollaborating = (isCollaborating: boolean) => {
    appJotaiStore.set(isCollaboratingAtom, isCollaborating);
  };

  private onUnload = () => {
    this.destroySocketClient({ isUnload: true });
  };

  private beforeUnload = withBatchedUpdates((event: BeforeUnloadEvent) => {
    if (
      this.secureRoom &&
      (!this.secureRoom.committed || this.secureRoom.scope === "read")
    ) {
      return;
    }
    const syncableElements = getSyncableElements(
      this.getSceneElementsIncludingDeleted(),
    );

    if (
      this.isCollaborating() &&
      (this.fileManager.shouldPreventUnload(syncableElements) ||
        !this.persistence.isSaved(this.portal, syncableElements))
    ) {
      // this won't run in time if user decides to leave the site, but
      //  the purpose is to run in immediately after user decides to stay
      this.saveCollabRoomToFirebase(syncableElements);

      if (import.meta.env.VITE_APP_DISABLE_PREVENT_UNLOAD !== "true") {
        preventUnload(event);
      } else {
        console.warn(
          "preventing unload disabled (VITE_APP_DISABLE_PREVENT_UNLOAD)",
        );
      }
    }
  });

  saveCollabRoomToFirebase = async (
    syncableElements: readonly SyncableExcalidrawElement[],
  ) => {
    if (!this.canWrite()) {
      return;
    }
    const current = this.captureRoomOperation();
    syncableElements = cloneJSON(syncableElements);
    try {
      const storedElements = await this.persistence.saveScene(
        this.portal,
        syncableElements,
        this.excalidrawAPI.getAppState(),
      );
      if (!current()) {
        return;
      }

      this.resetErrorIndicator();

      if (this.isCollaborating() && storedElements) {
        this.handleRemoteSceneUpdate(this._reconcileElements(storedElements));
      }
    } catch (error: any) {
      if (!current() || error.name === "AbortError") {
        return;
      }
      const errorMessage = /is longer than.*?bytes/.test(error.message)
        ? t("errors.collabSaveFailed_sizeExceeded")
        : t("errors.collabSaveFailed");

      if (
        !this.state.dialogNotifiedErrors[errorMessage] ||
        !this.isCollaborating()
      ) {
        this.setErrorDialog(errorMessage);
        this.setState({
          dialogNotifiedErrors: {
            ...this.state.dialogNotifiedErrors,
            [errorMessage]: true,
          },
        });
      }

      if (this.isCollaborating()) {
        this.setErrorIndicator(errorMessage);
      }

      console.error(error);
    }
  };

  stopCollaboration = (keepRemoteState = true) => {
    if (this.secureRoom) {
      if (
        keepRemoteState &&
        !window.confirm(t("alerts.collabStopOverridePrompt"))
      ) {
        return;
      }
      this.destroySocketClient();
      if (keepRemoteState) {
        leaveCollabEntry();
      }
      return;
    }
    this.queueBroadcastAllElements.cancel();
    this.queueSaveToFirebase.cancel();
    this.loadImageFiles.cancel();
    this.resetErrorIndicator(true);

    this.saveCollabRoomToFirebase(
      getSyncableElements(
        this.excalidrawAPI.getSceneElementsIncludingDeleted(),
      ),
    );

    if (this.portal.socket && this.fallbackInitializationHandler) {
      this.portal.socket.off(
        "connect_error",
        this.fallbackInitializationHandler,
      );
    }

    if (!keepRemoteState) {
      LocalData.fileStorage.reset();
      this.destroySocketClient();
    } else if (window.confirm(t("alerts.collabStopOverridePrompt"))) {
      // hack to ensure that we prefer we disregard any new browser state
      // that could have been saved in other tabs while we were collaborating
      resetBrowserStateVersions();

      window.history.pushState({}, APP_NAME, window.location.origin);
      this.destroySocketClient();

      LocalData.fileStorage.reset();

      const elements = this.excalidrawAPI
        .getSceneElementsIncludingDeleted()
        .map((element) => {
          if (isImageElement(element) && element.status === "saved") {
            return newElementWith(element, { status: "pending" });
          }
          return element;
        });

      this.excalidrawAPI.updateScene({
        elements,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    }
  };

  private destroySocketClient = (opts?: { isUnload: boolean }) => {
    this.roomGeneration++;
    const previousViewMode = this.secureRoom?.viewModeBefore;
    const copiedSecureScene = this.secureRoom?.committed;
    if (this.secureRoom) {
      const room = this.secureRoom;
      room.worker?.close();
      room.cleanup();
      room.reject(new AbortError());
      this.queueBroadcastAllElements.cancel();
      this.queueSaveToFirebase.cancel();
      this.loadImageFiles.cancel();
      this.portal.queueFileUpload.cancel();
      this.secureRoom = null;
      this.persistence = collabPersistence;
      if (copiedSecureScene) {
        LocalData.fileStorage.reset();
      }
      appJotaiStore.set(inviteConnectionAtom, null);
      appJotaiStore.set(inviteViewModeAtom, null);
    }
    this.lastBroadcastedOrReceivedSceneVersion = -1;
    this.portal.close();
    this.fileManager.reset();
    this.followedBy = new Set();
    if (!opts?.isUnload) {
      this.setIsCollaborating(false);
      this.setActiveRoomLink(null);
      appJotaiStore.set(userToFollowAtom, null);
      this.collaborators = new Map();
      this.excalidrawAPI.updateScene({
        collaborators: this.collaborators,
      });
      LocalData.resumeSave("collaboration");
      if (previousViewMode !== undefined) {
        this.excalidrawAPI.updateScene({
          ...(copiedSecureScene
            ? {
                elements: this.getSceneElementsIncludingDeleted().map(
                  (element) =>
                    isImageElement(element) && element.status === "saved"
                      ? newElementWith(element, { status: "pending" })
                      : element,
                ),
              }
            : {}),
          appState: { viewModeEnabled: previousViewMode },
        });
      }
    }
  };

  private fetchImageFilesFromFirebase = async (opts: {
    elements: readonly ExcalidrawElement[];
    /**
     * Indicates whether to fetch files that are errored or pending and older
     * than 10 seconds.
     *
     * Use this as a mechanism to fetch files which may be ok but for some
     * reason their status was not updated correctly.
     */
    forceFetchFiles?: boolean;
  }) => {
    const unfetchedImages = opts.elements
      .filter((element) => {
        return (
          isInitializedImageElement(element) &&
          !this.fileManager.isFileTracked(element.fileId) &&
          !element.isDeleted &&
          (opts.forceFetchFiles
            ? element.status !== "pending" ||
              Date.now() - element.updated > 10000
            : element.status === "saved")
        );
      })
      .map((element) => (element as InitializedExcalidrawImageElement).fileId);

    return await this.fileManager.getFiles(unfetchedImages);
  };

  private decryptPayload = async (
    iv: Uint8Array<ArrayBuffer>,
    encryptedData: ArrayBuffer,
    decryptionKey: string,
  ): Promise<ValueOf<SocketUpdateDataSource>> => {
    try {
      const decrypted = await decryptData(iv, encryptedData, decryptionKey);

      const decodedData = new TextDecoder("utf-8").decode(
        new Uint8Array(decrypted),
      );
      return JSON.parse(decodedData);
    } catch (error) {
      window.alert(t("alerts.decryptFailed"));
      console.error(error);
      return {
        type: WS_SUBTYPES.INVALID_RESPONSE,
      };
    }
  };

  private fallbackInitializationHandler: null | (() => any) = null;

  startInvitation = async (
    mode: ParticipationMode,
    entryCurrent: () => boolean,
  ) => {
    if (!isSupabaseCollabEnabled()) {
      throw new Error("새 협업 방 연결을 아직 사용할 수 없습니다.");
    }
    const route = window.location.href;
    const invite = parseCollabPersistenceRoute(route);
    if (invite.provider !== "supabase" || this.portal.socket) {
      throw new Error("협업 입장을 시작할 수 없습니다.");
    }
    const account = appJotaiStore.get(cloudSessionAtom);
    if (mode === "account" && account.status !== "signed-in") {
      throw new Error("로그인 상태를 확인하고 다시 참여하세요.");
    }
    const accountId = account.session?.user.id;
    const client = getCollabParticipantClient(mode);
    const [
      { default: socketIOClient },
      { createSupabaseCollabPersistence },
      { createRelaySession },
      { createRelayTicketRequest },
    ] = await Promise.all([
      import("socket.io-client"),
      import("./persistence/supabase"),
      import("./persistence/relaySession"),
      import("./persistence/relayTicketRequest"),
    ]);
    if (
      !entryCurrent() ||
      window.location.href !== route ||
      this.portal.socket
    ) {
      throw new AbortError();
    }
    const socket = socketIOClient(import.meta.env.VITE_APP_WS_SERVER_URL, {
      autoConnect: false,
      transports: ["websocket", "polling"],
    });
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const completion = new Promise<void>((done, failed) => {
      resolve = done;
      reject = failed;
    });
    const room: NonNullable<Collab["secureRoom"]> = {
      committed: false,
      scope: null,
      route,
      viewModeBefore: this.excalidrawAPI.getAppState().viewModeEnabled,
      loading: true,
      epoch: 0,
      messages: [],
      incoming: Promise.resolve(),
      bytes: 0,
      bufferBytes: 0,
      count: 0,
      worker: null,
      cleanup: () => {},
      reject,
    };
    this.roomGeneration++;
    this.secureRoom = room;
    const current = () =>
      this.secureRoom === room &&
      (room.committed || entryCurrent()) &&
      window.location.href === room.route &&
      appJotaiStore.get(cloudSessionAtom).session?.user.id === accountId;
    const fail = (message: string) => {
      if (this.secureRoom !== room) {
        return;
      }
      const committed = room.committed;
      reject(new Error(message));
      this.destroySocketClient();
      if (committed) {
        this.setErrorDialog(message);
      }
    };
    const cancelStale = () => {
      if (this.secureRoom === room && !current()) {
        this.destroySocketClient();
      }
    };
    const unsubscribe = appJotaiStore.sub(cloudSessionAtom, cancelStale);
    const events = ["hashchange", "popstate", "personal-collab-route-change"];
    events.forEach((event) => window.addEventListener(event, cancelStale));
    room.cleanup = () => {
      unsubscribe();
      events.forEach((event) => window.removeEventListener(event, cancelStale));
      socket.off("client-broadcast", receive);
      socket.off(WS_EVENTS.USER_FOLLOW_ROOM_CHANGE, followChange);
      document.removeEventListener(EVENT.POINTER_MOVE, this.onPointerMove);
      document.removeEventListener(
        EVENT.VISIBILITY_CHANGE,
        this.onVisibilityChange,
      );
      if (this.activeIntervalId) {
        clearInterval(this.activeIntervalId);
        this.activeIntervalId = null;
      }
      if (this.idleTimeoutId) {
        clearTimeout(this.idleTimeoutId);
        this.idleTimeoutId = null;
      }
    };
    LocalData.flushSave();
    LocalData.pauseSave("collaboration");
    this.setIsCollaborating(true);
    appJotaiStore.set(inviteViewModeAtom, true);
    this.fileManager.reset();
    this.portal.open(socket, invite.roomId, invite.roomKey, {
      isCurrent: current,
      joinLegacy: false,
    });
    const receive = (
      encryptedData: ArrayBuffer,
      iv: Uint8Array<ArrayBuffer>,
    ) => {
      const epoch = room.epoch;
      const socketId = socket.id;
      if (
        !current() ||
        ++room.count + room.messages.length > 64 ||
        (room.bytes += encryptedData.byteLength) + room.bufferBytes >
          8 * 1024 * 1024
      ) {
        fail("협업 초기 데이터를 처리하지 못했습니다. 다시 참여하세요.");
        return;
      }
      room.incoming = room.incoming
        .then(async () => {
          if (!current() || epoch !== room.epoch || socket.id !== socketId) {
            return;
          }
          const bytes = await decryptData(iv, encryptedData, invite.roomKey);
          if (!current() || epoch !== room.epoch || socket.id !== socketId) {
            return;
          }
          const data = JSON.parse(new TextDecoder().decode(bytes));
          room.bytes -= encryptedData.byteLength;
          room.count--;
          if (
            data.type === WS_SUBTYPES.INIT ||
            data.type === WS_SUBTYPES.UPDATE
          ) {
            if (!Array.isArray(data.payload?.elements)) {
              throw new Error("Invalid scene");
            }
            const elements = toBrandedType<readonly RemoteExcalidrawElement[]>(
              data.payload.elements,
            );
            if (room.loading) {
              room.bufferBytes += encryptedData.byteLength;
              room.messages = [...room.messages, [...elements]];
              return;
            }
            this.handleRemoteSceneUpdate(this._reconcileElements(elements));
          } else if (
            room.committed &&
            !room.loading &&
            data.payload?.socketId
          ) {
            if (data.type === WS_SUBTYPES.MOUSE_LOCATION) {
              const { pointer, button, username, selectedElementIds } =
                data.payload;
              this.updateCollaborator(data.payload.socketId, {
                pointer,
                button,
                username,
                selectedElementIds,
              });
            } else if (data.type === WS_SUBTYPES.IDLE_STATUS) {
              const { userState, username } = data.payload;
              this.updateCollaborator(data.payload.socketId, {
                userState,
                username,
              });
            } else if (data.type === WS_SUBTYPES.USER_VISIBLE_SCENE_BOUNDS) {
              const target = appJotaiStore.get(userToFollowAtom);
              if (
                target &&
                target.socketId === data.payload.socketId &&
                !this.followedBy.has(target.socketId)
              ) {
                this.excalidrawAPI.updateScene({
                  appState: zoomToFitBounds({
                    appState: this.excalidrawAPI.getAppState(),
                    bounds: data.payload.sceneBounds,
                    fit: "contain",
                  }).appState,
                });
              }
            }
          }
        })
        .catch(() => {
          if (current()) {
            fail("협업 데이터를 확인하지 못했습니다. 다시 참여하세요.");
          }
        });
    };
    socket.on("client-broadcast", receive);
    const followChange = (followers: SocketId[]) => {
      if (current() && this.canWrite()) {
        this.followedBy = new Set(followers);
        this.relayVisibleSceneBounds({ force: true });
      }
    };
    socket.on(WS_EVENTS.USER_FOLLOW_ROOM_CHANGE, followChange);
    room.worker = createRelaySession({
      socket,
      roomId: invite.roomId,
      isCurrent: current,
      requestTicket: createRelayTicketRequest(
        client,
        invite,
        window.location.origin,
      ),
      onPending: () => {
        if (!current()) {
          return;
        }
        room.epoch++;
        room.loading = true;
        room.messages = [];
        room.bytes = 0;
        room.bufferBytes = 0;
        room.count = 0;
        this.portal.socketInitialized = false;
        this.portal.broadcastedElementVersions.clear();
        this.fileManager.reset();
        appJotaiStore.set(inviteViewModeAtom, true);
      },
      onReady: async (scope, preparationCurrent) => {
        if (!current() || !preparationCurrent()) {
          throw new AbortError();
        }
        if (scope !== room.scope || room.loading) {
          const providerEpoch = room.epoch;
          const provider: CollabPersistence = createSupabaseCollabPersistence({
            client,
            invite,
            scope,
            isCurrent: () =>
              current() &&
              room.epoch === providerEpoch &&
              this.persistence === provider,
          });
          this.persistence = provider;
          room.scope = scope;
          if (scope === "read") {
            appJotaiStore.set(userToFollowAtom, null);
          }
          this.fileManager.reset();
        }
        if (room.loading) {
          const elements = await this.persistence.loadScene(
            invite.roomId,
            invite.roomKey,
            socket,
          );
          await room.incoming;
          if (!current() || !preparationCurrent()) {
            throw new AbortError();
          }
          if (!room.committed) {
            const original = {
              elements: this.getSceneElementsIncludingDeleted(),
              files: { ...this.excalidrawAPI.getFiles() },
              appState: this.excalidrawAPI.getAppState(),
            };
            try {
              this.excalidrawAPI.resetScene();
              this.excalidrawAPI.updateScene({
                elements: elements ?? [],
                captureUpdate: CaptureUpdateAction.NEVER,
              });
              for (const message of room.messages) {
                this.handleRemoteSceneUpdate(this._reconcileElements(message));
              }
            } catch (error) {
              this.excalidrawAPI.resetScene();
              this.excalidrawAPI.addFiles(Object.values(original.files));
              this.excalidrawAPI.updateScene({
                elements: original.elements,
                appState: original.appState,
                captureUpdate: CaptureUpdateAction.NEVER,
              });
              throw error;
            }
            // Cloud autosave remains paused until the original drawing is detached.
            clearAutosaveBaseline();
            setCurrentDrawing(null);
            setDrawingIdInUrl(null, { replace: true });
            room.route = window.location.href;
          } else if (elements) {
            this.handleRemoteSceneUpdate(
              this._reconcileElements(
                toBrandedType<readonly RemoteExcalidrawElement[]>(elements),
              ),
            );
          }
          if (room.committed) {
            for (const message of room.messages) {
              this.handleRemoteSceneUpdate(this._reconcileElements(message));
            }
          }
          room.messages = [];
          room.bufferBytes = 0;
          room.loading = false;
          if (!room.committed) {
            this.initializeIdleDetector();
          }
          room.committed = true;
          this.portal.socketInitialized = true;
          this.setLastBroadcastedOrReceivedSceneVersion(
            getSceneVersion(this.getSceneElementsIncludingDeleted()),
          );
          this.setActiveRoomLink(room.route);
          appJotaiStore.set(inviteConnectionAtom, room.route);
          window.dispatchEvent(new Event("personal-collab-route-change"));
          this.loadImageFiles();
        }
        appJotaiStore.set(inviteViewModeAtom, scope === "read");
        this.excalidrawAPI.updateScene({
          appState: { viewModeEnabled: scope === "read" },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        resolve();
        setTimeout(() => {
          if (current() && this.canWrite()) {
            void this.portal.broadcastScene(
              WS_SUBTYPES.UPDATE,
              this.getSceneElementsIncludingDeleted(),
              true,
            );
            this.queueSaveToFirebase();
          }
        }, 0);
      },
      onError: fail,
    });
    socket.connect();
    return completion;
  };

  startCollaboration = async (
    existingRoomLinkData: null | { roomId: string; roomKey: string },
  ) => {
    if (
      needsCollabEntry(window.location.href) ||
      (existingRoomLinkData && /^sc_/i.test(existingRoomLinkData.roomId))
    ) {
      throw new Error("새 협업 방 연결을 아직 사용할 수 없습니다.");
    }
    if (!this.state.username) {
      import("@excalidraw/random-username").then(({ getRandomUsername }) => {
        const username = getRandomUsername();
        this.setUsername(username);
      });
    }

    if (this.portal.socket) {
      return null;
    }

    this.roomGeneration++;
    const currentStart = this.captureRoomOperation();

    let roomId;
    let roomKey;

    if (existingRoomLinkData) {
      ({ roomId, roomKey } = existingRoomLinkData);
    } else {
      ({ roomId, roomKey } = await generateCollaborationLinkData());
      if (!currentStart()) {
        throw new AbortError();
      }
      window.history.pushState(
        {},
        APP_NAME,
        getCollaborationLink({ roomId, roomKey }),
      );
    }

    // TODO: `ImportedDataState` type here seems abused
    const scenePromise = resolvablePromise<
      | (ImportedDataState & { elements: readonly OrderedExcalidrawElement[] })
      | null
    >();

    this.setIsCollaborating(true);
    LocalData.pauseSave("collaboration");

    const { default: socketIOClient } = await import(
      /* webpackChunkName: "socketIoClient" */ "socket.io-client"
    );
    if (!currentStart()) {
      throw new AbortError();
    }

    const fallbackInitializationHandler = () => {
      this.initializeRoom({
        roomLinkData: existingRoomLinkData,
        fetchScene: true,
      }).then((scene) => {
        scenePromise.resolve(scene);
      });
    };
    this.fallbackInitializationHandler = fallbackInitializationHandler;

    try {
      this.portal.socket = this.portal.open(
        socketIOClient(import.meta.env.VITE_APP_WS_SERVER_URL, {
          transports: ["websocket", "polling"],
        }),
        roomId,
        roomKey,
      );

      this.portal.socket.once("connect_error", fallbackInitializationHandler);
    } catch (error: any) {
      console.error(error);
      this.setErrorDialog(error.message);
      return null;
    }

    if (existingRoomLinkData) {
      // when joining existing room, don't merge it with current scene data
      this.excalidrawAPI.resetScene();
    } else {
      const elements = this.excalidrawAPI.getSceneElements().map((element) => {
        if (isImageElement(element) && element.status === "saved") {
          return newElementWith(element, { status: "pending" });
        }
        return element;
      });
      // remove deleted elements from elements array to ensure we don't
      // expose potentially sensitive user data in case user manually deletes
      // existing elements (or clears scene), which would otherwise be persisted
      // to database even if deleted before creating the room.
      this.excalidrawAPI.updateScene({
        elements,
        captureUpdate: CaptureUpdateAction.NEVER,
      });

      this.saveCollabRoomToFirebase(getSyncableElements(elements));
    }

    // fallback in case you're not alone in the room but still don't receive
    // initial SCENE_INIT message
    this.socketInitializationTimer = window.setTimeout(
      fallbackInitializationHandler,
      INITIAL_SCENE_UPDATE_TIMEOUT,
    );

    // All socket listeners are moving to Portal
    this.portal.socket.on(
      "client-broadcast",
      async (encryptedData: ArrayBuffer, iv: Uint8Array<ArrayBuffer>) => {
        const current = this.captureRoomOperation();
        if (!this.portal.roomKey) {
          return;
        }

        const decryptedData = await this.decryptPayload(
          iv,
          encryptedData,
          this.portal.roomKey,
        );
        if (!current()) {
          return;
        }

        switch (decryptedData.type) {
          case WS_SUBTYPES.INVALID_RESPONSE:
            return;
          case WS_SUBTYPES.INIT: {
            if (!this.portal.socketInitialized) {
              this.initializeRoom({ fetchScene: false });
              const remoteElements = toBrandedType<
                readonly RemoteExcalidrawElement[]
              >(decryptedData.payload.elements);
              const reconciledElements =
                this._reconcileElements(remoteElements);
              this.handleRemoteSceneUpdate(reconciledElements);
              // noop if already resolved via init from firebase
              scenePromise.resolve({
                elements: reconciledElements,
                scrollToContent: true,
              });
            }
            break;
          }
          case WS_SUBTYPES.UPDATE:
            this.handleRemoteSceneUpdate(
              this._reconcileElements(
                toBrandedType<readonly RemoteExcalidrawElement[]>(
                  decryptedData.payload.elements,
                ),
              ),
            );
            break;
          case WS_SUBTYPES.MOUSE_LOCATION: {
            const { pointer, button, username, selectedElementIds } =
              decryptedData.payload;

            const socketId: SocketUpdateDataSource["MOUSE_LOCATION"]["payload"]["socketId"] =
              decryptedData.payload.socketId ||
              // @ts-ignore legacy, see #2094 (#2097)
              decryptedData.payload.socketID;

            this.updateCollaborator(socketId, {
              pointer,
              button,
              selectedElementIds,
              username,
            });

            break;
          }

          case WS_SUBTYPES.USER_VISIBLE_SCENE_BOUNDS: {
            const { sceneBounds, socketId } = decryptedData.payload;

            const userToFollow = appJotaiStore.get(userToFollowAtom);

            // we're not following the user
            // (shouldn't happen, but could be late message or bug upstream)
            if (userToFollow?.socketId !== socketId) {
              console.warn(
                `receiving remote client's (from ${socketId}) viewport bounds even though we're not subscribed to it!`,
              );
              return;
            }

            // cross-follow case, ignore updates in this case
            if (this.followedBy.has(userToFollow.socketId)) {
              return;
            }

            const appState = this.excalidrawAPI.getAppState();

            this.excalidrawAPI.updateScene({
              appState: zoomToFitBounds({
                appState,
                bounds: sceneBounds,
                fit: "contain",
              }).appState,
            });

            break;
          }

          case WS_SUBTYPES.IDLE_STATUS: {
            const { userState, socketId, username } = decryptedData.payload;
            this.updateCollaborator(socketId, {
              userState,
              username,
            });
            break;
          }

          default: {
            assertNever(decryptedData, null);
          }
        }
      },
    );

    this.portal.socket.on("first-in-room", async () => {
      if (this.portal.socket) {
        this.portal.socket.off("first-in-room");
      }
      const sceneData = await this.initializeRoom({
        fetchScene: true,
        roomLinkData: existingRoomLinkData,
      });
      scenePromise.resolve(sceneData);
    });

    this.portal.socket.on(
      WS_EVENTS.USER_FOLLOW_ROOM_CHANGE,
      (followedBy: SocketId[]) => {
        this.followedBy = new Set(followedBy);

        this.relayVisibleSceneBounds({ force: true });
      },
    );

    this.initializeIdleDetector();

    this.setActiveRoomLink(window.location.href);

    return scenePromise;
  };

  private initializeRoom = async ({
    fetchScene,
    roomLinkData,
  }:
    | {
        fetchScene: true;
        roomLinkData: { roomId: string; roomKey: string } | null;
      }
    | { fetchScene: false; roomLinkData?: null }) => {
    const current = this.captureRoomOperation();
    clearTimeout(this.socketInitializationTimer!);
    if (this.portal.socket && this.fallbackInitializationHandler) {
      this.portal.socket.off(
        "connect_error",
        this.fallbackInitializationHandler,
      );
    }
    if (fetchScene && roomLinkData && this.portal.socket) {
      this.excalidrawAPI.resetScene();

      try {
        const elements = await this.persistence.loadScene(
          roomLinkData.roomId,
          roomLinkData.roomKey,
          this.portal.socket,
        );
        if (!current()) {
          return null;
        }
        if (elements) {
          this.setLastBroadcastedOrReceivedSceneVersion(
            getSceneVersion(elements),
          );

          return {
            elements,
            scrollToContent: true,
          };
        }
      } catch (error: any) {
        if (!current() || error.name === "AbortError") {
          return null;
        }
        // log the error and move on. other peers will sync us the scene.
        console.error(error);
      } finally {
        if (current()) {
          this.portal.socketInitialized = true;
        }
      }
    } else {
      this.portal.socketInitialized = true;
    }
    return null;
  };

  private _reconcileElements = (
    remoteElements: readonly RemoteExcalidrawElement[],
  ): ReconciledExcalidrawElement[] => {
    const appState = this.excalidrawAPI.getAppState();

    const existingElements = this.getSceneElementsIncludingDeleted();

    // NOTE ideally we restore _after_ reconciliation but we can't do that
    // as we'd regenerate even elements such as appState.newElement which would
    // break the state
    remoteElements = restoreElements(remoteElements, existingElements);

    let reconciledElements = reconcileElements(
      existingElements,
      remoteElements,
      appState,
    );

    reconciledElements = bumpElementVersions(
      reconciledElements,
      existingElements,
    );

    // Avoid broadcasting to the rest of the collaborators the scene
    // we just received!
    // Note: this needs to be set before updating the scene as it
    // synchronously calls render.
    this.setLastBroadcastedOrReceivedSceneVersion(
      getSceneVersion(reconciledElements),
    );

    return reconciledElements;
  };

  private loadImageFiles = throttle(async () => {
    const current = this.captureRoomOperation();
    try {
      const { loadedFiles, erroredFiles } =
        await this.fetchImageFilesFromFirebase({
          elements: this.excalidrawAPI.getSceneElementsIncludingDeleted(),
        });

      if (!current()) {
        return;
      }

      this.excalidrawAPI.addFiles(loadedFiles);

      updateStaleImageStatuses({
        excalidrawAPI: this.excalidrawAPI,
        erroredFiles,
        elements: this.excalidrawAPI.getSceneElementsIncludingDeleted(),
      });
    } catch (error: any) {
      if (current() && error.name !== "AbortError") {
        this.setErrorDialog("협업 이미지를 불러오지 못했습니다.");
      }
    }
  }, LOAD_IMAGES_TIMEOUT);

  private handleRemoteSceneUpdate = (
    elements: ReconciledExcalidrawElement[],
  ) => {
    this.excalidrawAPI.updateScene({
      elements,
      captureUpdate: CaptureUpdateAction.NEVER,
    });

    this.loadImageFiles();
  };

  private onPointerMove = () => {
    if (this.idleTimeoutId) {
      window.clearTimeout(this.idleTimeoutId);
      this.idleTimeoutId = null;
    }

    this.idleTimeoutId = window.setTimeout(this.reportIdle, IDLE_THRESHOLD);

    if (!this.activeIntervalId) {
      this.activeIntervalId = window.setInterval(
        this.reportActive,
        ACTIVE_THRESHOLD,
      );
    }
  };

  private onVisibilityChange = () => {
    if (document.hidden) {
      if (this.idleTimeoutId) {
        window.clearTimeout(this.idleTimeoutId);
        this.idleTimeoutId = null;
      }
      if (this.activeIntervalId) {
        window.clearInterval(this.activeIntervalId);
        this.activeIntervalId = null;
      }
      this.onIdleStateChange(UserIdleState.AWAY);
    } else {
      this.idleTimeoutId = window.setTimeout(this.reportIdle, IDLE_THRESHOLD);
      this.activeIntervalId = window.setInterval(
        this.reportActive,
        ACTIVE_THRESHOLD,
      );
      this.onIdleStateChange(UserIdleState.ACTIVE);
    }
  };

  private reportIdle = () => {
    this.onIdleStateChange(UserIdleState.IDLE);
    if (this.activeIntervalId) {
      window.clearInterval(this.activeIntervalId);
      this.activeIntervalId = null;
    }
  };

  private reportActive = () => {
    this.onIdleStateChange(UserIdleState.ACTIVE);
  };

  private initializeIdleDetector = () => {
    document.addEventListener(EVENT.POINTER_MOVE, this.onPointerMove);
    document.addEventListener(EVENT.VISIBILITY_CHANGE, this.onVisibilityChange);
  };

  setCollaborators(sockets: SocketId[]) {
    const collaborators: InstanceType<typeof Collab>["collaborators"] =
      new Map();
    for (const socketId of sockets) {
      const isCurrentUser = socketId === this.portal.socket?.id;
      collaborators.set(
        socketId,
        Object.assign(
          // we never receive our own broadcasts, so we need to seed
          // our own collaborator entry with the local username
          isCurrentUser ? { username: this.state.username } : {},
          this.collaborators.get(socketId),
          { isCurrentUser },
        ),
      );
    }
    this.collaborators = collaborators;
    this.excalidrawAPI.updateScene({ collaborators });

    // unfollow if the followed user left the room
    const userToFollow = appJotaiStore.get(userToFollowAtom);
    if (userToFollow && !collaborators.has(userToFollow.socketId)) {
      this.setUserToFollow(null);
    }
  }

  updateCollaborator = (socketId: SocketId, updates: Partial<Collaborator>) => {
    const isCurrentUser = socketId === this.portal.socket?.id;
    const collaborators = new Map(this.collaborators);
    const user: Mutable<Collaborator> = Object.assign(
      // we never receive our own broadcasts, so we need to seed
      // our own collaborator entry with the local username
      isCurrentUser ? { username: this.state.username } : {},
      collaborators.get(socketId),
      updates,
      { isCurrentUser },
    );
    collaborators.set(socketId, user);
    this.collaborators = collaborators;

    this.excalidrawAPI.updateScene({
      collaborators,
    });
  };

  public setLastBroadcastedOrReceivedSceneVersion = (version: number) => {
    this.lastBroadcastedOrReceivedSceneVersion = version;
  };

  public getLastBroadcastedOrReceivedSceneVersion = () => {
    return this.lastBroadcastedOrReceivedSceneVersion;
  };

  public getSceneElementsIncludingDeleted = () => {
    return this.excalidrawAPI.getSceneElementsIncludingDeleted();
  };

  onPointerUpdate = throttle(
    (payload: {
      pointer: SocketUpdateDataSource["MOUSE_LOCATION"]["payload"]["pointer"];
      button: SocketUpdateDataSource["MOUSE_LOCATION"]["payload"]["button"];
      pointersMap: Gesture["pointers"];
    }) => {
      payload.pointersMap.size < 2 &&
        this.portal.socket &&
        this.portal.broadcastMouseLocation(payload);
    },
    CURSOR_SYNC_TIMEOUT,
  );

  relayVisibleSceneBounds = (props?: { force: boolean }) => {
    if (this.portal.socket && (this.followedBy.size > 0 || props?.force)) {
      this.portal.broadcastVisibleSceneBounds(
        {
          sceneBounds: getVisibleSceneBounds(this.excalidrawAPI.getAppState()),
        },
        `follow@${this.portal.socket.id}`,
      );
    }
  };

  onIdleStateChange = (userState: UserIdleState) => {
    this.portal.broadcastIdleChange(userState);
  };

  broadcastElements = (elements: readonly OrderedExcalidrawElement[]) => {
    if (
      getSceneVersion(elements) >
      this.getLastBroadcastedOrReceivedSceneVersion()
    ) {
      this.portal.broadcastScene(WS_SUBTYPES.UPDATE, elements, false);
      this.lastBroadcastedOrReceivedSceneVersion = getSceneVersion(elements);
      this.queueBroadcastAllElements();
    }
  };

  syncElements = (elements: readonly OrderedExcalidrawElement[]) => {
    if (!this.canWrite()) {
      return;
    }
    this.broadcastElements(elements);
    this.queueSaveToFirebase();
  };

  queueBroadcastAllElements = throttle(() => {
    this.portal.broadcastScene(
      WS_SUBTYPES.UPDATE,
      this.excalidrawAPI.getSceneElementsIncludingDeleted(),
      true,
    );
    const currentVersion = this.getLastBroadcastedOrReceivedSceneVersion();
    const newVersion = Math.max(
      currentVersion,
      getSceneVersion(this.getSceneElementsIncludingDeleted()),
    );
    this.setLastBroadcastedOrReceivedSceneVersion(newVersion);
  }, SYNC_FULL_SCENE_INTERVAL_MS);

  queueSaveToFirebase = throttle(
    () => {
      if (this.portal.socketInitialized) {
        this.saveCollabRoomToFirebase(
          getSyncableElements(
            this.excalidrawAPI.getSceneElementsIncludingDeleted(),
          ),
        );
      }
    },
    SYNC_FULL_SCENE_INTERVAL_MS,
    { leading: false },
  );

  setUserToFollow = (userToFollow: UserToFollow | null) => {
    if (this.secureRoom && !this.canWrite() && userToFollow) {
      return;
    }
    const prev = appJotaiStore.get(userToFollowAtom) ?? null;

    if (prev?.socketId !== userToFollow?.socketId && this.portal.socket) {
      // leave the previous user's follow room before joining the next one
      if (prev) {
        this.portal.broadcastUserFollowed({
          userToFollow: prev,
          action: "UNFOLLOW",
        });
      }
      if (userToFollow) {
        this.portal.broadcastUserFollowed({
          userToFollow,
          action: "FOLLOW",
        });
      }
    }

    appJotaiStore.set(userToFollowAtom, userToFollow);
  };

  setUsername = (username: string) => {
    this.setState({ username });
    saveUsernameToLocalStorage(username);

    // keep our own collaborator entry in sync
    const socketId = this.portal.socket?.id as SocketId | undefined;
    if (socketId && this.collaborators.has(socketId)) {
      this.updateCollaborator(socketId, { username });
    }
  };

  getUsername = () => this.state.username;

  setActiveRoomLink = (activeRoomLink: string | null) => {
    this.setState({ activeRoomLink });
    appJotaiStore.set(activeRoomLinkAtom, activeRoomLink);
  };

  getActiveRoomLink = () => this.state.activeRoomLink;

  setErrorIndicator = (errorMessage: string | null) => {
    appJotaiStore.set(collabErrorIndicatorAtom, {
      message: errorMessage,
      nonce: Date.now(),
    });
  };

  resetErrorIndicator = (resetDialogNotifiedErrors = false) => {
    appJotaiStore.set(collabErrorIndicatorAtom, { message: null, nonce: 0 });
    if (resetDialogNotifiedErrors) {
      this.setState({
        dialogNotifiedErrors: {},
      });
    }
  };

  setErrorDialog = (errorMessage: string | null) => {
    this.setState({
      errorMessage,
    });
  };

  render() {
    const { errorMessage } = this.state;

    return (
      <>
        {errorMessage != null && (
          <ErrorDialog onClose={() => this.setErrorDialog(null)}>
            {errorMessage}
          </ErrorDialog>
        )}
      </>
    );
  }
}

declare global {
  interface Window {
    collab: InstanceType<typeof Collab>;
  }
}

if (isTestEnv() || isDevEnv()) {
  window.collab = window.collab || ({} as Window["collab"]);
}

export default Collab;

export type TCollabClass = Collab;
