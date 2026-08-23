import React, { useEffect, useRef } from 'react';
import { usePOS } from '../../context/POSContext.tsx';

export const BarcodeScannerListener: React.FC = () => {
  const { handleBarcodeScan } = usePOS();
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is actively typing in a standard input or textarea
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        // If it's the Enter key inside an input, don't interfere
        return;
      }

      const now = Date.now();
      // Hardware scanners typically type characters rapidly (< 50ms interval)
      if (now - lastKeyTimeRef.current > 120) {
        bufferRef.current = '';
      }
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        if (bufferRef.current.length >= 3) {
          const matched = handleBarcodeScan(bufferRef.current);
          if (matched) {
            e.preventDefault();
          }
        }
        bufferRef.current = '';
      } else if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleBarcodeScan]);

  return null;
};
