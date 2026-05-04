import React from 'react';
import './ProfileReadme.css';

type PokemonType = 'psy' | 'feu' | 'eau' | 'elec' | 'acier' | 'plante';

interface ProfileReadmeProps {
    name: string;
    birthdate?: string;
    memberSince?: string;
    bio?: string;
    style?: 'pokemon';
    // options style pokemon
    pokemonTypes?: PokemonType[];
    pokemonEntry?: number;
    hp?: number;          // sur 999
}

const TYPE_LABELS: Record<PokemonType, string> = {
    psy: 'Psy', feu: 'Feu', eau: 'Eau',
    elec: 'Électrik', acier: 'Acier', plante: 'Plante',
};

export default function ProfileReadme({
    name,
    birthdate,
    memberSince,
    bio,
    style = 'pokemon',
    pokemonTypes = ['psy', 'acier'],
    pokemonEntry = 721,
    hp = 880,
}: ProfileReadmeProps) {
    return (
        <div className={`preadme preadme--${style}`}>
            <PokemonStyle
                name={name}
                birthdate={birthdate}
                memberSince={memberSince}
                bio={bio}
                pokemonTypes={pokemonTypes}
                pokemonEntry={pokemonEntry}
                hp={hp}
            />
        </div>
    );
}

function PokemonStyle({ name, birthdate, memberSince, bio, pokemonTypes = [], pokemonEntry = 0, hp = 999 }: Omit<ProfileReadmeProps, 'style'>) {
    const hpPct = Math.min(100, Math.round((hp! / 999) * 100));

    return (
        <div className="preadme-pokemon-inner">

            {/* Pokéball watermark */}
            <div className="preadme-pokemon-ball" aria-hidden>
                <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="50" cy="50" r="48" stroke="#1a1a2e" strokeWidth="4"/>
                    <path d="M2 50 H98" stroke="#1a1a2e" strokeWidth="4"/>
                    <path d="M2 50 A48 48 0 0 1 98 50" fill="#e3350d"/>
                    <circle cx="50" cy="50" r="14" stroke="#1a1a2e" strokeWidth="4" fill="white"/>
                    <circle cx="50" cy="50" r="7" fill="#1a1a2e"/>
                </svg>
            </div>

            {/* Zone principale */}
            <div className="preadme-pokemon-main">
                <p className="preadme-pokemon-entry">
                    No.{String(pokemonEntry).padStart(3, '0')} — Dresseur
                </p>
                <h2 className="preadme-pokemon-name">{name}</h2>
                <div className="preadme-pokemon-types">
                    {(pokemonTypes as PokemonType[]).map(t => (
                        <span key={t} className={`preadme-type-badge preadme-type-badge--${t}`}>
                            {TYPE_LABELS[t]}
                        </span>
                    ))}
                </div>
                {bio ? (
                    <p className="preadme-pokemon-desc">« {bio} »</p>
                ) : (
                    <p className="preadme-pokemon-desc preadme-pokemon-desc--empty">
                        Ce dresseur reste mystérieux. Aucune donnée disponible dans le Pokédex.
                    </p>
                )}
            </div>

            {/* Fiche stats droite */}
            <div className="preadme-pokemon-card">
                <div className="preadme-pokemon-infos">
                    {birthdate && (
                        <div className="preadme-pokemon-info">
                            <span className="preadme-pokemon-info__label">Né le</span>
                            <span className="preadme-pokemon-info__value">{birthdate}</span>
                        </div>
                    )}
                    {memberSince && (
                        <div className="preadme-pokemon-info">
                            <span className="preadme-pokemon-info__label">Dresseur Echo depuis</span>
                            <span className="preadme-pokemon-info__value">{memberSince}</span>
                        </div>
                    )}
                </div>
                <div className="preadme-pokemon-hp">
                    <div className="preadme-pokemon-hp__header">
                        <span className="preadme-pokemon-hp__label">PV</span>
                        <span className="preadme-pokemon-hp__value">{hp}</span>
                    </div>
                    <div className="preadme-pokemon-hp__bar">
                        <div
                            className="preadme-pokemon-hp__fill"
                            style={{ width: `${hpPct}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
