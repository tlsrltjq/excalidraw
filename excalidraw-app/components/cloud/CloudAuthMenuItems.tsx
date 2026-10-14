import { isRunningInIframe } from "@excalidraw/common";
import { MainMenu } from "@excalidraw/excalidraw/index";
import {
  loginIcon,
  LibraryIcon,
  usersIcon,
} from "@excalidraw/excalidraw/components/icons";
import React from "react";

import { useSetAtom } from "../../app-jotai";
import { isCloudConfigured } from "../../cloud/supabaseClient";
import {
  useCloudSession,
  signInWithGoogle,
  signOut,
} from "../../cloud/session";

import { isSupabaseCollabEnabled } from "../../collab/persistence/inviteState";

import { dashboardOpenAtom } from "./Dashboard";
import { roomManagementOpenAtom } from "./RoomManagement";

/**
 * Personal Cloud login/logout menu entry. Renders nothing when Cloud isn't
 * configured (`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` unset),
 * so the existing anonymous local-first menu is unaffected until Cloud is
 * actually set up (DECISIONS.md D-004).
 */
export const CloudAuthMenuItems: React.FC = () => {
  const { status, session } = useCloudSession();
  const setDashboardOpen = useSetAtom(dashboardOpenAtom);
  const setRoomManagementOpen = useSetAtom(roomManagementOpenAtom);

  if (!isCloudConfigured || status === "loading") {
    return null;
  }

  if (status === "signed-in") {
    const email = session?.user?.email;
    return (
      <>
        <MainMenu.Separator />
        <MainMenu.Item
          icon={LibraryIcon}
          onSelect={() => setDashboardOpen(true)}
        >
          내 그림
        </MainMenu.Item>
        {isSupabaseCollabEnabled() && !isRunningInIframe() && (
          <MainMenu.Item
            icon={usersIcon}
            onSelect={() => setRoomManagementOpen(true)}
          >
            내 협업 방
          </MainMenu.Item>
        )}
        <MainMenu.Item
          icon={loginIcon}
          onSelect={() => {
            void signOut();
          }}
        >
          {email ? `로그아웃 (${email})` : "로그아웃"}
        </MainMenu.Item>
      </>
    );
  }

  return (
    <>
      <MainMenu.Separator />
      <MainMenu.Item
        icon={loginIcon}
        onSelect={() => {
          void signInWithGoogle();
        }}
      >
        Google로 로그인
      </MainMenu.Item>
    </>
  );
};
