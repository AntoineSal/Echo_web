// Web stub for @mobile/utils/cgu
// Tracks CGU acceptance per user via localStorage
import { CURRENT_CGU_VERSION } from './cgu-constants';

const cguKey = (uuid: string) => `echo_cgu_accepted_${uuid}`;

export async function hasAcceptedCurrentCguLocally(userUuid: string): Promise<boolean> {
  return localStorage.getItem(cguKey(userUuid)) === CURRENT_CGU_VERSION;
}

export async function markCurrentCguAcceptedLocally(userUuid: string): Promise<void> {
  localStorage.setItem(cguKey(userUuid), CURRENT_CGU_VERSION);
}
