import React from 'react';
import { motion } from 'framer-motion';

interface JarvisVisualizerProps {
  isListening: boolean;
  isSpeaking: boolean;
  size?: number;
}

export const JarvisVisualizer: React.FC<JarvisVisualizerProps> = ({ 
  isListening, 
  isSpeaking, 
  size = 120 
}) => {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div 
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        {/* Círculo Externo (Gira se estiver ouvindo) */}
        <motion.div
          className="absolute inset-0 border-4 border-cyan-500/30 rounded-full"
          animate={isListening ? { rotate: 360 } : { rotate: 0 }}
          transition={isListening ? { repeat: Infinity, duration: 3, ease: "linear" } : {}}
        />

        {/* Círculo Médio (Pulsa se estiver falando) */}
        <motion.div
          className="absolute inset-2 border-2 border-cyan-400/50 rounded-full"
          animate={isSpeaking ? { scale: [1, 1.1, 1] } : { scale: 1 }}
          transition={isSpeaking ? { repeat: Infinity, duration: 1.5 } : {}}
        />

        {/* Núcleo (Reator Arc) */}
        <motion.div
          className="absolute inset-6 bg-cyan-500 rounded-full shadow-[0_0_20px_rgba(6,182,212,0.8)]"
          animate={isListening ? { opacity: [0.6, 1, 0.6] } : { opacity: 1 }}
          transition={isListening ? { repeat: Infinity, duration: 1 } : {}}
        />

        {/* Anéis de Dados */}
        {isListening && (
          <motion.div
            className="absolute -inset-4 border border-cyan-300/20 rounded-full"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ repeat: Infinity, duration: 2 }}
          />
        )}
      </div>
      
      <span className="text-xs font-mono text-cyan-400 uppercase tracking-widest">
        {isSpeaking ? 'Transmitindo...' : isListening ? 'Ouvindo...' : 'Sistemas Online'}
      </span>
    </div>
  );
};
