import { useRef, useEffect, useMemo } from 'react';
import { useAudioVisualization, useMultiLineVisualization } from '../hooks/useAudioVisualization'
import { WAKE_WORDS, COLORS } from '../App' // Note: Ensure WAKE_WORDS and COLORS are exported properly

export const WakeWordVisualizer = ({ wakeWords }) => {
  const canvasRef = useRef(null);
  
  const colors = useMemo(() => {
    const c = {};
    for (const word of WAKE_WORDS) {
      c[word] = COLORS[word];
    }
    return c;
  }, []);
  
  const { pushValue, draw } = useMultiLineVisualization(canvasRef, colors);
  
  useEffect(() => {
    for (const word of WAKE_WORDS) {
      const key = word.replace(' ', '-');
      const probability = wakeWords[key]?.probability || 0;
      pushValue(word, probability);
    }
    draw();
  }, [wakeWords, pushValue, draw]);
  
  return (
    <canvas 
      ref={canvasRef} 
      width={300} 
      height={100} 
      className="border border-gray-600 bg-black/50"
    />
  );
};

export const SpeechVisualizer = ({ probability }) => {
  const canvasRef = useRef(null);
  
  const { pushValue, draw } = useAudioVisualization(
    canvasRef,
    { color: COLORS.speech }
  );
  
  useEffect(() => {
    pushValue(probability);
    draw();
  }, [probability, pushValue, draw]);
  
  return (
    <canvas 
      ref={canvasRef} 
      width={300} 
      height={50} 
      className="border border-gray-600 bg-black/50"
    />
  );
};
