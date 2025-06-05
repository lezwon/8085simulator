
import React from 'react';
import KeypadButton from './KeypadButton';

interface KeypadProps {
  onKeyPress: (key: string) => void;
}

const Keypad: React.FC<KeypadProps> = ({ onKeyPress }) => {
  // Standard 4x4 Hex Keypad Layout Rows
  const hexKeyRows = [
    ['7', '8', '9', 'C'],
    ['4', '5', '6', 'D'],
    ['1', '2', '3', 'E'],
    ['0', 'A', 'B', 'F']
  ];

  // Control Keys
  const controlKeyDefs = [
    { label: "EXAM", action: 'EXAM_MEM', style: "bg-yellow-600 hover:bg-yellow-500" },
    { label: "STORE", action: 'STORE', style: "bg-green-600 hover:bg-green-500" },
    { label: "NEXT", action: 'NEXT_ADDR', style: "bg-blue-600 hover:bg-blue-500" },
    { label: "PREV", action: 'PREV_ADDR', style: "bg-blue-600 hover:bg-blue-500" },
    { label: "GO", action: 'GO', style: "bg-red-600 hover:bg-red-500 col-span-2" } // GO spans 2 columns
  ];

  return (
    <div className="bg-gray-700 p-4 rounded-lg shadow-md">
      <div className="grid grid-cols-4 gap-2">
        {/* Render Hex Keys */}
        {hexKeyRows.flat().map((key) => (
          <KeypadButton key={`hex-${key}`} label={key} onClick={() => onKeyPress(key)} variant="hex" />
        ))}
        
        {/* Render Control Keys */}
        {/* First row of 4 control keys */}
        {controlKeyDefs.slice(0, 4).map(ctrlKey => (
             <KeypadButton 
                key={ctrlKey.action} 
                label={ctrlKey.label} 
                onClick={() => onKeyPress(ctrlKey.action)} 
                className={ctrlKey.style} 
                variant="control" />
        ))}

        {/* Second row for the 'GO' key, centered */}
        <div /> {/* Spacer for grid alignment */}
        <KeypadButton 
            key={controlKeyDefs[4].action} 
            label={controlKeyDefs[4].label} 
            onClick={() => onKeyPress(controlKeyDefs[4].action)} 
            className={controlKeyDefs[4].style}  // col-span-2 is now part of the style string
            variant="control" />
        {/* The col-span-2 on GO button will make it take two cells. The div spacer helps to center it visually in a 4 col grid if it's the only item on its conceptual "row" starting after 1 empty cell. */}
        {/* Effectively: [spacer] [GO BTN] [GO BTN] [spacer] (conceptual) */}
         {/* One more spacer to fill the 4th column if GO takes 2 starting from 2nd position*/}
         <div /> 
      </div>
    </div>
  );
};

export default Keypad;
