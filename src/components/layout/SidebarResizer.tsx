import { useCallback, useRef } from 'react';
import './SidebarResizer.css';

interface SidebarResizerProps {
    onResize: (newWidth: number) => void;
    onResizeStart?: () => void;
    onResizeEnd?: () => void;
    isResizing?: boolean;
    minWidth: number;
    maxWidth: number;
    snapPoints?: number[];
    snapThreshold?: number;
}

export default function SidebarResizer({
    onResize,
    onResizeStart,
    onResizeEnd,
    isResizing = false,
    minWidth,
    maxWidth,
    snapPoints = [],
    snapThreshold = 0,
}: SidebarResizerProps) {
    const isDragging = useRef(false);
    const resizerRef = useRef<HTMLDivElement>(null);
    const frameRef = useRef<number | null>(null);
    const pendingWidthRef = useRef<number | null>(null);
    const pendingRawWidthRef = useRef<number | null>(null);

    const getResolvedWidth = useCallback((rawWidth: number) => {
        const clampedWidth = Math.min(maxWidth, Math.max(minWidth, rawWidth));
        if (snapPoints.length === 0) return clampedWidth;

        const nearestSnap = snapPoints.reduce((closest, point) => (
            Math.abs(point - clampedWidth) < Math.abs(closest - clampedWidth) ? point : closest
        ), snapPoints[0]);

        const distance = Math.abs(nearestSnap - clampedWidth);
        if (distance >= snapThreshold || snapThreshold <= 0) {
            return clampedWidth;
        }

        // Keep the drag under the cursor while adding a soft magnetic pull near snap points.
        const normalized = 1 - (distance / snapThreshold);
        const easedPull = 1 - Math.pow(1 - normalized, 3);
        const pullStrength = 0.55 * easedPull;
        const blendedWidth = clampedWidth + ((nearestSnap - clampedWidth) * pullStrength);

        if (!Number.isFinite(blendedWidth)) {
            return clampedWidth;
        }

        return Math.abs(nearestSnap - blendedWidth) < 1.5 ? nearestSnap : blendedWidth;
    }, [maxWidth, minWidth, snapPoints, snapThreshold]);

    const getSnappedWidthOnRelease = useCallback((rawWidth: number) => {
        const clampedWidth = Math.min(maxWidth, Math.max(minWidth, rawWidth));
        if (snapPoints.length === 0) return clampedWidth;

        return snapPoints.reduce((closest, point) => (
            Math.abs(point - clampedWidth) < Math.abs(closest - clampedWidth) ? point : closest
        ), snapPoints[0]);
    }, [maxWidth, minWidth, snapPoints]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isDragging.current = true;
        onResizeStart?.();
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const sidebarIconWidth = 60; // matches SIDEBAR_ICON_WIDTH

        const handleMouseMove = (moveEvent: MouseEvent) => {
            if (!isDragging.current) return;
            const rawWidth = moveEvent.clientX - sidebarIconWidth;
            pendingRawWidthRef.current = rawWidth;
            pendingWidthRef.current = getResolvedWidth(rawWidth);

            if (frameRef.current !== null) return;
            frameRef.current = window.requestAnimationFrame(() => {
                frameRef.current = null;
                if (pendingWidthRef.current !== null) {
                    onResize(pendingWidthRef.current);
                }
            });
        };

        const handleMouseUp = () => {
            isDragging.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            onResizeEnd?.();

            if (frameRef.current !== null) {
                window.cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
            if (pendingRawWidthRef.current !== null) {
                onResize(getSnappedWidthOnRelease(pendingRawWidthRef.current));
                pendingRawWidthRef.current = null;
                pendingWidthRef.current = null;
            } else if (pendingWidthRef.current !== null) {
                onResize(pendingWidthRef.current);
                pendingWidthRef.current = null;
            }

            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [getResolvedWidth, getSnappedWidthOnRelease, onResize, onResizeEnd, onResizeStart]);

    return (
        <div
            ref={resizerRef}
            className={`sidebar-resizer ${isResizing ? 'sidebar-resizer--active' : ''}`}
            onMouseDown={handleMouseDown}
        >
            <div className="sidebar-resizer__handle" />
        </div>
    );
}
