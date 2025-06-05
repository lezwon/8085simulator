import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CPU8085 } from './services/8085';
import { CPUState, InteractionMode, Registers, Flags } from './types';
import { toHexString } from './utils/formatters';
import DisplayPanel from './components/DisplayPanel';
import Keypad from './components/Keypad';
import RegisterView from './components/RegisterView';
import MemoryView from './components/MemoryView';
import ControlPanel from './components/ControlPanel';

const App: React.FC = () => {
  const [cpu] = useState(() => new CPU8085());
  const [cpuState, setCpuState] = useState<CPUState>(cpu.getState());
  const [mode, setMode] = useState<InteractionMode>(InteractionMode.IDLE);
  const [inputBuffer, setInputBuffer] = useState<string>('');
  const [currentExamAddress, setCurrentExamAddress] = useState<number>(0x0000);
  const [currentDataDisplay, setCurrentDataDisplay] = useState<number>(0x00);
  const [memoryViewStartAddress, setMemoryViewStartAddress] = useState<number>(0x0000);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const runIntervalRef = useRef<number | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [activeTab, setActiveTab] = useState('instructions');

  const refreshUI = useCallback(() => {
    const newState = cpu.getState();
    setCpuState(newState);
    if (mode === InteractionMode.EXAM_MEM_DATA_VIEW || mode === InteractionMode.IDLE) {
       setCurrentDataDisplay(newState.memory[currentExamAddress]);
    }
  }, [cpu, mode, currentExamAddress]);
  
  useEffect(() => {
    refreshUI();
  }, [refreshUI]);

  const handleReset = useCallback(() => {
    cpu.reset();
    setInputBuffer('');
    setCurrentExamAddress(0x0000);
    setMode(InteractionMode.IDLE);
    setIsRunning(false);
    if (runIntervalRef.current) clearInterval(runIntervalRef.current);
    refreshUI();
  }, [cpu, refreshUI]);

  const handleExecuteStep = useCallback(() => {
    if (!cpu.halted && !isRunning) {
      cpu.step();
      refreshUI();
      // After step, PC is the new current address for memory view focus
      setCurrentExamAddress(cpu.registers.PC); 
    }
  }, [cpu, refreshUI, isRunning]);

  const stopExecution = useCallback(() => {
    setIsRunning(false);
    if (runIntervalRef.current) {
      clearInterval(runIntervalRef.current);
      runIntervalRef.current = null;
    }
    refreshUI(); // Update UI to reflect stopped state, like HLT flag if applicable
  }, [refreshUI]);

  const startContinuousExecution = useCallback((startAddress: number) => {
    if (isRunning) return; // Already running

    cpu.registers.PC = startAddress;
    cpu.halted = false; // Ensure CPU is not halted
    setIsRunning(true);

    runIntervalRef.current = window.setInterval(() => {
      if (cpu.halted) {
        stopExecution();
        return;
      }
      cpu.step();
      // Potentially throttle UI refresh for performance during fast execution
      // For now, refresh every step.
      // To make it faster visually, refresh UI less often, e.g. every 100 steps.
      refreshUI(); 
      setCurrentExamAddress(cpu.registers.PC); 
    }, 50); // Adjust interval for speed, 50ms is 20 instructions/sec
  }, [cpu, refreshUI, stopExecution, isRunning]);


  const handleKeyPress = useCallback((key: string) => {
    if (isRunning) return; // No keypad input while running

    const hexChars = "0123456789ABCDEF";
    if (hexChars.includes(key)) {
      if (mode === InteractionMode.EXAM_MEM_ADDR_INPUT || mode === InteractionMode.GO_ADDR_INPUT) {
        if (inputBuffer.length < 4) {
          setInputBuffer(prev => prev + key);
        }
      } else if (mode === InteractionMode.EXAM_MEM_DATA_VIEW) {
         // Allow overwriting data input, max 2 chars
        if (inputBuffer.length >= 2) setInputBuffer(key);
        else setInputBuffer(prev => prev + key);
      }
    } else { // Control keys
      switch (key) {
        case 'EXAM_MEM':
          setMode(InteractionMode.EXAM_MEM_ADDR_INPUT);
          setInputBuffer(''); // Clear for new address input
          break;
        case 'STORE':
          if (mode === InteractionMode.EXAM_MEM_DATA_VIEW && inputBuffer.length > 0) {
            const dataToStore = parseInt(inputBuffer, 16);
            if (!isNaN(dataToStore)) {
              cpu.writeByte(currentExamAddress, dataToStore);
              setInputBuffer('');
              refreshUI(); // Refresh to show stored data in memory view & data display
              // Optionally auto-increment address after store:
              // setCurrentExamAddress(prev => (prev + 1) & 0xFFFF);
            }
          }
          break;
        case 'NEXT_ADDR':
          if (mode === InteractionMode.EXAM_MEM_DATA_VIEW || mode === InteractionMode.IDLE || mode === InteractionMode.EXAM_MEM_ADDR_INPUT) {
            const newAddr = (currentExamAddress + 1) & 0xFFFF;
            setCurrentExamAddress(newAddr);
            setCurrentDataDisplay(cpu.memory[newAddr]);
            setInputBuffer('');
            setMode(InteractionMode.EXAM_MEM_DATA_VIEW); // Ensure in data view mode
          }
          break;
        case 'PREV_ADDR':
           if (mode === InteractionMode.EXAM_MEM_DATA_VIEW || mode === InteractionMode.IDLE || mode === InteractionMode.EXAM_MEM_ADDR_INPUT) {
            const newAddr = (currentExamAddress - 1) & 0xFFFF;
            setCurrentExamAddress(newAddr);
            setCurrentDataDisplay(cpu.memory[newAddr]);
            setInputBuffer('');
            setMode(InteractionMode.EXAM_MEM_DATA_VIEW); // Ensure in data view mode
          }
          break;
        case 'GO':
          setMode(InteractionMode.GO_ADDR_INPUT);
          setInputBuffer('');
          break;
        default: break;
      }
    }
  }, [cpu, mode, inputBuffer, currentExamAddress, refreshUI, isRunning]);

  // Effect to handle transitions based on inputBuffer completion
  useEffect(() => {
    if (mode === InteractionMode.EXAM_MEM_ADDR_INPUT && inputBuffer.length === 4) {
      const addr = parseInt(inputBuffer, 16);
      if (!isNaN(addr)) {
        setCurrentExamAddress(addr);
        setCurrentDataDisplay(cpu.memory[addr]);
        setMode(InteractionMode.EXAM_MEM_DATA_VIEW);
        setInputBuffer(''); // Clear buffer for data input
      } else { // Invalid address input
        setInputBuffer(''); // Clear buffer, stay in address input mode or show error
      }
    } else if (mode === InteractionMode.GO_ADDR_INPUT && inputBuffer.length === 4) {
      const addr = parseInt(inputBuffer, 16);
      if (!isNaN(addr)) {
        // cpu.registers.PC = addr; // PC will be set by startContinuousExecution
        // cpu.halted = false;
        setInputBuffer('');
        setMode(InteractionMode.IDLE); // Or RUNNING, handled by isRunning state
        startContinuousExecution(addr);
      } else {
        setInputBuffer('');
      }
    }
  }, [inputBuffer, mode, cpu, startContinuousExecution]);
  
  useEffect(() => {
    // Auto-focus memory view on currentExamAddress
    if (currentExamAddress >= memoryViewStartAddress + 256 || currentExamAddress < memoryViewStartAddress) {
        setMemoryViewStartAddress(Math.max(0, (currentExamAddress - 128) & 0xFFF0)); // Center it roughly and align
    }
  }, [currentExamAddress, memoryViewStartAddress]);

  // Add keyboard event handler
  useEffect(() => {
    const handleKeyboardEvent = (event: KeyboardEvent) => {
      if (isRunning) return; // No keyboard input while running

      const key = event.key.toUpperCase();
      
      // Map hex keys (0-9, A-F)
      if (/^[0-9A-F]$/.test(key)) {
        handleKeyPress(key);
      }
      // Map control keys
      else if (key === 'M') { // M for eXaM
        handleKeyPress('EXAM_MEM');
      }
      else if (key === 'W') { // W for Store (Write)
        handleKeyPress('STORE');
      }
      else if (key === 'N') { // N for NEXT
        handleKeyPress('NEXT_ADDR');
      }
      else if (key === 'V') { // V for preVious
        handleKeyPress('PREV_ADDR');
      }
      else if (key === 'G') { // G for GO
        handleKeyPress('GO');
      }
      else if (key === 'R') { // R for RESET
        handleReset();
      }
      else if (key === 'X') { // X for EXEC STEP
        handleExecuteStep();
      }
    };

    window.addEventListener('keydown', handleKeyboardEvent);
    return () => {
      window.removeEventListener('keydown', handleKeyboardEvent);
    };
  }, [isRunning, handleKeyPress, handleReset, handleExecuteStep]);

  // Complete 8085 Instruction Set
  const instructionSet = [
    // Data Transfer Group
    { hex: '00', mnemonic: 'NOP' },
    { hex: '01', mnemonic: 'LXI B' },
    { hex: '02', mnemonic: 'STAX B' },
    { hex: '03', mnemonic: 'INX B' },
    { hex: '04', mnemonic: 'INR B' },
    { hex: '05', mnemonic: 'DCR B' },
    { hex: '06', mnemonic: 'MVI B' },
    { hex: '07', mnemonic: 'RLC' },
    { hex: '08', mnemonic: 'NOP' },
    { hex: '09', mnemonic: 'DAD B' },
    { hex: '0A', mnemonic: 'LDAX B' },
    { hex: '0B', mnemonic: 'DCX B' },
    { hex: '0C', mnemonic: 'INR C' },
    { hex: '0D', mnemonic: 'DCR C' },
    { hex: '0E', mnemonic: 'MVI C' },
    { hex: '0F', mnemonic: 'RRC' },
    { hex: '11', mnemonic: 'LXI D' },
    { hex: '12', mnemonic: 'STAX D' },
    { hex: '13', mnemonic: 'INX D' },
    { hex: '14', mnemonic: 'INR D' },
    { hex: '15', mnemonic: 'DCR D' },
    { hex: '16', mnemonic: 'MVI D' },
    { hex: '17', mnemonic: 'RAL' },
    { hex: '18', mnemonic: 'NOP' },
    { hex: '19', mnemonic: 'DAD D' },
    { hex: '1A', mnemonic: 'LDAX D' },
    { hex: '1B', mnemonic: 'DCX D' },
    { hex: '1C', mnemonic: 'INR E' },
    { hex: '1D', mnemonic: 'DCR E' },
    { hex: '1E', mnemonic: 'MVI E' },
    { hex: '1F', mnemonic: 'RAR' },
    { hex: '21', mnemonic: 'LXI H' },
    { hex: '22', mnemonic: 'SHLD' },
    { hex: '23', mnemonic: 'INX H' },
    { hex: '24', mnemonic: 'INR H' },
    { hex: '25', mnemonic: 'DCR H' },
    { hex: '26', mnemonic: 'MVI H' },
    { hex: '27', mnemonic: 'DAA' },
    { hex: '28', mnemonic: 'NOP' },
    { hex: '29', mnemonic: 'DAD H' },
    { hex: '2A', mnemonic: 'LHLD' },
    { hex: '2B', mnemonic: 'DCX H' },
    { hex: '2C', mnemonic: 'INR L' },
    { hex: '2D', mnemonic: 'DCR L' },
    { hex: '2E', mnemonic: 'MVI L' },
    { hex: '2F', mnemonic: 'CMA' },
    { hex: '31', mnemonic: 'LXI SP' },
    { hex: '32', mnemonic: 'STA' },
    { hex: '33', mnemonic: 'INX SP' },
    { hex: '34', mnemonic: 'INR M' },
    { hex: '35', mnemonic: 'DCR M' },
    { hex: '36', mnemonic: 'MVI M' },
    { hex: '37', mnemonic: 'STC' },
    { hex: '38', mnemonic: 'NOP' },
    { hex: '39', mnemonic: 'DAD SP' },
    { hex: '3A', mnemonic: 'LDA' },
    { hex: '3B', mnemonic: 'DCX SP' },
    { hex: '3C', mnemonic: 'INR A' },
    { hex: '3D', mnemonic: 'DCR A' },
    { hex: '3E', mnemonic: 'MVI A' },
    { hex: '3F', mnemonic: 'CMC' },

    // Arithmetic Group
    { hex: '40', mnemonic: 'MOV B,B' },
    { hex: '41', mnemonic: 'MOV B,C' },
    { hex: '42', mnemonic: 'MOV B,D' },
    { hex: '43', mnemonic: 'MOV B,E' },
    { hex: '44', mnemonic: 'MOV B,H' },
    { hex: '45', mnemonic: 'MOV B,L' },
    { hex: '46', mnemonic: 'MOV B,M' },
    { hex: '47', mnemonic: 'MOV B,A' },
    { hex: '48', mnemonic: 'MOV C,B' },
    { hex: '49', mnemonic: 'MOV C,C' },
    { hex: '4A', mnemonic: 'MOV C,D' },
    { hex: '4B', mnemonic: 'MOV C,E' },
    { hex: '4C', mnemonic: 'MOV C,H' },
    { hex: '4D', mnemonic: 'MOV C,L' },
    { hex: '4E', mnemonic: 'MOV C,M' },
    { hex: '4F', mnemonic: 'MOV C,A' },
    { hex: '50', mnemonic: 'MOV D,B' },
    { hex: '51', mnemonic: 'MOV D,C' },
    { hex: '52', mnemonic: 'MOV D,D' },
    { hex: '53', mnemonic: 'MOV D,E' },
    { hex: '54', mnemonic: 'MOV D,H' },
    { hex: '55', mnemonic: 'MOV D,L' },
    { hex: '56', mnemonic: 'MOV D,M' },
    { hex: '57', mnemonic: 'MOV D,A' },
    { hex: '58', mnemonic: 'MOV E,B' },
    { hex: '59', mnemonic: 'MOV E,C' },
    { hex: '5A', mnemonic: 'MOV E,D' },
    { hex: '5B', mnemonic: 'MOV E,E' },
    { hex: '5C', mnemonic: 'MOV E,H' },
    { hex: '5D', mnemonic: 'MOV E,L' },
    { hex: '5E', mnemonic: 'MOV E,M' },
    { hex: '5F', mnemonic: 'MOV E,A' },
    { hex: '60', mnemonic: 'MOV H,B' },
    { hex: '61', mnemonic: 'MOV H,C' },
    { hex: '62', mnemonic: 'MOV H,D' },
    { hex: '63', mnemonic: 'MOV H,E' },
    { hex: '64', mnemonic: 'MOV H,H' },
    { hex: '65', mnemonic: 'MOV H,L' },
    { hex: '66', mnemonic: 'MOV H,M' },
    { hex: '67', mnemonic: 'MOV H,A' },
    { hex: '68', mnemonic: 'MOV L,B' },
    { hex: '69', mnemonic: 'MOV L,C' },
    { hex: '6A', mnemonic: 'MOV L,D' },
    { hex: '6B', mnemonic: 'MOV L,E' },
    { hex: '6C', mnemonic: 'MOV L,H' },
    { hex: '6D', mnemonic: 'MOV L,L' },
    { hex: '6E', mnemonic: 'MOV L,M' },
    { hex: '6F', mnemonic: 'MOV L,A' },
    { hex: '70', mnemonic: 'MOV M,B' },
    { hex: '71', mnemonic: 'MOV M,C' },
    { hex: '72', mnemonic: 'MOV M,D' },
    { hex: '73', mnemonic: 'MOV M,E' },
    { hex: '74', mnemonic: 'MOV M,H' },
    { hex: '75', mnemonic: 'MOV M,L' },
    { hex: '76', mnemonic: 'HLT' },
    { hex: '77', mnemonic: 'MOV M,A' },
    { hex: '78', mnemonic: 'MOV A,B' },
    { hex: '79', mnemonic: 'MOV A,C' },
    { hex: '7A', mnemonic: 'MOV A,D' },
    { hex: '7B', mnemonic: 'MOV A,E' },
    { hex: '7C', mnemonic: 'MOV A,H' },
    { hex: '7D', mnemonic: 'MOV A,L' },
    { hex: '7E', mnemonic: 'MOV A,M' },
    { hex: '7F', mnemonic: 'MOV A,A' },

    // Arithmetic Group (continued)
    { hex: '80', mnemonic: 'ADD B' },
    { hex: '81', mnemonic: 'ADD C' },
    { hex: '82', mnemonic: 'ADD D' },
    { hex: '83', mnemonic: 'ADD E' },
    { hex: '84', mnemonic: 'ADD H' },
    { hex: '85', mnemonic: 'ADD L' },
    { hex: '86', mnemonic: 'ADD M' },
    { hex: '87', mnemonic: 'ADD A' },
    { hex: '88', mnemonic: 'ADC B' },
    { hex: '89', mnemonic: 'ADC C' },
    { hex: '8A', mnemonic: 'ADC D' },
    { hex: '8B', mnemonic: 'ADC E' },
    { hex: '8C', mnemonic: 'ADC H' },
    { hex: '8D', mnemonic: 'ADC L' },
    { hex: '8E', mnemonic: 'ADC M' },
    { hex: '8F', mnemonic: 'ADC A' },
    { hex: '90', mnemonic: 'SUB B' },
    { hex: '91', mnemonic: 'SUB C' },
    { hex: '92', mnemonic: 'SUB D' },
    { hex: '93', mnemonic: 'SUB E' },
    { hex: '94', mnemonic: 'SUB H' },
    { hex: '95', mnemonic: 'SUB L' },
    { hex: '96', mnemonic: 'SUB M' },
    { hex: '97', mnemonic: 'SUB A' },
    { hex: '98', mnemonic: 'SBB B' },
    { hex: '99', mnemonic: 'SBB C' },
    { hex: '9A', mnemonic: 'SBB D' },
    { hex: '9B', mnemonic: 'SBB E' },
    { hex: '9C', mnemonic: 'SBB H' },
    { hex: '9D', mnemonic: 'SBB L' },
    { hex: '9E', mnemonic: 'SBB M' },
    { hex: '9F', mnemonic: 'SBB A' },

    // Logical Group
    { hex: 'A0', mnemonic: 'ANA B' },
    { hex: 'A1', mnemonic: 'ANA C' },
    { hex: 'A2', mnemonic: 'ANA D' },
    { hex: 'A3', mnemonic: 'ANA E' },
    { hex: 'A4', mnemonic: 'ANA H' },
    { hex: 'A5', mnemonic: 'ANA L' },
    { hex: 'A6', mnemonic: 'ANA M' },
    { hex: 'A7', mnemonic: 'ANA A' },
    { hex: 'A8', mnemonic: 'XRA B' },
    { hex: 'A9', mnemonic: 'XRA C' },
    { hex: 'AA', mnemonic: 'XRA D' },
    { hex: 'AB', mnemonic: 'XRA E' },
    { hex: 'AC', mnemonic: 'XRA H' },
    { hex: 'AD', mnemonic: 'XRA L' },
    { hex: 'AE', mnemonic: 'XRA M' },
    { hex: 'AF', mnemonic: 'XRA A' },
    { hex: 'B0', mnemonic: 'ORA B' },
    { hex: 'B1', mnemonic: 'ORA C' },
    { hex: 'B2', mnemonic: 'ORA D' },
    { hex: 'B3', mnemonic: 'ORA E' },
    { hex: 'B4', mnemonic: 'ORA H' },
    { hex: 'B5', mnemonic: 'ORA L' },
    { hex: 'B6', mnemonic: 'ORA M' },
    { hex: 'B7', mnemonic: 'ORA A' },
    { hex: 'B8', mnemonic: 'CMP B' },
    { hex: 'B9', mnemonic: 'CMP C' },
    { hex: 'BA', mnemonic: 'CMP D' },
    { hex: 'BB', mnemonic: 'CMP E' },
    { hex: 'BC', mnemonic: 'CMP H' },
    { hex: 'BD', mnemonic: 'CMP L' },
    { hex: 'BE', mnemonic: 'CMP M' },
    { hex: 'BF', mnemonic: 'CMP A' },

    // Branch Group
    { hex: 'C0', mnemonic: 'RNZ' },
    { hex: 'C1', mnemonic: 'POP B' },
    { hex: 'C2', mnemonic: 'JNZ' },
    { hex: 'C3', mnemonic: 'JMP' },
    { hex: 'C4', mnemonic: 'CNZ' },
    { hex: 'C5', mnemonic: 'PUSH B' },
    { hex: 'C6', mnemonic: 'ADI' },
    { hex: 'C7', mnemonic: 'RST 0' },
    { hex: 'C8', mnemonic: 'RZ' },
    { hex: 'C9', mnemonic: 'RET' },
    { hex: 'CA', mnemonic: 'JZ' },
    { hex: 'CB', mnemonic: 'NOP' },
    { hex: 'CC', mnemonic: 'CZ' },
    { hex: 'CD', mnemonic: 'CALL' },
    { hex: 'CE', mnemonic: 'ACI' },
    { hex: 'CF', mnemonic: 'RST 1' },
    { hex: 'D0', mnemonic: 'RNC' },
    { hex: 'D1', mnemonic: 'POP D' },
    { hex: 'D2', mnemonic: 'JNC' },
    { hex: 'D3', mnemonic: 'OUT' },
    { hex: 'D4', mnemonic: 'CNC' },
    { hex: 'D5', mnemonic: 'PUSH D' },
    { hex: 'D6', mnemonic: 'SUI' },
    { hex: 'D7', mnemonic: 'RST 2' },
    { hex: 'D8', mnemonic: 'RC' },
    { hex: 'D9', mnemonic: 'NOP' },
    { hex: 'DA', mnemonic: 'JC' },
    { hex: 'DB', mnemonic: 'IN' },
    { hex: 'DC', mnemonic: 'CC' },
    { hex: 'DD', mnemonic: 'NOP' },
    { hex: 'DE', mnemonic: 'SBI' },
    { hex: 'DF', mnemonic: 'RST 3' },
    { hex: 'E0', mnemonic: 'RPO' },
    { hex: 'E1', mnemonic: 'POP H' },
    { hex: 'E2', mnemonic: 'JPO' },
    { hex: 'E3', mnemonic: 'XTHL' },
    { hex: 'E4', mnemonic: 'CPO' },
    { hex: 'E5', mnemonic: 'PUSH H' },
    { hex: 'E6', mnemonic: 'ANI' },
    { hex: 'E7', mnemonic: 'RST 4' },
    { hex: 'E8', mnemonic: 'RPE' },
    { hex: 'E9', mnemonic: 'PCHL' },
    { hex: 'EA', mnemonic: 'JPE' },
    { hex: 'EB', mnemonic: 'XCHG' },
    { hex: 'EC', mnemonic: 'CPE' },
    { hex: 'ED', mnemonic: 'NOP' },
    { hex: 'EE', mnemonic: 'XRI' },
    { hex: 'EF', mnemonic: 'RST 5' },
    { hex: 'F0', mnemonic: 'RP' },
    { hex: 'F1', mnemonic: 'POP PSW' },
    { hex: 'F2', mnemonic: 'JP' },
    { hex: 'F3', mnemonic: 'DI' },
    { hex: 'F4', mnemonic: 'CP' },
    { hex: 'F5', mnemonic: 'PUSH PSW' },
    { hex: 'F6', mnemonic: 'ORI' },
    { hex: 'F7', mnemonic: 'RST 6' },
    { hex: 'F8', mnemonic: 'RM' },
    { hex: 'F9', mnemonic: 'SPHL' },
    { hex: 'FA', mnemonic: 'JM' },
    { hex: 'FB', mnemonic: 'EI' },
    { hex: 'FC', mnemonic: 'CM' },
    { hex: 'FD', mnemonic: 'NOP' },
    { hex: 'FE', mnemonic: 'CPI' },
    { hex: 'FF', mnemonic: 'RST 7' }
  ];

  return (
    <div className="min-h-screen bg-[#2D2D2D] text-gray-100 p-4 flex flex-col items-center font-sans">
      <header className="mb-6 text-center relative w-full max-w-4xl flex justify-center items-center">
        <div className="absolute left-0 top-1/2 -translate-y-1/2">
          <button
            onClick={() => setShowShortcuts(true)}
            className="bg-gray-700 hover:bg-gray-600 text-orange-400 px-3 py-1 rounded-lg shadow-md transition-colors duration-200 flex items-center gap-2"
            title="Keyboard Shortcuts"
          >
            <span className="text-sm">⌨️</span>
            <span className="text-sm hidden sm:inline">Shortcuts</span>
          </button>
        </div>
        <h1 className="text-4xl font-bold text-orange-400 font-['Orbitron',sans-serif] mx-auto">8085 Microprocessor Simulator</h1>
        <div className="absolute right-0 top-1/2 -translate-y-1/2">
          <button
            onClick={() => setShowInstructions(true)}
            className="bg-gray-700 hover:bg-gray-600 text-orange-400 px-3 py-1 rounded-lg shadow-md transition-colors duration-200 flex items-center gap-2"
            title="8085 Instruction Set"
          >
            <span className="text-sm">📖</span>
            <span className="text-sm hidden sm:inline">Instructions</span>
          </button>
        </div>
      </header>

      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Left Column: Display and Keypad */}
        <div className="md:col-span-2 space-y-4">
          <DisplayPanel
            address={currentExamAddress}
            data={mode === InteractionMode.EXAM_MEM_DATA_VIEW ? cpu.memory[currentExamAddress] : currentDataDisplay}
            flags={cpuState.flags}
            inputBuffer={inputBuffer}
            isAddressInputActive={mode === InteractionMode.EXAM_MEM_ADDR_INPUT || mode === InteractionMode.GO_ADDR_INPUT}
          />
          <Keypad onKeyPress={handleKeyPress} />
          <ControlPanel 
            onReset={handleReset} 
            onExecuteStep={handleExecuteStep} 
            isRunning={isRunning}
            onStop={stopExecution}
          />
        </div>

        {/* Right Column: Registers and Memory */}
        <div className="space-y-4">
          <RegisterView registers={cpuState.registers} />
          <MemoryView 
            memory={cpuState.memory} 
            currentAddress={currentExamAddress}
            startAddressView={memoryViewStartAddress}
            onSetStartAddressView={setMemoryViewStartAddress}
          />
        </div>
      </div>
      
      {/* Status message area */}
      <div className="mt-4 p-2 bg-gray-700 rounded w-full max-w-4xl text-center text-sm font-digital">
        STATUS: {isRunning ? `RUNNING FROM ${toHexString(cpuState.registers.PC, 4)}` : cpuState.halted ? 'HALTED' : InteractionMode[mode]} | 
        ADDR_BUF: {inputBuffer && (mode === InteractionMode.EXAM_MEM_ADDR_INPUT || mode === InteractionMode.GO_ADDR_INPUT) ? inputBuffer : '--'} | 
        DATA_BUF: {inputBuffer && mode === InteractionMode.EXAM_MEM_DATA_VIEW ? inputBuffer : '--'}
      </div>

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full mx-4 relative">
            <button
              onClick={() => setShowShortcuts(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              ✕
            </button>
            <h2 className="text-xl font-bold mb-4 text-orange-400">Keyboard Shortcuts</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Hex Values:</span>
                <span className="font-digital bg-gray-700 px-2 py-1 rounded">0-9, A-F</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Examine Memory:</span>
                <span className="font-digital bg-gray-700 px-2 py-1 rounded">M</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Store Data:</span>
                <span className="font-digital bg-gray-700 px-2 py-1 rounded">W</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Next Address:</span>
                <span className="font-digital bg-gray-700 px-2 py-1 rounded">N</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Previous Address:</span>
                <span className="font-digital bg-gray-700 px-2 py-1 rounded">V</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Execute (GO):</span>
                <span className="font-digital bg-gray-700 px-2 py-1 rounded">G</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Reset:</span>
                <span className="font-digital bg-gray-700 px-2 py-1 rounded">R</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Execute Step:</span>
                <span className="font-digital bg-gray-700 px-2 py-1 rounded">X</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Instruction Set Modal */}
      {showInstructions && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 p-6 rounded-lg shadow-xl max-w-4xl w-full relative font-sans">
            <button
              onClick={() => setShowInstructions(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl"
            >
              ✕
            </button>
            
            {/* Tabs */}
            <div className="flex space-x-4 mb-6 border-b border-gray-700">
              <button
                onClick={() => setActiveTab('instructions')}
                className={`pb-2 px-4 ${activeTab === 'instructions' ? 'text-orange-400 border-b-2 border-orange-400' : 'text-gray-400'}`}
              >
                Instruction Set
              </button>
              <button
                onClick={() => setActiveTab('guide')}
                className={`pb-2 px-4 ${activeTab === 'guide' ? 'text-orange-400 border-b-2 border-orange-400' : 'text-gray-400'}`}
              >
                Getting Started
              </button>
            </div>

            {/* Instruction Set Tab */}
            {activeTab === 'instructions' && (
              <>
                <h2 className="text-2xl font-bold mb-6 text-orange-400 text-center">8085 Instruction Set</h2>
                <div className="max-h-[60vh] overflow-y-auto pr-2">
                  <table className="w-full text-sm table-fixed">
                    <thead className="sticky top-0 bg-gray-800">
                      <tr className="border-b border-gray-600">
                        <th className="p-2 text-left text-gray-300 font-semibold w-1/4">Hex</th>
                        <th className="p-2 text-left text-gray-300 font-semibold w-1/4">Mnemonic</th>
                        <th className="p-2 text-left text-gray-300 font-semibold w-1/4">Hex</th>
                        <th className="p-2 text-left text-gray-300 font-semibold w-1/4">Mnemonic</th>
                      </tr>
                    </thead>
                    <tbody className="font-digital">
                      {instructionSet.reduce((rows, key, index) => (index % 2 === 0 ? rows.push([key]) : rows[rows.length-1].push(key)) && rows, [] as Array<Array<{hex: string, mnemonic: string}>>)
                        .reduce((acc, pair, index) => {
                          if (index % 2 === 0) {
                            acc.push([pair[0], pair[1]]);
                          } else {
                            acc[acc.length - 1].push(pair[0], pair[1]);
                          }
                          return acc;
                        }, [] as Array<Array<{hex: string, mnemonic: string} | undefined>>)
                        .map((rowItems, rowIndex) => (
                        <tr key={rowIndex} className="border-b border-gray-700 hover:bg-gray-700">
                          <td className="p-2 text-green-400">{rowItems[0]?.hex}</td>
                          <td className="p-2 text-sky-300">{rowItems[0]?.mnemonic}</td>
                          <td className="p-2 text-green-400">{rowItems[1]?.hex}</td>
                          <td className="p-2 text-sky-300">{rowItems[1]?.mnemonic}</td>
                          <td className="p-2 text-green-400">{rowItems[2]?.hex}</td>
                          <td className="p-2 text-sky-300">{rowItems[2]?.mnemonic}</td>
                          <td className="p-2 text-green-400">{rowItems[3]?.hex}</td>
                          <td className="p-2 text-sky-300">{rowItems[3]?.mnemonic}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Getting Started Tab */}
            {activeTab === 'guide' && (
              <div className="max-h-[70vh] overflow-y-auto pr-2">
                <h2 className="text-2xl font-bold mb-6 text-orange-400 text-center">Getting Started Guide</h2>
                
                <div className="space-y-6 text-gray-300">
                  <section>
                    <h3 className="text-xl font-semibold text-orange-400 mb-2">Understanding the Interface</h3>
                    <p className="mb-4">The simulator interface consists of several key components:</p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li><span className="text-orange-400">Display Panel:</span> Shows the current address and data in hex format, along with status flags (S, Z, AC, P, CY)</li>
                      <li><span className="text-orange-400">Keypad:</span> Used for entering hex values (0-F) and control commands</li>
                      <li><span className="text-orange-400">Control Panel:</span> Contains RESET and EXEC STEP buttons</li>
                      <li><span className="text-orange-400">Register View:</span> Shows the current state of all registers</li>
                      <li><span className="text-orange-400">Memory View:</span> Displays the contents of memory locations</li>
                    </ul>
                  </section>

                  <section>
                    <h3 className="text-xl font-semibold text-orange-400 mb-2">Basic Operations</h3>
                    <ul className="list-disc pl-6 space-y-2">
                      <li><span className="text-orange-400">Examine Memory (M):</span> Enter an address to view its contents</li>
                      <li><span className="text-orange-400">Store Data (W):</span> Write data to the current memory location</li>
                      <li><span className="text-orange-400">Next/Previous (N/V):</span> Navigate through memory locations</li>
                      <li><span className="text-orange-400">Execute (G):</span> Run the program from a specified address</li>
                      <li><span className="text-orange-400">Reset (R):</span> Reset the processor state</li>
                    </ul>
                  </section>

                  <section>
                    <h3 className="text-xl font-semibold text-orange-400 mb-2">Sample Program: Adding Two Numbers</h3>
                    <p className="mb-2">Let's write a simple program to add two numbers (25H + 35H):</p>
                    <div className="bg-gray-900 p-4 rounded font-digital text-sm space-y-2">
                      <p>MVI A, 25H    ; Load 25H into accumulator</p>
                      <p>MVI B, 35H    ; Load 35H into register B</p>
                      <p>ADD B        ; Add B to A</p>
                      <p>HLT          ; Halt the program</p>
                    </div>
                    <p className="mt-4">To enter this program:</p>
                    <ol className="list-decimal pl-6 space-y-2">
                      <li>Press M and enter 2000H (program start address)</li>
                      <li>Enter 3E (MVI A opcode)</li>
                      <li>Press W to store</li>
                      <li>Press N to go to next address</li>
                      <li>Enter 25 (data)</li>
                      <li>Press W to store</li>
                      <li>Continue with remaining instructions...</li>
                    </ol>
                  </section>

                  <section>
                    <h3 className="text-xl font-semibold text-orange-400 mb-2">Video Tutorial</h3>
                    <p className="mb-4">Watch this video for a detailed explanation of the 8085 microprocessor and its programming:</p>
                    <div className="aspect-w-16 aspect-h-9">
                      <iframe
                        src="https://www.youtube.com/embed/Q4SOjf0Cn4w"
                        title="8085 Microprocessor Tutorial"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="w-full h-64 rounded"
                      ></iframe>
                    </div>
                  </section>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
    