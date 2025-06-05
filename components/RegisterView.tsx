
import React from 'react';
import { Registers } from '../types';
import { toHexString } from '../utils/formatters';

interface RegisterViewProps {
  registers: Registers;
}

const RegisterView: React.FC<RegisterViewProps> = ({ registers }) => {
  const registerPairs = [
    { name: 'A', value: registers.A, size: 2 },
    { name: 'BC', value: (registers.B << 8) | registers.C, size: 4 },
    { name: 'DE', value: (registers.D << 8) | registers.E, size: 4 },
    { name: 'HL', value: (registers.H << 8) | registers.L, size: 4 },
    { name: 'SP', value: registers.SP, size: 4 },
    { name: 'PC', value: registers.PC, size: 4 },
  ];

  return (
    <div className="bg-gray-700 p-4 rounded-lg shadow-md text-white font-digital">
      <h3 className="text-lg font-bold mb-2 text-center font-sans text-gray-300">REGISTERS</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {registerPairs.map(reg => (
          <div key={reg.name} className="flex justify-between">
            <span className="text-gray-400">{reg.name}:</span>
            <span className="text-green-400">{toHexString(reg.value, reg.size)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RegisterView;
    