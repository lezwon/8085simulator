import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CPU8085 } from './services/8085';
import { CPUState, InteractionMode, Registers, Flags } from './types';
import { toHexString } from './utils/formatters';
import DisplayPanel from './components/DisplayPanel';
import Keypad from './components/Keypad';
import RegisterView from './components/RegisterView';
import MemoryView from './components/MemoryView';
import ControlPanel from './components/ControlPanel';
import instructionSet from './data/instructions.json';

interface Instruction {
  hex: string;
  mnemonic: string;
  description?: string;
}

interface InstructionGroup {
  group: string;
  instructions: Instruction[];
}

interface InstructionSet {
  instructions: InstructionGroup[];
}

const { instructions } = instructionSet as InstructionSet;

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
  const [searchTerm, setSearchTerm] = useState('');

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

  return (
    <div className="min-h-screen bg-[#2D2D2D] text-gray-100 p-4 flex flex-col items-center font-sans">
      <header className="mb-6 w-full max-w-4xl flex flex-col sm:flex-row items-center sm:justify-between gap-4 px-2">
        <h1 className="text-3xl sm:text-4xl font-bold text-orange-400 font-['Orbitron',sans-serif] text-center flex-1">8085 Microprocessor Simulator</h1>
        <div className="flex flex-row gap-2 w-full sm:w-auto justify-center sm:justify-end">
          <button
            onClick={() => setShowShortcuts(true)}
            className="hidden sm:flex bg-gray-700 hover:bg-gray-600 text-orange-400 px-3 py-2 rounded-lg shadow-md transition-colors duration-200 items-center gap-2 text-base sm:text-sm w-full sm:w-auto"
            title="Keyboard Shortcuts"
          >
            <span className="text-lg sm:text-sm">⌨️</span>
            <span>Shortcuts</span>
          </button>
          <button
            onClick={() => setShowInstructions(true)}
            className="bg-gray-700 hover:bg-gray-600 text-orange-400 px-3 py-2 rounded-lg shadow-md transition-colors duration-200 flex flex-row items-center justify-center gap-2 text-base sm:text-sm w-full sm:w-auto"
            title="8085 Instruction Set"
          >
            <span className="text-lg sm:text-sm">📖</span>
            <span>Instructions</span>
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
        <div className="hidden sm:flex fixed inset-0 bg-black bg-opacity-70 items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-gray-800 w-full h-full sm:max-w-md sm:h-auto p-6 rounded-none sm:rounded-lg shadow-xl relative overflow-y-auto flex flex-col">
            <button
              onClick={() => setShowShortcuts(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-3xl sm:text-xl"
              aria-label="Close Shortcuts"
            >
              ✕
            </button>
            <h2 className="text-xl font-bold mb-4 text-orange-400">Keyboard Shortcuts</h2>
            <div className="space-y-3 text-base sm:text-sm">
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
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-gray-800 w-full h-full sm:w-auto sm:h-auto sm:max-w-4xl sm:max-h-[90vh] p-4 sm:p-6 rounded-none sm:rounded-lg shadow-xl relative font-sans flex flex-col overflow-y-auto">
            <button
              onClick={() => setShowInstructions(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-3xl sm:text-2xl"
              aria-label="Close Instructions"
            >
              ✕
            </button>
            <div className="flex space-x-4 mb-4 border-b border-gray-700">
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
              <div className="space-y-8 flex-1 overflow-y-auto">
                <div className="sticky top-0 bg-gray-800 pb-4 z-10">
                  <input
                    type="text"
                    placeholder="Search by hex, mnemonic, or description..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full p-2 rounded bg-gray-700 text-gray-100 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
                {searchTerm.trim() ? (
                  <table className="w-full text-base sm:text-sm table-fixed border border-gray-600 bg-gray-900 rounded">
                    <thead className="bg-gray-800">
                      <tr>
                        <th className="p-2 text-left text-gray-300 font-semibold w-1/6 border-b border-gray-700">Hex</th>
                        <th className="p-2 text-left text-gray-300 font-semibold w-1/6 border-b border-gray-700">Mnemonic</th>
                        <th className="p-2 text-left text-gray-300 font-semibold w-2/3 border-b border-gray-700">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {instructions.flatMap(group => group.instructions).filter(instr =>
                        instr.hex.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        instr.mnemonic.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (instr.description && instr.description.toLowerCase().includes(searchTerm.toLowerCase()))
                      ).map((instruction, idx) => (
                        <tr key={idx} className="border-b border-gray-800 hover:bg-gray-700">
                          <td className="p-2 text-green-400 font-mono">{instruction.hex}</td>
                          <td className="p-2 text-sky-300">{instruction.mnemonic}</td>
                          <td className="p-2 text-gray-200">{instruction.description || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  instructions.map((group: InstructionGroup, index: number) => (
                    <div key={index} className="space-y-2">
                      <h3 className="text-lg font-semibold text-blue-600 mb-2">{group.group}</h3>
                      <table className="w-full text-base sm:text-sm table-fixed border border-gray-600 bg-gray-900 rounded">
                        <thead className="bg-gray-800">
                          <tr>
                            <th className="p-2 text-left text-gray-300 font-semibold w-1/6 border-b border-gray-700">Hex</th>
                            <th className="p-2 text-left text-gray-300 font-semibold w-1/6 border-b border-gray-700">Mnemonic</th>
                            <th className="p-2 text-left text-gray-300 font-semibold w-2/3 border-b border-gray-700">Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.instructions.map((instruction: Instruction, idx: number) => (
                            <tr key={idx} className="border-b border-gray-800 hover:bg-gray-700">
                              <td className="p-2 text-green-400 font-mono">{instruction.hex}</td>
                              <td className="p-2 text-sky-300">{instruction.mnemonic}</td>
                              <td className="p-2 text-gray-200">{instruction.description || ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))
                )}
              </div>
            )}
            {/* Getting Started Tab */}
            {activeTab === 'guide' && (
              <div className="flex-1 overflow-y-auto">
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
    