
import React from 'react';

interface LedProps {
  label: string;
  isOn: boolean;
  className?: string;
}

const Led: React.FC<LedProps> = ({ label, isOn, className }) => {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className={`w-5 h-5 rounded-full border-2 border-black ${isOn ? 'led-on' : 'led-off'}`}></div>
      <span className="mt-1 text-xs text-gray-300 font-sans">{label}</span>
    </div>
  );
};

export default Led;
    