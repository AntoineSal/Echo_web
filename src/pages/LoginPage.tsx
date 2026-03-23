import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './LoginPage.css';

export default function LoginPage() {
    const { login, register } = useAuth();
    const [isRegister, setIsRegister] = useState(false);
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            if (isRegister) {
                await register({ username, email, password });
            } else {
                await login(username, password);
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Une erreur est survenue');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-page__card">
                <div className="login-page__header">
                    <div className="login-page__logo">E</div>
                    <h1 className="login-page__title">Echo</h1>
                    <p className="login-page__subtitle">
                        {isRegister ? 'Créer un compte' : 'Connexion'}
                    </p>
                </div>

                <form className="login-page__form" onSubmit={handleSubmit}>
                    <div className="login-page__field">
                        <label htmlFor="username">Nom d'utilisateur</label>
                        <input
                            id="username"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Votre nom d'utilisateur"
                            autoComplete="username"
                            required
                        />
                    </div>

                    {isRegister && (
                        <div className="login-page__field">
                            <label htmlFor="email">Email</label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="votre@email.com"
                                autoComplete="email"
                                required
                            />
                        </div>
                    )}

                    <div className="login-page__field">
                        <label htmlFor="password">Mot de passe</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete={isRegister ? 'new-password' : 'current-password'}
                            required
                        />
                    </div>

                    {error && <p className="login-page__error">{error}</p>}

                    <button
                        className="login-page__submit"
                        type="submit"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? '...' : isRegister ? "S'inscrire" : 'Se connecter'}
                    </button>
                </form>

                <button
                    className="login-page__toggle"
                    onClick={() => { setIsRegister(!isRegister); setError(''); }}
                >
                    {isRegister ? 'Déjà un compte ? Se connecter' : 'Pas encore de compte ? Créer un compte'}
                </button>
            </div>
        </div>
    );
}
