
import React from 'react';
import KeypadButton from './KeypadButton';

interface ControlPanelProps {
  onReset: () => void;
  onExecuteStep: () => void;
  // onGo: () => void; // Implemented via Keypad.tsx for GO address input
  // onExamMem: () => void; // Implemented via Keypad.tsx
  // onStore: () => void; // Implemented via Keypad.tsx
  // onNextAddr: () => void; // Implemented via Keypad.tsx
  // onPrevAddr: () => void; // Implemented via Keypad.tsx
  isRunning: boolean;
  onStop: () => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ onReset, onExecuteStep, isRunning, onStop }) => {
  return (
    <div className="bg-gray-700 p-4 rounded-lg shadow-md mt-4">
      <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
        <KeypadButton label="RESET" onClick={onReset} className="bg-red-700 hover:bg-red-600 w-full" variant="control"/>
        <KeypadButton label="EXEC STEP" onClick={onExecuteStep} className="bg-indigo-600 hover:bg-indigo-500 w-full" variant="control" />
        {isRunning && <KeypadButton label="STOP" onClick={onStop} className="bg-yellow-500 hover:bg-yellow-400 text-black w-full col-span-2" variant="control" />}
      </div>
    </div>
  );
};

export default ControlPanel;
    