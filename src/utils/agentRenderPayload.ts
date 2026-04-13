export const SUPPORTED_NODE_TYPES = [
  'title',
  'subtitle',
  'heading',
  'text',
  'caption',
  'quote',
  'code',
  'list',
  'ordered_list',
  'checklist',
  'kv',
  'table',
  'metric',
  'progress',
  'badge',
  'chips',
  'divider',
  'spacer',
  'image',
  'button',
  'buttons',
  'callout',
  'section',
  'group',
  'json',
  'component',
] as const;

export const SUPPORTED_ACTION_TYPES = [
  'reveal',
  'toggle_reveal',
  'open_url',
  'copy_text',
  'show_node',
  'hide_node',
  'toggle_node',
  'set_value',
  'alert',
] as const;

export const AGENT_RENDER_PROMPT_TEMPLATE = `Tu dois repondre UNIQUEMENT en JSON valide (sans markdown, sans texte hors JSON).

Format attendu:
{
  "mode": "structured",
  "schema_id": "ui.v1",
  "fallback_text": "Resume texte lisible",
  "data": {
    "nodes": [
      { "type": "title", "text": "..." },
      { "type": "text", "text": "..." }
    ]
  }
}

Node types autorises:
${SUPPORTED_NODE_TYPES.join(', ')}

Actions autorisees:
${SUPPORTED_ACTION_TYPES.join(', ')}

Super-blocs autorises (type="component"):
- chart.v1
- kanban.v1
- timeline.v1
- form.v1
- shopping.cards.v1
- game.shell.v1
- game.snake.v1
- game.memory.v1

Regles:
- N'invente jamais un type/action/component hors liste.
- Utilise "id" sur les nodes cibles par show/hide/toggle.
- "fallback_text" est obligatoire et doit resumer le contenu.
- Pour un super-bloc reutilisable:
  { "type":"component", "component":"chart.v1", "props": { ... } }
- Pour un bouton:
  { "type":"button", "text":"...", "action": { "type":"reveal", "text":"..." } }
- Pour un lien:
  { "type":"button", "text":"Ouvrir", "action": { "type":"open_url", "url":"https://..." } }

Exemple composant:
{ "type":"component", "component":"chart.v1", "props": { "title":"Ventes", "series":[{"label":"Jan","value":12}] } }`;

export type AgentTextRenderPayload = {
  mode: 'text';
  text: string;
  metadata?: Record<string, unknown>;
};

export type AgentStructuredRenderPayload = {
  mode: 'structured';
  schema_id: string;
  schema_version?: string;
  data: unknown;
  fallback_text: string;
};

export type AgentRenderPayload = AgentTextRenderPayload | AgentStructuredRenderPayload;

const MAX_PAYLOAD_BYTES = 32 * 1024;
const MAX_TEXT_LENGTH = 8000;
const MAX_SCHEMA_ID_LENGTH = 120;
const MAX_SCHEMA_VERSION_LENGTH = 32;
const OAUTH_CONNECT_DEEP_LINK = 'echo:///oauth-connections';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeKey = (key: string): string =>
  key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const normalizeForMatch = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const toTrimmedString = (value: unknown, maxLength: number = MAX_TEXT_LENGTH): string => {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'string' ? value : String(value);
  const trimmed = text.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
};

const stripCodeFences = (value: string): string => {
  const candidate = value.trim();
  if (!candidate.startsWith('```')) return candidate;

  const lines = candidate.split('\n');
  if (lines[0]?.startsWith('```')) lines.shift();
  if (lines[lines.length - 1]?.startsWith('```')) lines.pop();
  return lines.join('\n').trim();
};

const toPayloadSize = (value: unknown): number | null => {
  try {
    const serialized = JSON.stringify(value);
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(serialized).length;
    }
    return serialized.length;
  } catch {
    return null;
  }
};

const parseStringifiedJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']')))) {
    return value;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const asRecordFromUnknown = (value: unknown): Record<string, unknown> | null => {
  const parsed = parseStringifiedJson(value);
  return isRecord(parsed) ? parsed : null;
};

const parseCandidatePayload = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;

  const parseJsonCandidate = (input: string): unknown | null => {
    let candidate = stripCodeFences(input).trim();
    if (!candidate) return null;

    if (candidate.startsWith('"') && candidate.endsWith('"')) {
      try {
        const unwrapped = JSON.parse(candidate);
        if (typeof unwrapped === 'string') {
          candidate = stripCodeFences(unwrapped).trim();
        }
      } catch {
        // keep candidate unchanged
      }
    }

    const isObjectJson = candidate.startsWith('{') && candidate.endsWith('}');
    const isArrayJson = candidate.startsWith('[') && candidate.endsWith(']');
    if (!isObjectJson && !isArrayJson) return null;

    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  };

  const direct = parseJsonCandidate(value);
  if (direct !== null) return direct;

  const text = value.trim();
  if (!text) return value;

  const fenceRegex = /```(?:json|javascript|js)?\s*([\s\S]*?)```/gi;
  let fenceMatch = fenceRegex.exec(text);
  while (fenceMatch) {
    const parsedFence = parseJsonCandidate(fenceMatch[1] || '');
    if (parsedFence !== null) return parsedFence;
    fenceMatch = fenceRegex.exec(text);
  }

  const firstObjectStart = text.indexOf('{');
  const lastObjectEnd = text.lastIndexOf('}');
  if (firstObjectStart >= 0 && lastObjectEnd > firstObjectStart) {
    const parsedObject = parseJsonCandidate(text.slice(firstObjectStart, lastObjectEnd + 1));
    if (parsedObject !== null) return parsedObject;
  }
  const firstArrayStart = text.indexOf('[');
  const lastArrayEnd = text.lastIndexOf(']');
  if (firstArrayStart >= 0 && lastArrayEnd > firstArrayStart) {
    const parsedArray = parseJsonCandidate(text.slice(firstArrayStart, lastArrayEnd + 1));
    if (parsedArray !== null) return parsedArray;
  }

  return value;
};

const looksLikeImageObject = (key: string, value: Record<string, unknown>): boolean => {
  const normalizedKey = normalizeKey(key);
  return (
    normalizedKey.includes('image') ||
    normalizedKey.includes('photo') ||
    typeof value.url === 'string' ||
    typeof value.src === 'string'
  );
};

const arrayOfRecordsToTable = (key: string, rows: Record<string, unknown>[]): Record<string, unknown> => {
  const headerSet = new Set<string>();
  rows.forEach((row) => Object.keys(row).forEach((col) => headerSet.add(col)));
  const headers = Array.from(headerSet);

  return {
    type: 'section',
    title: key,
    nodes: [
      {
        type: 'table',
        headers,
        rows: rows.map((row) => headers.map((header) => toTrimmedString(row[header]))),
      },
    ],
  };
};

const buildLegacyStructuredPayload = (
  candidate: Record<string, unknown>,
  fallbackText: string
): AgentStructuredRenderPayload => {
  const nodes: Record<string, unknown>[] = [];
  const consumedKeys = new Set<string>();
  const hasButtonCandidate = Object.entries(candidate).some(([key, value]) => {
    const normalized = normalizeKey(key);
    return (normalized.includes('button') || normalized.includes('cta')) && !!asRecordFromUnknown(value);
  });

  const revealTextByKey: Record<string, string> = {
    texteSurprise: toTrimmedString(candidate.texteSurprise),
    surpriseText: toTrimmedString((candidate as Record<string, unknown>).surpriseText),
    revealText: toTrimmedString((candidate as Record<string, unknown>).revealText),
    resultText: toTrimmedString((candidate as Record<string, unknown>).resultText),
  };
  const sharedRevealText =
    revealTextByKey.texteSurprise ||
    revealTextByKey.surpriseText ||
    revealTextByKey.revealText ||
    revealTextByKey.resultText ||
    '';

  if (hasButtonCandidate) {
    if (revealTextByKey.texteSurprise) consumedKeys.add('textesurprise');
    if (revealTextByKey.surpriseText) consumedKeys.add('surprisetext');
    if (revealTextByKey.revealText) consumedKeys.add('revealtext');
    if (revealTextByKey.resultText) consumedKeys.add('resulttext');
  }

  Object.entries(candidate).forEach(([key, rawValue]) => {
    const normalizedKey = normalizeKey(key);
    if (consumedKeys.has(normalizedKey)) return;
    const parsedRecordValue = asRecordFromUnknown(rawValue);

    if (parsedRecordValue && (normalizedKey.includes('button') || normalizedKey.includes('cta'))) {
      const actionRecord = asRecordFromUnknown(parsedRecordValue.action);
      const buttonText = toTrimmedString(parsedRecordValue.text || parsedRecordValue.label || parsedRecordValue.title || 'Action');
      const action = {
        type: toTrimmedString(
          actionRecord?.type ||
          parsedRecordValue.action ||
          parsedRecordValue.type ||
          'reveal'
        ),
        url: toTrimmedString(actionRecord?.url || parsedRecordValue.url),
        text: toTrimmedString(
          actionRecord?.text ||
          actionRecord?.reveal_text ||
          actionRecord?.revealText ||
          parsedRecordValue.reveal_text ||
          parsedRecordValue.revealText ||
          parsedRecordValue.textReveal ||
          parsedRecordValue.resultText
        ) || sharedRevealText,
        target: toTrimmedString(actionRecord?.target || parsedRecordValue.target),
      };

      nodes.push({
        type: 'button',
        text: buttonText,
        action,
      });
      return;
    }

    if (Array.isArray(rawValue)) {
      const rows = rawValue.map((item) => asRecordFromUnknown(item)).filter(Boolean) as Record<string, unknown>[];
      if (rows.length === rawValue.length && rows.length > 0) {
        nodes.push(arrayOfRecordsToTable(key, rows));
        return;
      }

      nodes.push({
        type: 'section',
        title: key,
        nodes: [
          {
            type: 'list',
            items: rawValue.map((item) => toTrimmedString(item)).filter(Boolean),
          },
        ],
      });
      return;
    }

    if (parsedRecordValue) {
      if (looksLikeImageObject(key, parsedRecordValue)) {
        nodes.push({
          type: 'image',
          url: toTrimmedString(parsedRecordValue.url || parsedRecordValue.src),
          alt: toTrimmedString(parsedRecordValue.alt || key),
          caption: toTrimmedString(parsedRecordValue.caption),
        });
        return;
      }

      nodes.push({
        type: 'code',
        language: 'json',
        text: JSON.stringify(parsedRecordValue, null, 2),
      });
      return;
    }

    if (normalizedKey.includes('progress') && Number.isFinite(Number(rawValue))) {
      nodes.push({
        type: 'progress',
        label: key,
        value: Number(rawValue),
      });
      return;
    }

    nodes.push({
      type: 'kv',
      items: [{
        label: key,
        value: toTrimmedString(rawValue),
      }],
    });
  });

  return {
    mode: 'structured',
    schema_id: 'legacy.object.v2',
    data: { nodes },
    fallback_text: fallbackText,
  };
};

const isMissingGmailOAuthMessage = (text: string): boolean => {
  const normalized = normalizeForMatch(text);
  if (!normalized) return false;

  const containsGmail = normalized.includes('gmail');
  const oauthSignals = [
    "n'a pas connecte son compte",
    'na pas connecte son compte',
    'pas acces a votre compte',
    "autoriser l'acces a votre compte",
    'autoriser l acces a votre compte',
    'aucun token gmail disponible',
    'connecte oauth',
    'oauth',
  ];

  return containsGmail && oauthSignals.some((signal) => normalized.includes(signal));
};

const buildGmailOAuthConnectPayload = (fallbackText: string): AgentStructuredRenderPayload => ({
  mode: 'structured',
  schema_id: 'ui.oauth.gmail.v1',
  fallback_text: fallbackText || "Votre compte Google n'est pas connecte pour Gmail.",
  data: {
    nodes: [
      {
        type: 'callout',
        tone: 'warning',
        title: 'Connexion Google requise',
        text: "Votre compte Google n'est pas encore connecte pour utiliser les tools Gmail.",
      },
      {
        type: 'button',
        text: 'Connecter Google',
        action: {
          type: 'open_url',
          url: OAUTH_CONNECT_DEEP_LINK,
        },
      },
    ],
  },
});

const normalizeShopifyPriceLabel = (offer: Record<string, unknown>): string => {
  const priceRecord = asRecordFromUnknown(offer.price);
  const amountRaw = priceRecord?.amount ?? offer.price;
  const amount = typeof amountRaw === 'number' ? amountRaw : Number(amountRaw);
  const currency = toTrimmedString(priceRecord?.currency || offer.currency || offer.currency_code || 'EUR', 8).toUpperCase() || 'EUR';

  if (!Number.isFinite(amount)) return 'Prix non disponible';
  const compareRaw =
    offer.compare_at_price ||
    offer.compareAtPrice ||
    priceRecord?.compare_at_price ||
    priceRecord?.compareAtPrice;
  const compare = typeof compareRaw === 'number' ? compareRaw : Number(compareRaw);
  if (Number.isFinite(compare) && compare > amount) {
    return `${amount.toFixed(2)} ${currency} (au lieu de ${compare.toFixed(2)} ${currency})`;
  }
  return `${amount.toFixed(2)} ${currency}`;
};

const extractShopifyBuyUrl = (offer: Record<string, unknown>): string => {
  const attrs = asRecordFromUnknown(offer.attributes);
  const shopDomain = toTrimmedString(
    attrs?.shop_domain ||
    attrs?.shopDomain ||
    offer.shop_domain ||
    offer.shopDomain
  );
  const handle = toTrimmedString(attrs?.handle || offer.handle);
  if (shopDomain && handle) {
    return `https://${shopDomain}/products/${handle}`;
  }

  return toTrimmedString(
    offer.affiliate_url ||
    offer.affiliateUrl ||
    offer.product_url ||
    offer.productUrl ||
    offer.url ||
    offer.href
  );
};

const isPlausibleAbsoluteImageUrl = (value: string): boolean => {
  if (!value) return false;
  if (value.startsWith('//')) return true;
  return /^https?:\/\//i.test(value);
};

const pickShopifyImageUrl = (offer: Record<string, unknown>): string => {
  const imageCandidates: string[] = [];

  const pushCandidate = (value: unknown) => {
    const text = toTrimmedString(value);
    if (text) imageCandidates.push(text);
  };

  pushCandidate(offer.image);
  pushCandidate(offer.image_url);
  pushCandidate(offer.imageUrl);
  pushCandidate(offer.photo);

  const imagesRaw = Array.isArray(offer.images) ? offer.images : [];
  for (const image of imagesRaw) {
    if (typeof image === 'string') {
      pushCandidate(image);
      continue;
    }

    const imageRecord = asRecordFromUnknown(image);
    if (!imageRecord) continue;
    pushCandidate(imageRecord.url);
    pushCandidate(imageRecord.src);
    pushCandidate(imageRecord.image_url);
    pushCandidate(imageRecord.imageUrl);
  }

  return imageCandidates.find((candidate) => isPlausibleAbsoluteImageUrl(candidate)) || '';
};

const looksLikeShopifyShoppingPayload = (candidate: Record<string, unknown>): boolean => {
  const source = normalizeKey(toTrimmedString(candidate.source));
  if (source === 'shopify') return true;

  const sourcesRaw = candidate.sources;
  if (Array.isArray(sourcesRaw)) {
    const normalized = sourcesRaw.map((item) => normalizeKey(toTrimmedString(item)));
    if (normalized.includes('shopify')) return true;
  }

  const offers = candidate.offers;
  if (!Array.isArray(offers) || offers.length === 0) return false;
  return offers.some((entry) => {
    const record = asRecordFromUnknown(entry);
    if (!record) return false;
    const offerSource = normalizeKey(toTrimmedString(record.source));
    const offerId = toTrimmedString(record.offer_id || record.offerId || record.id);
    const hasUrl =
      typeof record.product_url === 'string' ||
      typeof record.productUrl === 'string' ||
      typeof record.url === 'string' ||
      typeof record.href === 'string';
    const hasPrice =
      typeof record.price === 'number' ||
      typeof record.price === 'string' ||
      isRecord(record.price);
    const hasTitle = !!toTrimmedString(record.title || record.name);
    const hasMerchant = !!toTrimmedString(record.shop || record.merchant || record.vendor || record.brand);
    return (
      offerSource === 'shopify' ||
      offerId.startsWith('shopify:') ||
      (hasTitle && hasPrice && (hasUrl || hasMerchant))
    );
  });
};

const buildShopifyShoppingPayload = (
  candidate: Record<string, unknown>,
  fallbackText: string
): AgentStructuredRenderPayload => {
  const query =
    toTrimmedString(candidate.query) ||
    toTrimmedString(candidate.search_text) ||
    toTrimmedString(candidate.searchText) ||
    'Recherche Shopify';
  const rankingMode =
    toTrimmedString((asRecordFromUnknown(candidate.meta)?.ranking_mode) || candidate.ranking_mode || candidate.rankingMode) ||
    'best_value';
  const maxCardsRaw = Number(candidate.max_cards || candidate.maxCards || 24);
  const maxCards = Number.isFinite(maxCardsRaw) ? Math.max(1, Math.min(24, Math.trunc(maxCardsRaw))) : 24;

  const offersRaw = Array.isArray(candidate.offers) ? candidate.offers : [];
  const normalizedOffers = offersRaw
    .map((entry) => asRecordFromUnknown(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .slice(0, maxCards);

  const cards = normalizedOffers.map((offer, index) => {
    const scoreRaw = offer.score;
    const score = typeof scoreRaw === 'number' ? scoreRaw : Number(scoreRaw);

    const attrs = asRecordFromUnknown(offer.attributes);
    const condition = toTrimmedString(offer.condition);
    const availability = toTrimmedString(offer.availability);
    const shopDomain = toTrimmedString(attrs?.shop_domain || attrs?.shopDomain || offer.shop_domain || offer.shopDomain);
    const discounted =
      offer.discounted === true ||
      normalizeKey(toTrimmedString(offer.discounted)) === 'true';
    const badges = [condition, availability, discounted ? 'Promo' : '', shopDomain].filter(Boolean).slice(0, 3);
    const merchant = toTrimmedString(offer.merchant || offer.brand || offer.shop || offer.vendor) || 'Shopify';

    return {
      id: toTrimmedString(offer.id || offer.offer_id || offer.offerId || offer.product_id || offer.productId || `${merchant}:${index + 1}`),
      title: toTrimmedString(offer.title) || 'Produit',
      merchant,
      price_label: normalizeShopifyPriceLabel(offer),
      score_label: Number.isFinite(score) ? `Score ${score.toFixed(2)}` : '',
      image_url: pickShopifyImageUrl(offer),
      buy_url: extractShopifyBuyUrl(offer),
      badges,
    };
  });

  const nodes: Record<string, unknown>[] = [
    { type: 'title', text: `Shopping: ${query}` },
    { type: 'caption', text: `${cards.length} resultat(s) - mode ${rankingMode}` },
    {
      type: 'component',
      component: 'shopping.cards.v1',
      props: {
        query,
        ranking_mode: rankingMode,
        cards,
        buy_button_text: "Voir l'offre",
        empty_text: `Aucun produit trouve pour '${query}'.`,
      },
    },
  ];

  const summaryText = cards
    .slice(0, 3)
    .map((card, index) => `${index + 1}. ${toTrimmedString(card.title)} - ${toTrimmedString(card.price_label)}`)
    .join('\n');

  return {
    mode: 'structured',
    schema_id: 'ui.v1',
    fallback_text: summaryText || fallbackText || `Resultats Shopify pour ${query}`,
    data: { nodes },
  };
};

const tryExtractEmbeddedStructuredPayload = (
  candidate: Record<string, unknown>,
  fallbackText: string
): AgentStructuredRenderPayload | undefined => {
  const embedded =
    asRecordFromUnknown(candidate.render_payload) ||
    asRecordFromUnknown(candidate.renderPayload) ||
    asRecordFromUnknown(candidate.ui_payload) ||
    asRecordFromUnknown(candidate.uiPayload) ||
    asRecordFromUnknown(candidate.structured_payload) ||
    asRecordFromUnknown(candidate.structuredPayload);

  if (!embedded) return undefined;
  if (embedded.mode !== 'structured') return undefined;
  if (typeof embedded.schema_id !== 'string' || !embedded.schema_id.trim()) return undefined;

  const payload: AgentStructuredRenderPayload = {
    mode: 'structured',
    schema_id: embedded.schema_id.trim().slice(0, MAX_SCHEMA_ID_LENGTH),
    data: parseStringifiedJson(embedded.data),
    fallback_text: toTrimmedString(embedded.fallback_text || fallbackText),
  };

  if (typeof embedded.schema_version === 'string' && embedded.schema_version.trim()) {
    payload.schema_version = embedded.schema_version.trim().slice(0, MAX_SCHEMA_VERSION_LENGTH);
  }

  const payloadSize = toPayloadSize(payload);
  if (payloadSize === null || payloadSize > MAX_PAYLOAD_BYTES) return undefined;
  return payload;
};

const tryExtractEmbeddedShoppingPayload = (candidate: Record<string, unknown>): Record<string, unknown> | undefined => {
  const embedded =
    asRecordFromUnknown(candidate.render_payload_json) ||
    asRecordFromUnknown(candidate.renderPayloadJson) ||
    asRecordFromUnknown(candidate.payload_json) ||
    asRecordFromUnknown(candidate.payloadJson) ||
    asRecordFromUnknown(candidate.shopify_payload) ||
    asRecordFromUnknown(candidate.shopifyPayload);

  return embedded || undefined;
};

export const normalizeAgentRenderPayload = (
  rawPayload: unknown,
  fallbackContent: unknown = ''
): AgentRenderPayload | undefined => {
  const fallbackText =
    typeof fallbackContent === 'string'
      ? toTrimmedString(stripCodeFences(fallbackContent))
      : toTrimmedString(fallbackContent);
  const candidate = parseCandidatePayload(rawPayload);
  const rawText = typeof rawPayload === 'string' ? toTrimmedString(stripCodeFences(rawPayload)) : '';
  const sourceText = rawText || fallbackText;

  if (!isRecord(candidate)) {
    if (isMissingGmailOAuthMessage(sourceText)) {
      const oauthPayload = buildGmailOAuthConnectPayload(sourceText);
      const payloadSize = toPayloadSize(oauthPayload);
      if (payloadSize !== null && payloadSize <= MAX_PAYLOAD_BYTES) {
        return oauthPayload;
      }
    }
    return undefined;
  }

  const embeddedStructuredPayload = tryExtractEmbeddedStructuredPayload(candidate, fallbackText);
  if (embeddedStructuredPayload) {
    return embeddedStructuredPayload;
  }

  const embeddedShoppingPayload = tryExtractEmbeddedShoppingPayload(candidate);
  if (embeddedShoppingPayload && looksLikeShopifyShoppingPayload(embeddedShoppingPayload)) {
    const shoppingPayload = buildShopifyShoppingPayload(embeddedShoppingPayload, fallbackText);
    const payloadSize = toPayloadSize(shoppingPayload);
    if (payloadSize !== null && payloadSize <= MAX_PAYLOAD_BYTES) {
      return shoppingPayload;
    }
  }

  if (looksLikeShopifyShoppingPayload(candidate)) {
    const shoppingPayload = buildShopifyShoppingPayload(candidate, fallbackText);
    const payloadSize = toPayloadSize(shoppingPayload);
    if (payloadSize !== null && payloadSize <= MAX_PAYLOAD_BYTES) {
      return shoppingPayload;
    }
  }

  if (candidate.mode === 'text') {
    const text = toTrimmedString(candidate.text);
    if (!text) return undefined;

    if (isMissingGmailOAuthMessage(text)) {
      const oauthPayload = buildGmailOAuthConnectPayload(text);
      const payloadSize = toPayloadSize(oauthPayload);
      if (payloadSize !== null && payloadSize <= MAX_PAYLOAD_BYTES) {
        return oauthPayload;
      }
    }

    const payload: AgentTextRenderPayload = { mode: 'text', text };
    if (isRecord(candidate.metadata)) {
      payload.metadata = candidate.metadata;
    }

    const payloadSize = toPayloadSize(payload);
    if (payloadSize === null || payloadSize > MAX_PAYLOAD_BYTES) return undefined;
    return payload;
  }

  if (candidate.mode === 'structured') {
    const schemaIdRaw = candidate.schema_id;
    if (typeof schemaIdRaw !== 'string' || !schemaIdRaw.trim()) return undefined;

    const payload: AgentStructuredRenderPayload = {
      mode: 'structured',
      schema_id: schemaIdRaw.trim().slice(0, MAX_SCHEMA_ID_LENGTH),
      data: parseStringifiedJson(candidate.data),
      fallback_text: toTrimmedString(candidate.fallback_text || fallbackText),
    };

    if (typeof candidate.schema_version === 'string' && candidate.schema_version.trim()) {
      payload.schema_version = candidate.schema_version.trim().slice(0, MAX_SCHEMA_VERSION_LENGTH);
    }

    const payloadSize = toPayloadSize(payload);
    if (payloadSize === null || payloadSize > MAX_PAYLOAD_BYTES) return undefined;
    return payload;
  }

  const legacyPayload = buildLegacyStructuredPayload(candidate, fallbackText);
  const payloadSize = toPayloadSize(legacyPayload);
  if (payloadSize === null || payloadSize > MAX_PAYLOAD_BYTES) return undefined;
  return legacyPayload;
};

export const normalizeRawAgentContentText = (raw: string): string => {
  return toTrimmedString(stripCodeFences(raw));
};
