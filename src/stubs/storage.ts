// Web storage — pure localStorage implementation
// Replaces @mobile/utils/storage for web platform

export const storage = {
    async getItemAsync(key: string): Promise<string | null> {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    },

    async setItemAsync(key: string, value: string): Promise<void> {
        try {
            localStorage.setItem(key, value);
        } catch {
            console.error('Error setting localStorage:', key);
        }
    },

    async deleteItemAsync(key: string): Promise<void> {
        try {
            localStorage.removeItem(key);
        } catch {
            console.error('Error deleting localStorage:', key);
        }
    },
};
