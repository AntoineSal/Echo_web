import React, { useState } from 'react';
import { IoClose, IoPeopleOutline, IoCreateOutline, IoKeyOutline, IoAddCircle, IoEnterOutline } from 'react-icons/io5';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { createGroupAndSync, joinGroupByCodeAndSync } from '../../services/groupCreation';
import './CreateGroupModal.css';

interface CreateGroupModalProps {
    onClose: () => void;
}

type Mode = 'create' | 'join' | null;

export function CreateGroupModal({ onClose }: CreateGroupModalProps) {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [mode, setMode] = useState<Mode>(null);

    // Create state
    const [groupName, setGroupName] = useState('');
    const [description, setDescription] = useState('');
    const [creating, setCreating] = useState(false);
    const [createDone, setCreateDone] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    // Join state
    const [inviteCode, setInviteCode] = useState('');
    const [joining, setJoining] = useState(false);
    const [joinDone, setJoinDone] = useState(false);
    const [joinError, setJoinError] = useState<string | null>(null);

    const handleCreate = async () => {
        if (!groupName.trim()) return;
        setCreating(true);
        setCreateError(null);
        try {
            await createGroupAndSync({
                ownerUuid: user?.uuid,
                queryClient,
                name: groupName,
                description,
            });
            setCreateDone(true);
            setTimeout(onClose, 1200);
        } catch (error) {
            setCreateError(error instanceof Error ? error.message : 'Impossible de créer le groupe.');
        } finally { setCreating(false); }
    };

    const handleJoin = async () => {
        if (!inviteCode.trim()) return;
        setJoining(true);
        setJoinError(null);
        try {
            await joinGroupByCodeAndSync({
                ownerUuid: user?.uuid,
                queryClient,
                inviteCode,
            });
            setJoinDone(true);
            setTimeout(onClose, 1200);
        } catch (error) {
            setJoinError(error instanceof Error ? error.message : 'Impossible de rejoindre le groupe.');
        } finally { setJoining(false); }
    };

    return (
        <div className="cgm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="cgm-modal">
                {/* Header */}
                <div className="cgm-header">
                    <IoPeopleOutline size={20} />
                    <span className="cgm-title">Gestion de groupe</span>
                    <button className="cgm-close" onClick={onClose}><IoClose size={20} /></button>
                </div>

                <div className="cgm-body">
                    {/* Card: Create */}
                    <button
                        className={`cgm-card ${mode === 'create' ? 'cgm-card--active' : ''}`}
                        onClick={() => setMode(m => m === 'create' ? null : 'create')}
                    >
                        <div className="cgm-card-icon"><IoCreateOutline size={36} /></div>
                        <div className="cgm-card-text">
                            <span className="cgm-card-title">Créer un groupe</span>
                            <span className="cgm-card-desc">Créez un nouveau groupe et invitez vos amis</span>
                        </div>
                    </button>

                    {/* Create form */}
                    <div className={`cgm-form-wrap ${mode === 'create' ? 'cgm-form-wrap--open' : ''}`}>
                        <div className="cgm-form">
                            <label className="cgm-label">Nom du groupe *</label>
                            <input
                                className="cgm-input"
                                placeholder="Ex: Projet Echo, Club Running..."
                                value={groupName}
                                onChange={e => setGroupName(e.target.value)}
                                maxLength={50}
                            />
                            <span className="cgm-char-count">{groupName.length}/50</span>

                            <label className="cgm-label">Description (optionnel)</label>
                            <textarea
                                className="cgm-textarea"
                                placeholder="Décrivez l'objectif de ce groupe..."
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                maxLength={200}
                                rows={3}
                            />
                            <span className="cgm-char-count">{description.length}/200</span>

                            {createDone && <p className="cgm-done">Groupe créé ✓</p>}
                            {createError && <p className="cgm-error">{createError}</p>}

                            <div className="cgm-btn-row">
                                <button className="cgm-btn-cancel" onClick={() => setMode(null)}>Annuler</button>
                                <button
                                    className="cgm-btn-submit"
                                    onClick={handleCreate}
                                    disabled={!groupName.trim() || creating || createDone}
                                >
                                    {creating ? '...' : <><IoAddCircle size={16} /> Créer</>}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Card: Join */}
                    <button
                        className={`cgm-card ${mode === 'join' ? 'cgm-card--active' : ''}`}
                        onClick={() => setMode(m => m === 'join' ? null : 'join')}
                    >
                        <div className="cgm-card-icon"><IoKeyOutline size={36} /></div>
                        <div className="cgm-card-text">
                            <span className="cgm-card-title">Rejoindre avec un code</span>
                            <span className="cgm-card-desc">Entrez un code d'invitation pour rejoindre un groupe</span>
                        </div>
                    </button>

                    {/* Join form */}
                    <div className={`cgm-form-wrap ${mode === 'join' ? 'cgm-form-wrap--open' : ''}`}>
                        <div className="cgm-form">
                            <label className="cgm-label">Code d'invitation *</label>
                            <input
                                className="cgm-input"
                                placeholder="Ex: ABC123XYZ"
                                value={inviteCode}
                                onChange={e => setInviteCode(e.target.value.toUpperCase())}
                                style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}
                            />

                            <div className="cgm-info-box">
                                Le code d'invitation vous a été fourni par un membre du groupe.
                            </div>

                            {joinDone && <p className="cgm-done">Demande envoyée ✓</p>}
                            {joinError && <p className="cgm-error">{joinError}</p>}

                            <div className="cgm-btn-row">
                                <button className="cgm-btn-cancel" onClick={() => setMode(null)}>Annuler</button>
                                <button
                                    className="cgm-btn-submit"
                                    onClick={handleJoin}
                                    disabled={!inviteCode.trim() || joining || joinDone}
                                >
                                    {joining ? '...' : <><IoEnterOutline size={16} /> Rejoindre</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
