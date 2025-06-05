
export interface Registers {
  A: number; // Accumulator (8-bit)
  B: number;
  C: number;
  D: number;
  E: number;
  H: number;
  L: number;
  SP: number; // Stack Pointer (16-bit)
  PC: number; // Program Counter (16-bit)
}

export interface Flags {
  S: boolean;  // Sign
  Z: boolean;  // Zero
  AC: boolean; // Auxiliary Carry
  P: boolean;  // Parity
  CY: boolean; // Carry
}

export interface CPUState {
  registers: Registers;
  flags: Flags;
  memory: Uint8Array;
  halted: boolean;
  ioPorts: Uint8Array; // Simplified I/O ports
}

export enum InteractionMode {
  IDLE,
  EXAM_MEM_ADDR_INPUT,
  EXAM_MEM_DATA_VIEW, // Address set, data displayed, can input new data
  GO_ADDR_INPUT,
  RUNNING,
}

export type RegisterName = keyof Registers;
export type FlagName = keyof Flags;
    