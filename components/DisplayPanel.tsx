
import React from 'react';
import SevenSegmentDisplay from './SevenSegmentDisplay';
import Led from './Led';
import { Flags } from '../types';
import { toHexString } from '../utils/formatters';


interface DisplayPanelProps {
  address: number;
  data: number;
  flags: Flags;
  inputBuffer: string;
  isAddressInputActive: boolean;
}

const DisplayPanel: React.FC<DisplayPanelProps> = ({ address, data, flags, inputBuffer, isAddressInputActive }) => {
  return (
    <div className="bg-gray-700 p-4 rounded-lg shadow-md mb-4 flex flex-col items-center">
      <div className="flex justify-around w-full mb-4">
        <SevenSegmentDisplay label="ADDRESS" value={isAddressInputActive && inputBuffer.length > 0 && parseInt(inputBuffer, 16) >= 0 ? parseInt(inputBuffer, 16) : address} digits={4} />
        <SevenSegmentDisplay label="DATA / INPUT" value={!isAddressInputActive && inputBuffer.length > 0 && parseInt(inputBuffer, 16) >=0 ? parseInt(inputBuffer, 16) : data} digits={2} />
      </div>
      <div className="flex justify-center space-x-3 items-center bg-gray-600 p-2 rounded w-full">
        <Led label="S" isOn={flags.S} />
        <Led label="Z" isOn={flags.Z} />
        <Led label="AC" isOn={flags.AC} />
        <Led label="P" isOn={flags.P} />
        <Led label="CY" isOn={flags.CY} />
      </div>
    </div>
  );
};

export default DisplayPanel;
    