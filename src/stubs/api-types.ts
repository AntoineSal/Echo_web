// Web stub for @mobile/types/api
// Core types shared between mobile and web

export interface User {
  uuid: string;
  username: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  photo_profil?: string | null;
  photo_profil_url?: string;
  surnom?: string;
  bio?: string;
  date_inscription?: string;
  nationalite?: string;
  date_naissance?: string;
  has_accepted_cgu?: boolean;
  cgu_accepted_at?: string;
  // Extended fields
  [key: string]: unknown;
}
