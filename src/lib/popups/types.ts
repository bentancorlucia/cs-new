export type PopupStatus = "draft" | "published";

export type PopupButton = {
  label: string;
  url: string;
};

export type PopupRow = {
  id: string;
  title: string | null;
  body: string | null;
  image_url: string | null;
  buttons: PopupButton[];
  pages: string[];
  starts_at: string;
  ends_at: string;
  priority: number;
  status: PopupStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type PopupFormPayload = {
  title: string | null;
  body: string | null;
  image_url: string | null;
  buttons: PopupButton[];
  pages: string[];
  starts_at: string;
  ends_at: string;
  priority: number;
  status: PopupStatus;
};
