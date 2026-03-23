import { useCallback, useRef } from 'react';
import './SidebarResizer.css';

interface SidebarResizerProps {
    onResize: (newWidth: number) => void;
    minWidth: number;
    maxWidth: number;
}

export default function SidebarResizer({ onResize, minWidth, maxWidth }: SidebarResizerProps) {
    const isDragging = useRef(false);
    const resizerRef = useRef<HTMLDivElement>(null);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isDragging.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const sidebarIconWidth = 60; // matches SIDEBAR_ICON_WIDTH

        const handleMouseMove = (moveEvent: MouseEvent) => {
            if (!isDragging.current) return;
            const newWidth = Math.min(maxWidth, Math.max(minWidth, moveEvent.clientX - sidebarIconWidth));
            onResize(newWidth);
        };

        const handleMouseUp = () => {
            isDragging.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [onResize, minWidth, maxWidth]);

    return (
        <div
            ref={resizerRef}
            className="sidebar-resizer"
            onMouseDown={handleMouseDown}
        >
            <div className="sidebar-resizer__handle" />
        </div>
    );
}
