import type { Message } from '../hooks/useMessages';

const systemPatterns = [
    /a rejoint le groupe/i,
    /a quitté le groupe/i,
    /a été ajouté.*au groupe/i,
    /a été ajoutée.*au groupe/i,
    /a été retiré.*du groupe/i,
    /a été retirée.*du groupe/i,
    /a changé le nom du groupe/i,
    /a changé la photo du groupe/i,
    /a été promu.*modérateur/i,
    /a été promue.*modératrice/i,
    /a été rétrogradé/i,
    /a été rétrogradée/i,
    /a été exclu.*du groupe/i,
    /a été exclue.*du groupe/i,
    /a été banni.*du groupe/i,
    /a été bannie.*du groupe/i,
];

export function isSystemMessage(message: Pick<Message, 'message_type' | 'content'>): boolean {
    if (message.message_type === 'system') return true;
    return systemPatterns.some((pattern) => pattern.test(message.content || ''));
}
