
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

  return (
    <div className="min-h-screen bg-[#2D2D2D] text-gray-100 p-4 flex flex-col items-center font-sans">
      <header className="mb-6 text-center">
        <h1 className="text-4xl font-bold text-orange-400 font-['Orbitron',sans-serif]">8085 Microprocessor Simulator</h1>
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
      
      {/* Simple status message area */}
      <div className="mt-4 p-2 bg-gray-700 rounded w-full max-w-4xl text-center text-sm font-digital">
        STATUS: {isRunning ? `RUNNING FROM ${toHexString(cpuState.registers.PC, 4)}` : cpuState.halted ? 'HALTED' : InteractionMode[mode]} | 
        ADDR_BUF: {inputBuffer && (mode === InteractionMode.EXAM_MEM_ADDR_INPUT || mode === InteractionMode.GO_ADDR_INPUT) ? inputBuffer : '--'} | 
        DATA_BUF: {inputBuffer && mode === InteractionMode.EXAM_MEM_DATA_VIEW ? inputBuffer : '--'}
      </div>
    </div>
  );
};

export default App;
    