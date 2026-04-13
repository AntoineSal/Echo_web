import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    IoMailOutline, IoCalendarOutline, IoGlobeOutline,
    IoCreateOutline, IoLogOutOutline, IoPeopleOutline,
    IoStatsChartOutline, IoPersonOutline, IoHeartOutline,
    IoDocumentTextOutline, IoFlagOutline, IoCameraOutline,
    IoCheckmarkOutline, IoCloseOutline, IoTrashOutline,
    IoBulbOutline, IoMegaphoneOutline, IoWarningOutline
} from 'react-icons/io5';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { fetchWithAuth } from '@mobile/services/apiClient';
import { API_BASE_URL } from '@mobile/config/api';
import ExpandedFriends from '../components/profile/ExpandedFriends';
import ExpandedStats from '../components/profile/ExpandedStats';
import ExpandedCalendar from '../components/profile/ExpandedCalendar';
import './ProfilePage.css';

interface ProfileStats {
    total_connexions: number;
    total_evenements: number;
    evenements_ce_mois: number;
    total_reponses: number;
    date_inscription: string;
    derniere_activite: string;
}

type ExpandedViewType = 'friends' | 'calendar' | 'stats' | null;

export default function ProfilePage() {
    const { user, logout, updateUser } = useAuth();
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // FLIP animation states
    const [expandedView, setExpandedView] = useState<ExpandedViewType>(null);
    const [startRect, setStartRect] = useState<DOMRect | null>(null);

    const friendsCardRef = useRef<HTMLDivElement>(null);
    const calendarCardRef = useRef<HTMLDivElement>(null);
    const statsCardRef = useRef<HTMLDivElement>(null);

    const extendedUser = user as any;

    // ── Queries ──
    const { data: stats } = useQuery({
        queryKey: ['profile-stats', user?.uuid],
        queryFn: async () => {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/auth/profile/stats/`);
            if (!res.ok) return null;
            return await res.json() as ProfileStats;
        },
        enabled: !!user,
        staleTime: 5 * 60_000,
    });

    const { data: friendsCount } = useQuery({
        queryKey: ['friends-count', user?.uuid],
        queryFn: async () => {
            if (!user?.uuid) return 0;
            const res = await fetchWithAuth(`${API_BASE_URL}/relations/connections/my-connections/`);
            if (!res.ok) return 0;
            const data = await res.json();
            const connections = Array.isArray(data?.connexions) ? data.connexions : Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
            return connections.length;
        },
        enabled: !!user?.uuid,
        staleTime: 30_000,
    });

    // ── Edit Form State ──
    const [formData, setFormData] = useState({
        email: extendedUser?.email || '',
        first_name: extendedUser?.first_name || '',
        last_name: extendedUser?.last_name || '',
        surnom: extendedUser?.surnom || '',
        bio: extendedUser?.bio || '',
        nationalite: extendedUser?.nationalite || '',
        date_naissance: extendedUser?.date_naissance || '',
    });

    const startEditing = useCallback(() => {
        setFormData({
            email: extendedUser?.email || '',
            first_name: extendedUser?.first_name || '',
            last_name: extendedUser?.last_name || '',
            surnom: extendedUser?.surnom || '',
            bio: extendedUser?.bio || '',
            nationalite: extendedUser?.nationalite || '',
            date_naissance: extendedUser?.date_naissance || '',
        });
        setImagePreview(null);
        setSelectedFile(null);
        setIsEditing(true);
    }, [extendedUser]);

    const cancelEditing = useCallback(() => {
        setIsEditing(false);
        setImagePreview(null);
        setSelectedFile(null);
    }, []);

    const handleSave = useCallback(async () => {
        if (saving) return;
        setSaving(true);
        try {
            const body = new FormData();
            Object.entries(formData).forEach(([key, value]) => {
                if (value && (value as string).trim()) body.append(key, value as string);
            });
            if (selectedFile) body.append('photo_profil', selectedFile);

            const res = await fetchWithAuth(`${API_BASE_URL}/api/auth/profile/`, { method: 'PATCH', body });
            if (res.ok) {
                const updated = await res.json();
                const merged = { ...user, ...updated, photo_profil_url: updated.photo_profil_url || updated.photo_profil || extendedUser?.photo_profil_url };
                await updateUser(merged);
                setIsEditing(false);
                setImagePreview(null);
                setSelectedFile(null);
            }
        } catch (err) {
            console.error('Error updating profile:', err);
        } finally {
            setSaving(false);
        }
    }, [formData, selectedFile, user, extendedUser, updateUser, saving]);

    const handleAvatarClick = useCallback(() => {
        if (isEditing && fileInputRef.current) fileInputRef.current.click();
    }, [isEditing]);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setSelectedFile(file);
        const reader = new FileReader();
        reader.onload = () => setImagePreview(reader.result as string);
        reader.readAsDataURL(file);
    }, []);

    const handleDeleteAccount = useCallback(async () => {
        if (!window.confirm("Êtes-vous sûr de vouloir supprimer définitivement votre compte ? Cette action est irréversible.")) return;
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/auth/profile/`, { method: 'DELETE' });
            if (res.ok || res.status === 204) await logout();
        } catch {
            alert('Erreur lors de la suppression du compte');
        }
    }, [logout]);

    // ── FLIP Overlay Logic ──
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedView(null); };
        if (expandedView) window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [expandedView]);

    const openView = (view: ExpandedViewType, ref: React.RefObject<HTMLDivElement | null>) => {
        if (ref.current) setStartRect(ref.current.getBoundingClientRect());
        setExpandedView(view);
    };

    const getExpandedRect = (): React.CSSProperties => {
        if (!startRect) return { top: '10vh', left: '10vw', width: '80vw', height: '80vh' };
        return {
            '--start-x': `${startRect.left}px`,
            '--start-y': `${startRect.top}px`,
            '--start-w': `${startRect.width}px`,
            '--start-h': `${startRect.height}px`,
            top: '40px',
            left: 'calc(50vw - min(45vw, 420px))',
            width: 'min(90vw, 840px)',
            height: 'calc(100vh - 120px)',
            animation: 'prof-expanded-in 0.4s cubic-bezier(0.32, 0.72, 0, 1) forwards'
        } as React.CSSProperties;
    };

    if (!user) return null;

    const displayName = user.username || (user as any).first_name || 'Utilisateur';
    const photoUrl = imagePreview || extendedUser?.photo_profil_url || extendedUser?.photo_profil || null;

    const registrationDate = stats?.date_inscription || extendedUser?.created_at;
    const parsedDate = registrationDate ? new Date(registrationDate) : null;
    const daysOnEcho = parsedDate && !isNaN(parsedDate.getTime()) ? Math.max(1, Math.ceil((Date.now() - parsedDate.getTime()) / 86_400_000)) : null;

    const eventsThisMonth = stats?.evenements_ce_mois ?? 0;
    const totalEvents = stats?.total_evenements ?? 0;
    const calendarValue = eventsThisMonth > 0 ? String(eventsThisMonth) : totalEvents > 0 ? String(totalEvents) : '—';
    const calendarLabel = eventsThisMonth > 0 ? 'Ce mois' : totalEvents > 0 ? 'Événements' : 'Événements';

    const joinDateFormatted = parsedDate ? parsedDate.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' }) : null;
    const birthDateFormatted = extendedUser?.date_naissance ? new Date(extendedUser.date_naissance).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' }) : null;

    return (
        <div className="profile-page">
            <style>{`
                @keyframes prof-expanded-in {
                    0% {
                        top: var(--start-y);
                        left: var(--start-x);
                        width: var(--start-w);
                        height: var(--start-h);
                        border-radius: 16px;
                    }
                    100% {
                        top: 40px;
                        left: calc(50vw - min(45vw, 420px));
                        width: min(90vw, 840px);
                        height: calc(100vh - 120px);
                        border-radius: 24px;
                    }
                }
            `}</style>
            
            <div className={`prof-content-scroll ${expandedView ? 'prof-content-scroll--blurred' : ''}`}>
                <div className="prof-hero">
                    <div className={`prof-avatar ${isEditing ? 'prof-avatar--editable' : ''}`} onClick={handleAvatarClick}>
                        {photoUrl ? <img src={photoUrl} alt={displayName} className="prof-avatar__img" /> : <span className="prof-avatar__letter">{displayName.charAt(0).toUpperCase()}</span>}
                        {isEditing && <div className="prof-avatar-overlay"><IoCameraOutline size={28} /></div>}
                        <input ref={fileInputRef} type="file" accept="image/*" className="prof-avatar-input" onChange={handleFileChange} />
                    </div>
                    <h1 className="prof-name">{displayName}</h1>
                    {extendedUser?.surnom && <p className="prof-surnom">"{extendedUser.surnom}"</p>}
                    {extendedUser?.bio && <p className="prof-bio">{extendedUser.bio}</p>}

                    <div className="prof-stats">
                        <div className="prof-stat-card" ref={friendsCardRef} onClick={() => openView('friends', friendsCardRef)}>
                            <IoPeopleOutline size={18} className="prof-stat-card__icon" />
                            <span className="prof-stat-card__value">{friendsCount ?? stats?.total_connexions ?? extendedUser?.nb_connexions ?? 0}</span>
                            <span className="prof-stat-card__label">Amis</span>
                        </div>
                        <div className="prof-stat-card" ref={calendarCardRef} onClick={() => openView('calendar', calendarCardRef)}>
                            <IoCalendarOutline size={18} className="prof-stat-card__icon" />
                            <span className="prof-stat-card__value">{calendarValue}</span>
                            <span className="prof-stat-card__label">{calendarLabel}</span>
                        </div>
                        <div className="prof-stat-card" ref={statsCardRef} onClick={() => openView('stats', statsCardRef)}>
                            <IoStatsChartOutline size={18} className="prof-stat-card__icon" />
                            <span className="prof-stat-card__value">{daysOnEcho ? `${daysOnEcho}j` : '...'}</span>
                            <span className="prof-stat-card__label">Sur Echo</span>
                        </div>
                    </div>
                </div>

                <div className="prof-content">
                    {/* Colonne Gauche : Info & Actions */}
                    <div className="prof-split-left">
                        {isEditing ? (
                            <div className="prof-card">
                                <h3 className="prof-card__title">Modifier le profil</h3>
                                <div className="prof-edit-form">
                                    <InputField icon={<IoPersonOutline size={14} />} label="Nom d'utilisateur" value={displayName} disabled hint="Le nom d'utilisateur ne peut pas être modifié" />
                                    <InputField icon={<IoMailOutline size={14} />} label="Email" value={formData.email} onChange={(v: string) => setFormData(p => ({ ...p, email: v }))} type="email" />
                                    <InputField icon={<IoHeartOutline size={14} />} label="Surnom" value={formData.surnom} onChange={(v: string) => setFormData(p => ({ ...p, surnom: v }))} placeholder="Votre surnom" />
                                    <InputField icon={<IoPersonOutline size={14} />} label="Prénom" value={formData.first_name} onChange={(v: string) => setFormData(p => ({ ...p, first_name: v }))} placeholder="Votre prénom" />
                                    <InputField icon={<IoPersonOutline size={14} />} label="Nom" value={formData.last_name} onChange={(v: string) => setFormData(p => ({ ...p, last_name: v }))} placeholder="Votre nom" />
                                    <InputField icon={<IoDocumentTextOutline size={14} />} label="Bio" value={formData.bio} onChange={(v: string) => setFormData(p => ({ ...p, bio: v }))} placeholder="Parlez-nous de vous..." textarea />
                                    <InputField icon={<IoFlagOutline size={14} />} label="Nationalité" value={formData.nationalite} onChange={(v: string) => setFormData(p => ({ ...p, nationalite: v }))} placeholder="Votre nationalité" />
                                    <InputField icon={<IoCalendarOutline size={14} />} label="Date de naissance" value={formData.date_naissance} onChange={(v: string) => setFormData(p => ({ ...p, date_naissance: v }))} placeholder="AAAA-MM-JJ" hint="Format: AAAA-MM-JJ" />

                                    <div className="prof-edit-actions">
                                        <button className="prof-btn prof-btn--cancel" onClick={cancelEditing}><IoCloseOutline size={18} /> Annuler</button>
                                        <button className="prof-btn prof-btn--save" onClick={handleSave} disabled={saving}><IoCheckmarkOutline size={18} /> {saving ? 'Enregistrement...' : 'Enregistrer'}</button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="prof-card">
                                    <h3 className="prof-card__title">Informations</h3>
                                    {extendedUser?.email && <DetailRow icon={<IoMailOutline size={16} />} label="Email" value={extendedUser.email} />}
                                    {(extendedUser?.first_name || extendedUser?.last_name) && <DetailRow icon={<IoPersonOutline size={16} />} label="Nom complet" value={`${extendedUser.first_name || ''} ${extendedUser.last_name || ''}`.trim()} />}
                                    {extendedUser?.nationalite && <DetailRow icon={<IoGlobeOutline size={16} />} label="Nationalité" value={extendedUser.nationalite} />}
                                    {birthDateFormatted && <DetailRow icon={<IoCalendarOutline size={16} />} label="Date de naissance" value={birthDateFormatted} />}
                                    {joinDateFormatted && <DetailRow icon={<IoCalendarOutline size={16} />} label="Membre depuis" value={joinDateFormatted} />}
                                </div>
                                <div className="prof-actions">
                                    <button className="prof-btn prof-btn--edit" onClick={startEditing}><IoCreateOutline size={18} /> Modifier le profil</button>
                                    <button className="prof-btn prof-btn--logout" onClick={logout}><IoLogOutOutline size={18} /> Se déconnecter</button>
                                    <button className="prof-btn prof-btn--delete" onClick={handleDeleteAccount}><IoTrashOutline size={16} /> Supprimer mon compte</button>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Colonne Droite : News */}
                    <div className="prof-split-right">
                        <EchoNewsComponent />
                    </div>
                </div>
            </div>

            {/* Expansions */}
            {expandedView && (
                <>
                    <div className="prof-expanded-backdrop" onClick={() => setExpandedView(null)} />
                    <div className="prof-expanded-wrap" style={getExpandedRect()}>
                        <div className="prof-expanded">
                            <div className="prof-expanded__header">
                                <div className="prof-expanded__icon">
                                    {expandedView === 'friends' && <IoPeopleOutline />}
                                    {expandedView === 'calendar' && <IoCalendarOutline />}
                                    {expandedView === 'stats' && <IoStatsChartOutline />}
                                </div>
                                <div className="prof-expanded__titles">
                                    <h2 className="prof-expanded__name">
                                        {expandedView === 'friends' && 'Mes Amis et Invitations'}
                                        {expandedView === 'calendar' && 'Mon Calendrier'}
                                        {expandedView === 'stats' && 'Statistiques & Activité'}
                                    </h2>
                                </div>
                                <button className="prof-expanded__close" onClick={() => setExpandedView(null)}>
                                    <IoCloseOutline size={22} />
                                </button>
                            </div>
                            <div className="prof-expanded__body">
                                {expandedView === 'friends' && <ExpandedFriends />}
                                {expandedView === 'calendar' && <ExpandedCalendar />}
                                {expandedView === 'stats' && <ExpandedStats />}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

// ── Shared components ──
function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="prof-detail">
            <div className="prof-detail__icon">{icon}</div>
            <div className="prof-detail__text"><p className="prof-detail__label">{label}</p><p className="prof-detail__value">{value}</p></div>
        </div>
    );
}

function InputField({ icon, label, value, onChange, placeholder, type, textarea, disabled, hint }: any) {
    return (
        <div className="prof-input-group">
            <div className="prof-input-group__label-row"><span className="prof-input-group__label-icon">{icon}</span><label className="prof-input-group__label">{label}</label></div>
            {textarea ? <textarea className="prof-input-group__input prof-input-group__input--textarea" value={value} onChange={e => onChange?.(e.target.value)} placeholder={placeholder} disabled={disabled} /> 
                      : <input className={`prof-input-group__input ${disabled ? 'prof-input-group__input--disabled' : ''}`} type={type || 'text'} value={value} onChange={e => onChange?.(e.target.value)} placeholder={placeholder} disabled={disabled} />}
            {hint && <span className="prof-input-group__hint">{hint}</span>}
        </div>
    );
}

// ── News Component ──
function EchoNewsComponent() {
    const { data: newsItems, isLoading } = useQuery({
        queryKey: ['all-news'],
        queryFn: async () => {
            const res = await fetchWithAuth(`${API_BASE_URL}/news/`);
            if (!res.ok) return [];
            return await res.json() as any[];
        },
        staleTime: 5 * 60_000,
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="prof-card" style={{ background: 'linear-gradient(135deg, rgba(10,145,104,0.1), rgba(16,185,129,0.05))' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <IoBulbOutline size={24} color="rgba(10,145,104,1)" />
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#141a17' }}>Donnez votre avis</h3>
                </div>
                <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#4b5563', lineHeight: 1.5 }}>
                    Participez à l'amélioration de Echo en nous faisant part de vos retours, suggestions et idées.
                </p>
                <button className="prof-btn" style={{ background: 'rgba(10,145,104,1)', color: 'white', width: '100%', borderRadius: '12px', padding: '10px' }}>
                    Ouvrir le formulaire
                </button>
            </div>

            <div className="prof-card">
                <h3 className="prof-card__title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <IoMegaphoneOutline size={18} /> Annonces Echo
                </h3>
                {isLoading ? (
                    <p style={{ fontSize: '13px', color: '#9ca3af' }}>Recherche des actualités...</p>
                ) : newsItems?.length === 0 ? (
                    <p style={{ fontSize: '13px', color: '#9ca3af' }}>Aucune actualité pour le moment</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {newsItems?.map(item => (
                            <div key={item.uuid} className="prof-news-card">
                                <h4 className="prof-news-title">{item.title || item.titre}</h4>
                                <p className="prof-news-p">{item.description || item.contenu}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// Removed dummy components here
