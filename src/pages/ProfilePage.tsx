import { useAuth } from '../contexts/AuthContext';
import { IoMailOutline, IoCalendarOutline, IoGlobeOutline, IoCreateOutline } from 'react-icons/io5';
import './ProfilePage.css';

export default function ProfilePage() {
    const { user, logout } = useAuth();

    if (!user) return null;

    const displayName = user.username || user.first_name || 'Utilisateur';
    const photoUrl = user.photo_profil_url || user.photo_profil || null;
    const joinDate = user.date_inscription
        ? new Date(user.date_inscription).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })
        : null;

    return (
        <div className="profile-page">
            {/* Profile header */}
            <div className="profile-page__header">
                <div className="profile-page__avatar">
                    {photoUrl ? (
                        <img src={photoUrl} alt={displayName} className="profile-page__avatar-img" />
                    ) : (
                        <span className="profile-page__avatar-letter">{displayName.charAt(0).toUpperCase()}</span>
                    )}
                </div>
                <div className="profile-page__info">
                    <h1 className="profile-page__name">{displayName}</h1>
                    {user.surnom && <p className="profile-page__surnom">"{user.surnom}"</p>}
                    {user.bio && <p className="profile-page__bio">{user.bio}</p>}
                </div>
            </div>

            {/* Details */}
            <div className="profile-page__details">
                {user.email && (
                    <div className="profile-page__detail-row">
                        <IoMailOutline size={18} />
                        <span>{user.email}</span>
                    </div>
                )}
                {joinDate && (
                    <div className="profile-page__detail-row">
                        <IoCalendarOutline size={18} />
                        <span>Membre depuis {joinDate}</span>
                    </div>
                )}
                {user.nationalite && (
                    <div className="profile-page__detail-row">
                        <IoGlobeOutline size={18} />
                        <span>{user.nationalite}</span>
                    </div>
                )}
                {user.date_naissance && (
                    <div className="profile-page__detail-row">
                        <IoCalendarOutline size={18} />
                        <span>Né(e) le {new Date(user.date_naissance).toLocaleDateString('fr-FR')}</span>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="profile-page__actions">
                <button className="profile-page__action-btn profile-page__action-btn--edit" disabled>
                    <IoCreateOutline size={18} />
                    Modifier le profil (bientôt)
                </button>
                <button className="profile-page__action-btn profile-page__action-btn--logout" onClick={logout}>
                    Se déconnecter
                </button>
            </div>
        </div>
    );
}
