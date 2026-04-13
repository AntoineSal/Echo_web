const failedAssetUrls = new Set<string>();

const normalizeAssetUrl = (url: string): string => url.trim();

export const isFailedAssetUrl = (url: string): boolean => {
    if (!url) return false;
    return failedAssetUrls.has(normalizeAssetUrl(url));
};

export const markFailedAssetUrl = (url: string): void => {
    if (!url) return;
    failedAssetUrls.add(normalizeAssetUrl(url));
};

export const clearFailedAssetUrls = (): void => {
    failedAssetUrls.clear();
};
