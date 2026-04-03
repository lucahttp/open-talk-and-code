import { useRef, useEffect, useCallback } from 'react';

/**
 * Custom hook for audio visualization with canvas
 */
export function useAudioVisualization(canvasRef, options = {}) {
    const {
        color = [22, 200, 206],
        maxHistory = 640,
        normalize = false,
        normalizeMax = 1.0,
    } = options;

    const historyRef = useRef([]);
    const animationRef = useRef(null);

    const pushValue = useCallback(
        (value) => {
            const normalizedValue = normalize ? value / normalizeMax : value;
            historyRef.current.push(Math.max(0, Math.min(1, normalizedValue)));
            if (historyRef.current.length > maxHistory) {
                historyRef.current = historyRef.current.slice(
                    historyRef.current.length - maxHistory
                );
            }
        },
        [maxHistory, normalize, normalizeMax]
    );

    const draw = useCallback(
        (opacity = 1.0) => {
            const canvas = canvasRef.current;
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            const [r, g, b] = color;
            const history = historyRef.current;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = `rgba(${r},${g},${b},${opacity})`;
            ctx.fillStyle = `rgba(${r},${g},${b},${opacity / 2})`;
            ctx.lineWidth = 1;

            ctx.beginPath();
            let lastX = 0;
            for (let i = 0; i < history.length; i++) {
                const x = (i / maxHistory) * canvas.width;
                const y = canvas.height - history[i] * canvas.height;
                if (i === 0) {
                    ctx.moveTo(1, y);
                } else {
                    ctx.lineTo(x, y);
                }
                lastX = x;
            }
            ctx.lineTo(lastX, canvas.height);
            ctx.lineTo(0, canvas.height);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        },
        [canvasRef, color, maxHistory]
    );

    const clear = useCallback(() => {
        historyRef.current = [];
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }, [canvasRef]);

    useEffect(() => {
        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, []);

    return { pushValue, draw, clear, history: historyRef };
}

/**
 * Hook for managing multiple wake word visualizations
 */
export function useMultiLineVisualization(canvasRef, colors, maxHistory = 640) {
    const historiesRef = useRef({});

    const pushValue = useCallback(
        (name, value) => {
            if (!historiesRef.current[name]) {
                historiesRef.current[name] = [];
            }
            historiesRef.current[name].push(Math.max(0, Math.min(1, value)));
            if (historiesRef.current[name].length > maxHistory) {
                historiesRef.current[name] = historiesRef.current[name].slice(
                    historiesRef.current[name].length - maxHistory
                );
            }
        },
        [maxHistory]
    );

    const draw = useCallback(
        (activeStates = {}) => {
            const canvas = canvasRef.current;
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            for (const [name, color] of Object.entries(colors)) {
                const history = historiesRef.current[name] || [];
                if (history.length === 0) continue;

                const [r, g, b] = color;
                const opacity = activeStates[name] ? 1.0 : 0.5;

                ctx.strokeStyle = `rgba(${r},${g},${b},${opacity})`;
                ctx.fillStyle = `rgba(${r},${g},${b},${opacity / 2})`;
                ctx.lineWidth = 1;

                ctx.beginPath();
                let lastX = 0;
                for (let i = 0; i < history.length; i++) {
                    const x = (i / maxHistory) * canvas.width;
                    const y = canvas.height - history[i] * canvas.height;
                    if (i === 0) {
                        ctx.moveTo(1, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                    lastX = x;
                }
                ctx.lineTo(lastX, canvas.height);
                ctx.lineTo(0, canvas.height);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
        },
        [canvasRef, colors, maxHistory]
    );

    const clear = useCallback(() => {
        historiesRef.current = {};
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }, [canvasRef]);

    return { pushValue, draw, clear };
}
