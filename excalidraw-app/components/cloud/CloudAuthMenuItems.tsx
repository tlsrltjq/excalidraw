import { MainMenu } from "@excalidraw/excalidraw/index";
import {
  loginIcon,
  LibraryIcon,
} from "@excalidraw/excalidraw/components/icons";
import React from "react";

import { useSetAtom } from "../../app-jotai";
import { isCloudConfigured } from "../../cloud/supabaseClient";
import {
  useCloudSession,
  signInWithGoogle,
  signOut,
} from "../../cloud/session";

import { dashboardOpenAtom } from "./Dashboard";

/**
 * Personal Cloud login/logout menu entry. Renders nothing when Cloud isn't
 * configured (`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` unset),
 * so the existing anonymous local-first menu is unaffected until Cloud is
 * actually set up (DECISIONS.md D-004).
 */
export const CloudAuthMenuItems: React.FC = () => {
  const { status, session } = useCloudSession();
  const setDashboardOpen = useSetAtom(dashboardOpenAtom);

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
