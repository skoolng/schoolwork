import type { Attachment } from "./types";

export interface PersonalizationItem {
  id: string;
  category: string;
  title: string;
  summary: string;
  source: string;
  sourceUrl?: string;
  createdAt?: string;
  attachments: Attachment[];
}

export interface FavoriteItem {
  item: PersonalizationItem;
  addedAt: string;
}

export interface ItemNote {
  id: string;
  item: PersonalizationItem;
  text: string;
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
}

export interface MyNote {
  id: string;
  title: string;
  text: string;
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
}

export interface PersonalizationDocument {
  version: 1;
  studentKey: string;
  updatedAt: string;
  favorites: FavoriteItem[];
  itemNotes: ItemNote[];
  notes: MyNote[];
}

export function emptyPersonalization(studentKey: string): PersonalizationDocument {
  return {
    version: 1,
    studentKey,
    updatedAt: "",
    favorites: [],
    itemNotes: [],
    notes: [],
  };
}

export interface PersonalizationUpload {
  name: string;
  contentType: string;
  contentBase64: string;
}

export type PersonalizationMutation =
  | {
      action: "set_favorite";
      item: PersonalizationItem;
      favorite: boolean;
    }
  | {
      action: "save_item_note";
      item: PersonalizationItem;
      text: string;
      uploads?: PersonalizationUpload[];
    }
  | {
      action: "create_note";
      title: string;
      text: string;
      uploads?: PersonalizationUpload[];
    }
  | {
      action: "delete_note";
      noteId: string;
    };
