// Static tools catalog — will be replaced by API calls when backend is ready

export interface ToolItem {
    id: string;
    name: string;
    description: string;
    longDescription: string;
    icon: string;        // emoji for simplicity — can be swapped for react-icons later
    categoryId: string;
    examples: string[];  // example prompts the user could send to Jarvis
}

export interface ToolCategory {
    id: string;
    name: string;
    icon: string;
    color: string;       // accent color for category chips / card accents
}

// ── Categories ──

export const TOOL_CATEGORIES: ToolCategory[] = [
    { id: 'communication', name: 'Communication',       icon: '💬', color: '#3b82f6' },
    { id: 'organisation',  name: 'Organisation',        icon: '📅', color: '#8b5cf6' },
    { id: 'infos',         name: 'Infos & Quotidien',   icon: '🌤', color: '#f59e0b' },
    { id: 'social',        name: 'Social',              icon: '👥', color: '#10b981' },
];

// ── Tools ──

export const TOOLS: ToolItem[] = [
    // ─── Communication ───
    {
        id: 'messaging',
        name: 'Messagerie',
        description: 'Lire et envoyer des messages sur Echo.',
        longDescription:
            'Jarvis peut consulter vos conversations, lire vos messages non lus et envoyer des messages à vos contacts directement depuis la discussion. Plus besoin de quitter la conversation — demandez-lui simplement.',
        icon: '✉️',
        categoryId: 'communication',
        examples: [
            'Quels messages non lus j\'ai ?',
            'Envoie "On se voit demain ?" à Lucas',
            'Résume ma conversation avec Marie',
        ],
    },
    {
        id: 'gmail',
        name: 'Gmail',
        description: 'Accédez à vos e-mails Google depuis Jarvis.',
        longDescription:
            'Connectez votre compte Google et laissez Jarvis lire, rechercher et envoyer des e-mails pour vous. Il peut résumer vos mails importants, rédiger des réponses et gérer votre boîte de réception.',
        icon: '📧',
        categoryId: 'communication',
        examples: [
            'Lis mes derniers mails',
            'Envoie un mail à mon prof pour lui dire que je serai absent',
            'Résume les mails de cette semaine',
        ],
    },

    // ─── Organisation ───
    {
        id: 'calendar-internal',
        name: 'Calendrier Echo',
        description: 'Gérez votre calendrier intégré à Echo.',
        longDescription:
            'Jarvis gère votre calendrier Echo nativement : créer des événements, consulter votre planning, modifier ou supprimer des rendez-vous. Dites-lui ce que vous voulez planifier et il s\'en occupe.',
        icon: '🗓',
        categoryId: 'organisation',
        examples: [
            'Qu\'est-ce que j\'ai de prévu demain ?',
            'Ajoute un RDV dentiste mardi à 14h',
            'Supprime mon événement de lundi',
        ],
    },
    {
        id: 'google-calendar',
        name: 'Google Calendar',
        description: 'Synchronisez et gérez votre agenda Google.',
        longDescription:
            'Connectez votre Google Calendar et Jarvis pourra consulter vos événements, en créer de nouveaux, modifier vos rendez-vous et vous donner un aperçu de votre semaine — tout ça par une simple demande.',
        icon: '📆',
        categoryId: 'organisation',
        examples: [
            'Montre mon agenda de la semaine',
            'Crée un événement "Réunion projet" jeudi de 10h à 12h',
            'Quels sont mes prochains rendez-vous ?',
        ],
    },

    // ─── Infos & Quotidien ───
    {
        id: 'weather',
        name: 'Météo',
        description: 'Consultez les prévisions météorologiques.',
        longDescription:
            'Jarvis récupère les prévisions météo en temps réel grâce à Open-Meteo. Température actuelle, prévisions à plusieurs jours, alertes pluie — il vous tient informé pour mieux planifier votre journée.',
        icon: '☀️',
        categoryId: 'infos',
        examples: [
            'Quel temps fait-il à Paris ?',
            'Est-ce qu\'il va pleuvoir demain ?',
            'Donne-moi la météo de la semaine',
        ],
    },
    {
        id: 'ratp',
        name: 'Transports RATP',
        description: 'Horaires et itinéraires en transports en commun.',
        longDescription:
            'Jarvis consulte les données RATP en temps réel : prochains passages de métro/bus/RER, perturbations, itinéraires optimaux. Idéal pour planifier vos déplacements en Île-de-France.',
        icon: '🚇',
        categoryId: 'infos',
        examples: [
            'Prochain métro ligne 6 à Trocadéro ?',
            'Comment aller de Châtelet à La Défense ?',
            'Y a-t-il des perturbations sur le RER A ?',
        ],
    },

    // ─── Social ───
    {
        id: 'groups',
        name: 'Groupes',
        description: 'Créez et gérez vos groupes Echo.',
        longDescription:
            'Jarvis aide à gérer vos groupes : en créer, modifier le nom ou la description, ajouter ou retirer des membres, et supprimer des groupes. Tout se fait par une simple conversation.',
        icon: '👥',
        categoryId: 'social',
        examples: [
            'Crée un groupe "Vacances été" avec Lucas et Marie',
            'Ajoute Thomas au groupe Projet',
            'Quels sont mes groupes ?',
        ],
    },
    {
        id: 'user-search',
        name: 'Recherche d\'utilisateurs',
        description: 'Trouvez des personnes sur Echo.',
        longDescription:
            'Jarvis peut rechercher des utilisateurs par leur nom, prénom ou pseudonyme et vous aider à envoyer des demandes d\'ami ou des invitations de groupe. Trouvez et connectez-vous facilement.',
        icon: '🔍',
        categoryId: 'social',
        examples: [
            'Cherche l\'utilisateur "marie_dupont"',
            'Trouve mes amis qui contiennent "Lucas"',
            'Qui est en ligne ?',
        ],
    },
];

// ── Helpers ──

export function getToolsByCategory(categoryId: string): ToolItem[] {
    return TOOLS.filter(t => t.categoryId === categoryId);
}

export function getCategoryById(categoryId: string): ToolCategory | undefined {
    return TOOL_CATEGORIES.find(c => c.id === categoryId);
}

export function searchTools(query: string): ToolItem[] {
    const q = query.toLowerCase().trim();
    if (!q) return TOOLS;
    return TOOLS.filter(
        t =>
            t.name.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q) ||
            t.examples.some(e => e.toLowerCase().includes(q))
    );
}
