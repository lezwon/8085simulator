
import React from 'react';
import { toHexString } from '../utils/formatters';

interface SevenSegmentDisplayProps {
  value: number;
  digits: number;
  label?: string;
  className?: string;
}

const SevenSegmentDisplay: React.FC<SevenSegmentDisplayProps> = ({ value, digits, label, className }) => {
  const hexString = toHexString(value, digits);

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {label && <span className="text-xs text-gray-400 mb-1 font-sans">{label}</span>}
      <div className="segment-display p-2 rounded font-digital text-3xl tracking-wider">
        {hexString}
      </div>
    </div>
  );
};

export default SevenSegmentDisplay;
    