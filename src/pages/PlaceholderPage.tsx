import { IoChatbubblesOutline } from 'react-icons/io5';
import './PlaceholderPage.css';

interface PlaceholderPageProps {
    title: string;
    description: string;
}

export default function PlaceholderPage({ title, description }: PlaceholderPageProps) {
    return (
        <div className="placeholder-page">
            <IoChatbubblesOutline size={48} color="rgba(10, 145, 104, 0.3)" />
            <h2 className="placeholder-page__title">{title}</h2>
            <p className="placeholder-page__desc">{description}</p>
        </div>
    );
}
