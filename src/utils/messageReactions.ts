const REACTION_EVENT_PREFIX = '[[echo:reaction:v1]]';

type ReactionMessagePayload = {
  target_message_uuid?: unknown;
  emoji?: unknown;
};

export type ParsedMessageReaction = {
  targetMessageUuid: string;
  emoji: string | null;
};

export type ReactionMessageLike = {
  uuid: string;
  content: string;
  created_at: string | number;
  sender_uuid?: string;
};

const normalizeEmoji = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const buildMessageReactionContent = (
  targetMessageUuid: string,
  emoji: string | null
): string => {
  const payload = {
    target_message_uuid: targetMessageUuid.trim(),
    emoji: normalizeEmoji(emoji),
  };
  return `${REACTION_EVENT_PREFIX}${JSON.stringify(payload)}`;
};

export const parseMessageReactionContent = (content: unknown): ParsedMessageReaction | null => {
  if (typeof content !== 'string') return null;
  const trimmed = content.trim();
  if (!trimmed.startsWith(REACTION_EVENT_PREFIX)) return null;
  const payloadRaw = trimmed.slice(REACTION_EVENT_PREFIX.length).trim();
  if (!payloadRaw) return null;
  let payload: ReactionMessagePayload;
  try { payload = JSON.parse(payloadRaw); } catch { return null; }
  const targetMessageUuid =
    typeof payload.target_message_uuid === 'string' ? payload.target_message_uuid.trim() : '';
  if (!targetMessageUuid) return null;
  return { targetMessageUuid, emoji: normalizeEmoji(payload.emoji) };
};

export const isReactionEventMessage = (content: unknown): boolean =>
  parseMessageReactionContent(content) !== null;

export const extractReactionMapFromMessages = (
  messages: ReactionMessageLike[]
): {
  reactionByMessageUuid: Record<string, string[]>;
  reactionEventMessageUuids: Set<string>;
} => {
  const reactionEventMessageUuids = new Set<string>();

  // Track: targetUuid → Map<senderKey, { emoji, ts }>
  // One reaction per sender per message — latest wins.
  const perSender = new Map<string, Map<string, { emoji: string; ts: number }>>();

  for (const message of messages) {
    const reaction = parseMessageReactionContent(message.content);
    if (!reaction) continue;
    reactionEventMessageUuids.add(message.uuid);
    const ts = typeof message.created_at === 'number' ? message.created_at
      : Date.parse(String(message.created_at)) || 0;
    const senderKey = message.sender_uuid || `anon-${message.uuid}`;
    const target = reaction.targetMessageUuid;

    if (!perSender.has(target)) perSender.set(target, new Map());
    const senderMap = perSender.get(target)!;
    const existing = senderMap.get(senderKey);
    if (!existing || ts > existing.ts) {
      senderMap.set(senderKey, { emoji: reaction.emoji || '', ts });
    }
  }

  // Aggregate: unique emojis per target message (across all senders' latest reactions)
  const reactionByMessageUuid: Record<string, string[]> = {};
  for (const [targetUuid, senderMap] of perSender) {
    const emojis: string[] = [];
    for (const { emoji } of senderMap.values()) {
      if (emoji && !emojis.includes(emoji)) {
        emojis.push(emoji);
      }
    }
    if (emojis.length > 0) reactionByMessageUuid[targetUuid] = emojis;
  }

  return { reactionByMessageUuid, reactionEventMessageUuids };
};

export const getConversationPreviewText = (content: string): string => {
  const parsed = parseMessageReactionContent(content);
  if (!parsed) return content;
  if (parsed.emoji) return `a reagi ${parsed.emoji}`;
  return 'a retire sa reaction';
};
