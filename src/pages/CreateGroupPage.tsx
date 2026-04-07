import React, { useState } from 'react';
import { IoChevronBack, IoPeopleOutline, IoCreateOutline, IoKeyOutline, IoAddCircle, IoEnterOutline } from 'react-icons/io5';
import { fetchWithAuth } from '@mobile/services/apiClient';
import { API_BASE_URL } from '@mobile/config/api';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '../contexts/NavigationContext';
import './AddPage.css';

type Mode = 'create' | 'join' | null;

export default function CreateGroupPage() {
    const { navigate } = useNavigation();
    const queryClient = useQueryClient();
    const [mode, setMode] = useState<Mode>(null);

    const [groupName, setGroupName] = useState('');
    const [description, setDescription] = useState('');
    const [creating, setCreating] = useState(false);
    const [createDone, setCreateDone] = useState(false);

    const [inviteCode, setInviteCode] = useState('');
    const [joining, setJoining] = useState(false);
    const [joinDone, setJoinDone] = useState(false);

    const handleCreate = async () => {
        if (!groupName.trim()) return;
        setCreating(true);
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/groups/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: groupName.trim(), description: description.trim() }),
            });
            if (res.ok) {
                await queryClient.invalidateQueries({ queryKey: ['conversations'] });
                setCreateDone(true);
                setTimeout(() => navigate('groups'), 1200);
            }
        } catch { /* silent */ }
        finally { setCreating(false); }
    };

    const handleJoin = async () => {
        if (!inviteCode.trim()) return;
        setJoining(true);
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/groups/join/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invite_code: inviteCode.trim() }),
            });
            if (res.ok) {
                await queryClient.invalidateQueries({ queryKey: ['conversations'] });
                setJoinDone(true);
                setTimeout(() => navigate('groups'), 1200);
            }
        } catch { /* silent */ }
        finally { setJoining(false); }
    };

    return (
        <div className="add-page">
            <div className="add-page__header">
                <button className="add-page__back-btn" onClick={() => navigate('groups')}>
                    <IoChevronBack size={22} />
                </button>
                <IoPeopleOutline size={18} className="add-page__header-icon" />
                <span className="add-page__header-title">Gestion de groupe</span>
            </div>

            <div className="add-page__content add-page__content--cards">
                <p className="add-page__subtitle">Créez un nouveau groupe ou rejoignez-en un avec un code d'invitation</p>

                {/* Card: Create */}
                <button
                    className={`add-page__card ${mode === 'create' ? 'add-page__card--active' : ''}`}
                    onClick={() => setMode(m => m === 'create' ? null : 'create')}
                >
                    <div className="add-page__card-icon"><IoCreateOutline size={36} /></div>
                    <div className="add-page__card-text">
                        <span className="add-page__card-title">Créer un groupe</span>
                        <span className="add-page__card-desc">Créez un nouveau groupe et invitez vos amis</span>
                    </div>
                </button>

                <div className={`add-page__form-wrap ${mode === 'create' ? 'add-page__form-wrap--open' : ''}`}>
                    <div className="add-page__form">
                        <label className="add-page__label">Nom du groupe *</label>
                        <input className="add-page__input" placeholder="Ex: Projet Echo, Club Running..." value={groupName}
                            onChange={e => setGroupName(e.target.value)} maxLength={50} />
                        <span className="add-page__char-count">{groupName.length}/50</span>

                        <label className="add-page__label">Description (optionnel)</label>
                        <textarea className="add-page__textarea" placeholder="Décrivez l'objectif de ce groupe..."
                            value={description} onChange={e => setDescription(e.target.value)} maxLength={200} rows={3} />
                        <span className="add-page__char-count">{description.length}/200</span>

                        {createDone && <p className="add-page__done">Groupe créé ✓</p>}
                        <div className="add-page__btn-row">
                            <button className="add-page__btn-cancel" onClick={() => setMode(null)}>Annuler</button>
                            <button className="add-page__btn-send" onClick={handleCreate}
                                disabled={!groupName.trim() || creating || createDone}>
                                {creating ? '...' : <><IoAddCircle size={16} /> Créer</>}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Card: Join */}
                <button
                    className={`add-page__card ${mode === 'join' ? 'add-page__card--active' : ''}`}
                    onClick={() => setMode(m => m === 'join' ? null : 'join')}
                >
                    <div className="add-page__card-icon"><IoKeyOutline size={36} /></div>
                    <div className="add-page__card-text">
                        <span className="add-page__card-title">Rejoindre avec un code</span>
                        <span className="add-page__card-desc">Entrez un code d'invitation pour rejoindre un groupe</span>
                    </div>
                </button>

                <div className={`add-page__form-wrap ${mode === 'join' ? 'add-page__form-wrap--open' : ''}`}>
                    <div className="add-page__form">
                        <label className="add-page__label">Code d'invitation *</label>
                        <input className="add-page__input" placeholder="Ex: ABC123XYZ" value={inviteCode}
                            onChange={e => setInviteCode(e.target.value.toUpperCase())}
                            style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }} />
                        <div className="add-page__info-box">
                            Le code d'invitation vous a été fourni par un membre du groupe.
                        </div>
                        {joinDone && <p className="add-page__done">Demande envoyée ✓</p>}
                        <div className="add-page__btn-row">
                            <button className="add-page__btn-cancel" onClick={() => setMode(null)}>Annuler</button>
                            <button className="add-page__btn-send" onClick={handleJoin}
                                disabled={!inviteCode.trim() || joining || joinDone}>
                                {joining ? '...' : <><IoEnterOutline size={16} /> Rejoindre</>}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
