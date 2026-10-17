import { MainMenu } from "@excalidraw/excalidraw/index";
import { MagicIcon } from "@excalidraw/excalidraw/components/icons";
import React from "react";

import type { Theme } from "@excalidraw/element/types";

import { LanguageList } from "../app-language/LanguageList";

import { useSetAtom } from "../app-jotai";

import { CloudAuthMenuItems } from "./cloud/CloudAuthMenuItems";
import { aiDiagramOpenAtom } from "./cloud/AIDiagram";

export const AppMainMenu: React.FC<{
  onCollabDialogOpen: () => any;
  isCollaborating: boolean;
  isCollabEnabled: boolean;
  theme: Theme | "system";
  refresh: () => void;
}> = React.memo((props) => {
  const setAIOpen = useSetAtom(aiDiagramOpenAtom);
  return (
    <MainMenu>
      <MainMenu.DefaultItems.LoadScene />
      <MainMenu.DefaultItems.SaveToActiveFile />
      <MainMenu.DefaultItems.Export />
      <MainMenu.DefaultItems.SaveAsImage />
      <MainMenu.Item icon={MagicIcon} onSelect={() => setAIOpen(true)}>
        AI 다이어그램
      </MainMenu.Item>
      {props.isCollabEnabled && (
        <MainMenu.DefaultItems.LiveCollaborationTrigger
          isCollaborating={props.isCollaborating}
          onSelect={() => props.onCollabDialogOpen()}
        />
      )}
      <MainMenu.DefaultItems.CommandPalette className="highlighted" />
      <MainMenu.DefaultItems.SearchMenu />
      <MainMenu.DefaultItems.Help />
      <MainMenu.DefaultItems.ClearCanvas />
      <CloudAuthMenuItems />
      <MainMenu.Separator />
      <MainMenu.DefaultItems.Preferences />
      <MainMenu.DefaultItems.ToggleTheme allowSystemTheme theme={props.theme} />
      <MainMenu.ItemCustom>
        <LanguageList style={{ width: "100%" }} />
      </MainMenu.ItemCustom>
      <MainMenu.DefaultItems.ChangeCanvasBackground />
    </MainMenu>
  );
});
