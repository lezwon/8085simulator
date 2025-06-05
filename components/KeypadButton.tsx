
import React from 'react';

interface KeypadButtonProps {
  label: string;
  onClick: () => void;
  className?: string;
  variant?: 'hex' | 'control';
}

const KeypadButton: React.FC<KeypadButtonProps> = ({ label, onClick, className = '', variant = 'hex' }) => {
  const baseStyle = "text-white font-bold py-3 px-4 rounded focus:outline-none shadow-lg transition-transform transform active:scale-95 keypad-btn";
  const hexStyle = "bg-gray-600 hover:bg-gray-500 text-xl";
  const controlStyle = "control-btn text-sm py-2 px-3";
  
  return (
    <button
      onClick={onClick}
      className={`${baseStyle} ${variant === 'hex' ? hexStyle : controlStyle} ${className}`}
    >
      {label}
    </button>
  );
};

export default KeypadButton;
    