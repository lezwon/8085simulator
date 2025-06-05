
import React, { useState, useEffect } from 'react';
import { toHexString } from '../utils/formatters';

interface MemoryViewProps {
  memory: Uint8Array;
  currentAddress: number; // To highlight the current address
  startAddressView: number;
  onSetStartAddressView: (addr: number) => void;
}

const MEMORY_VIEW_SIZE = 256; // Number of bytes to display

const MemoryView: React.FC<MemoryViewProps> = ({ memory, currentAddress, startAddressView, onSetStartAddressView }) => {
  const [inputAddr, setInputAddr] = useState(toHexString(startAddressView, 4));

  useEffect(() => {
    setInputAddr(toHexString(startAddressView, 4));
  }, [startAddressView]);

  const handleAddrChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputAddr(e.target.value.toUpperCase());
  };

  const handleAddrSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const newAddr = parseInt(inputAddr, 16);
    if (!isNaN(newAddr) && newAddr >= 0 && newAddr <= 0xFFFF) {
      onSetStartAddressView(newAddr & 0xFFF0); // Align to 16 byte boundary
    }
  };

  const renderMemory = () => {
    const items = [];
    for (let i = 0; i < MEMORY_VIEW_SIZE; i += 16) {
      const rowAddr = startAddressView + i;
      if (rowAddr > 0xFFFF) break;

      const byteCells = [];
      for (let j = 0; j < 16; j++) {
        const addr = rowAddr + j;
        if (addr > 0xFFFF) {
          byteCells.push(<td key={`byte-${addr}`} className="px-1 py-0.5">--</td>);
          continue;
        }
        const isCurrent = addr === currentAddress;
        byteCells.push(
          <td key={`byte-${addr}`} className={`px-1 py-0.5 ${isCurrent ? 'bg-yellow-600 text-black' : 'text-green-400'}`}>
            {toHexString(memory[addr], 2)}
          </td>
        );
      }
      items.push(
        <tr key={`row-${rowAddr}`} className="border-b border-gray-600 hover:bg-gray-650">
          <td className="px-2 py-0.5 text-blue-400">{toHexString(rowAddr, 4)}:</td>
          {byteCells}
        </tr>
      );
    }
    return items;
  };

  return (
    <div className="bg-gray-700 p-4 rounded-lg shadow-md text-white font-digital h-96 flex flex-col">
      <h3 className="text-lg font-bold mb-2 text-center font-sans text-gray-300">MEMORY VIEW</h3>
      <form onSubmit={handleAddrSubmit} className="mb-2 flex items-center space-x-2">
        <label htmlFor="startAddr" className="text-sm text-gray-400 font-sans">Start:</label>
        <input 
          type="text" 
          id="startAddr"
          value={inputAddr}
          onChange={handleAddrChange}
          maxLength={4}
          className="bg-gray-800 text-green-400 p-1 rounded w-20 border border-gray-600 focus:border-blue-500 outline-none"
        />
        <button type="submit" className="keypad-btn control-btn text-xs py-1 px-2">View</button>
      </form>
      <div className="overflow-y-auto flex-grow">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-400">
              <th className="text-left px-2 py-1">Addr</th>
              {Array.from({ length: 16 }).map((_, i) => (
                <th key={`head-${i}`} className="px-1 py-1">{toHexString(i,1)}</th>
              ))}
            </tr>
          </thead>
          <tbody>{renderMemory()}</tbody>
        </table>
      </div>
    </div>
  );
};

export default MemoryView;
    