import { useState, useCallback, useRef, useEffect } from 'react';
import './ResizableDivider.css';

interface ResizableDividerProps {
  direction: 'horizontal' | 'vertical';
  onResize?: (size: number) => void;
  defaultPosition?: number;
  minSize?: number;
  maxSize?: number;
  className?: string;
}

export function ResizableDivider({
  direction = 'vertical',
  onResize,
  defaultPosition = 50,
  minSize = 20,
  maxSize = 80,
  className = ''
}: ResizableDividerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState(defaultPosition);
  const dividerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (dividerRef.current) {
      containerRef.current = dividerRef.current.parentElement;
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      
      const containerRect = containerRef.current.getBoundingClientRect();
      let newPosition: number;
      
      if (direction === 'vertical') {
        const mouseX = e.clientX - containerRect.left;
        newPosition = (mouseX / containerRect.width) * 100;
      } else {
        const mouseY = e.clientY - containerRect.top;
        newPosition = (mouseY / containerRect.height) * 100;
      }
      
      // Clamp position between min and max
      newPosition = Math.max(minSize, Math.min(maxSize, newPosition));
      
      setPosition(newPosition);
      onResize?.(newPosition);
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [direction, minSize, maxSize, onResize]);

  const dividerStyle = direction === 'vertical' 
    ? { left: `${position}%` }
    : { top: `${position}%` };

  return (
    <div
      ref={dividerRef}
      className={`resizable-divider ${direction} ${isDragging ? 'dragging' : ''} ${className}`}
      style={dividerStyle}
      onMouseDown={handleMouseDown}
    >
      <div className="divider-handle">
        <div className="divider-grip">
          {direction === 'vertical' ? '⋮⋮' : '⋯⋯'}
        </div>
      </div>
    </div>
  );
}