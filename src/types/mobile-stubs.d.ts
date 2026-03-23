// Type declarations for mobile-only modules that mobile_src imports
// These stubs allow TypeScript to compile without the actual native packages

declare module 'expo-secure-store' {
    export function getItemAsync(key: string): Promise<string | null>;
    export function setItemAsync(key: string, value: string): Promise<void>;
    export function deleteItemAsync(key: string): Promise<void>;
}

declare module 'expo-router' {
    export const router: {
        replace: (path: string) => void;
        push: (path: string) => void;
        back: () => void;
        navigate: (path: string) => void;
    };
    export function useRouter(): typeof router;
    export function useLocalSearchParams<T = Record<string, string>>(): T;
    export function useGlobalSearchParams<T = Record<string, string>>(): T;
    export function useSegments(): string[];
}

declare module 'expo-constants' {
    const Constants: {
        expoConfig?: {
            extra?: {
                eas?: {
                    projectId?: string;
                };
            };
        };
    };
    export default Constants;
}

declare module 'expo-device' {
    export const isDevice: boolean;
    export const deviceName: string | null;
}

declare module 'expo-notifications' {
    export interface Notification {
        request: {
            identifier: string;
            content: {
                title?: string;
                body?: string;
                data?: Record<string, unknown>;
                sound?: string;
            };
        };
    }
    export interface NotificationResponse {
        notification: Notification;
        actionIdentifier: string;
    }
    export enum AndroidImportance {
        MAX = 5,
    }
    export function setNotificationHandler(handler: {
        handleNotification: (notification: Notification) => Promise<{
            shouldShowAlert: boolean;
            shouldPlaySound: boolean;
            shouldSetBadge: boolean;
            shouldShowBanner?: boolean;
            shouldShowList?: boolean;
        }>;
    }): void;
    export function getPermissionsAsync(): Promise<{ status: string }>;
    export function requestPermissionsAsync(): Promise<{ status: string }>;
    export function getExpoPushTokenAsync(config: { projectId: string }): Promise<{ data: string }>;
    export function setBadgeCountAsync(count: number): Promise<void>;
    export function dismissAllNotificationsAsync(): Promise<void>;
    export function dismissNotificationAsync(id: string): Promise<void>;
    export function scheduleNotificationAsync(config: {
        content: Record<string, unknown>;
        trigger: null;
    }): Promise<string>;
    export function setNotificationChannelAsync(
        id: string,
        config: Record<string, unknown>
    ): Promise<void>;
    export function addNotificationReceivedListener(
        callback: (notification: Notification) => void
    ): { remove: () => void };
    export function addNotificationResponseReceivedListener(
        callback: (response: NotificationResponse) => void
    ): { remove: () => void };
}

declare module 'expo-av' {
    export const Audio: {
        Recording: unknown;
        Sound: unknown;
        setAudioModeAsync: (config: Record<string, unknown>) => Promise<void>;
    };
}

declare module 'expo-image-picker' {
    export function launchImageLibraryAsync(config: Record<string, unknown>): Promise<{
        canceled: boolean;
        assets?: Array<{ uri: string; type?: string; fileName?: string }>;
    }>;
    export const MediaTypeOptions: { Images: string; Videos: string; All: string };
}

declare module 'expo-document-picker' {
    export function getDocumentAsync(config: Record<string, unknown>): Promise<{
        canceled: boolean;
        assets?: Array<{ uri: string; name: string; mimeType: string; size: number }>;
    }>;
}

declare module 'expo-file-system' {
    export function getInfoAsync(uri: string): Promise<{ exists: boolean; size?: number }>;
    export function readAsStringAsync(uri: string, options?: Record<string, unknown>): Promise<string>;
    export const EncodingType: { Base64: string; UTF8: string };
    export const documentDirectory: string;
}

declare module 'expo-haptics' {
    export function impactAsync(style: string): Promise<void>;
    export function notificationAsync(type: string): Promise<void>;
    export const ImpactFeedbackStyle: { Light: string; Medium: string; Heavy: string };
    export const NotificationFeedbackType: { Success: string; Warning: string; Error: string };
}

declare module 'expo-clipboard' {
    export function setStringAsync(text: string): Promise<boolean>;
}

declare module 'expo-sqlite' {
    export interface SQLiteDatabase {
        execAsync(sql: string): Promise<void>;
        getAllAsync(sql: string, params?: unknown[]): Promise<unknown[]>;
        getFirstAsync(sql: string, params?: unknown[]): Promise<unknown | null>;
        runAsync(sql: string, params?: unknown[]): Promise<{ changes: number; lastInsertRowId: number }>;
    }
    export function openDatabaseSync(name: string): SQLiteDatabase;
}

declare module '@react-native-async-storage/async-storage' {
    const AsyncStorage: {
        getItem(key: string): Promise<string | null>;
        setItem(key: string, value: string): Promise<void>;
        removeItem(key: string): Promise<void>;
        getAllKeys(): Promise<readonly string[]>;
        multiGet(keys: string[]): Promise<readonly [string, string | null][]>;
        multiRemove(keys: string[]): Promise<void>;
    };
    export default AsyncStorage;
}

// React Native global
declare const __DEV__: boolean;
