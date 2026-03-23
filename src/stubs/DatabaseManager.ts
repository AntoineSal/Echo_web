// Web stub for DatabaseManager — no-op implementation
// The web app uses API-only data fetching, no local SQLite database

class DatabaseManagerStub {
    private static instance: DatabaseManagerStub | null = null;

    static getInstance(): DatabaseManagerStub {
        if (!DatabaseManagerStub.instance) {
            DatabaseManagerStub.instance = new DatabaseManagerStub();
        }
        return DatabaseManagerStub.instance;
    }

    async initialize(): Promise<void> {
        // No-op on web
    }

    async clearAllData(): Promise<void> {
        // No-op on web
    }

    async getConversation(_uuid: string, _ownerUuid: string): Promise<null> {
        return null;
    }

    async getUnreadConversationCount(_ownerUuid: string): Promise<number> {
        return 0;
    }

    async getConversations(_ownerUuid: string): Promise<[]> {
        return [];
    }
}

export const databaseManager = DatabaseManagerStub.getInstance();
