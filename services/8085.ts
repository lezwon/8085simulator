
import { Registers, Flags, CPUState } from '../types';

export class CPU8085 {
  public registers: Registers;
  public flags: Flags;
  public memory: Uint8Array;
  public halted: boolean;
  public ioPorts: Uint8Array; // 256 I/O ports

  constructor() {
    this.memory = new Uint8Array(65536); // 64KB
    this.ioPorts = new Uint8Array(256);
    this.reset();
  }

  public reset(): void {
    this.registers = { A: 0, B: 0, C: 0, D: 0, E: 0, H: 0, L: 0, SP: 0xFFFE, PC: 0x0000 };
    this.flags = { S: false, Z: true, AC: false, P: true, CY: false }; // Initial Z=1, P=1 for 0
    this.halted = false;
    // Optionally clear memory or part of it. For now, it persists.
    // this.memory.fill(0); 
  }

  public getState(): CPUState {
    return {
        registers: { ...this.registers },
        flags: { ...this.flags },
        memory: this.memory, // Return reference for performance in UI, ensure UI doesn't mutate directly
        halted: this.halted,
        ioPorts: this.ioPorts,
    };
  }

  private readByte(address: number): number {
    return this.memory[address & 0xFFFF];
  }

  public writeByte(address: number, value: number): void {
    this.memory[address & 0xFFFF] = value & 0xFF;
  }

  private readWord(address: number): number {
    const low = this.readByte(address);
    const high = this.readByte(address + 1);
    return (high << 8) | low;
  }

  private writeWord(address: number, value: number): void {
    this.writeByte(address, value & 0xFF);
    this.writeByte(address + 1, (value >> 8) & 0xFF);
  }

  private getHL(): number {
    return (this.registers.H << 8) | this.registers.L;
  }

  private setHL(value: number): void {
    this.registers.H = (value >> 8) & 0xFF;
    this.registers.L = value & 0xFF;
  }

  private getBC(): number {
    return (this.registers.B << 8) | this.registers.C;
  }

  private setBC(value: number): void {
    this.registers.B = (value >> 8) & 0xFF;
    this.registers.C = value & 0xFF;
  }
  
  private getDE(): number {
    return (this.registers.D << 8) | this.registers.E;
  }

  private setDE(value: number): void {
    this.registers.D = (value >> 8) & 0xFF;
    this.registers.E = value & 0xFF;
  }


  private updateZSPFlags(value: number): void {
    const val = value & 0xFF;
    this.flags.S = (val & 0x80) !== 0;
    this.flags.Z = val === 0;
    let parityCount = 0;
    for (let i = 0; i < 8; i++) {
      if ((val >> i) & 1) parityCount++;
    }
    this.flags.P = (parityCount % 2) === 0;
  }

  private add8bit(val1: number, val2: number, carryIn: boolean = false): number {
    const c = carryIn ? 1 : 0;
    const unmaskedResult = (val1 & 0xFF) + (val2 & 0xFF) + c;
    const result = unmaskedResult & 0xFF;

    this.flags.CY = unmaskedResult > 0xFF;
    this.flags.AC = (((val1 & 0x0F) + (val2 & 0x0F) + c) & 0x10) !== 0;
    this.updateZSPFlags(result);
    return result;
  }
  
  private sub8bit(val1: number, val2: number, borrowIn: boolean = false): number {
    const b = borrowIn ? 1 : 0;
    // Subtraction is adding the 2's complement: val1 + (~val2 + 1) - b
    // Or directly: val1 - val2 - b
    const unmaskedResult = (val1 & 0xFF) - (val2 & 0xFF) - b;
    const result = unmaskedResult & 0xFF;

    this.flags.CY = unmaskedResult < 0; // Borrow out
     // AC: borrow from bit 4 to bit 3
    this.flags.AC = (((val1 & 0x0F) - (val2 & 0x0F) - b) & 0x10) !== 0; // Check if this is standard way
    this.updateZSPFlags(result);
    return result;
  }

  private dad(val: number): void {
    const hl = this.getHL();
    const result = hl + val;
    this.flags.CY = result > 0xFFFF;
    this.setHL(result & 0xFFFF);
  }

  private pushWord(value: number): void {
    this.registers.SP = (this.registers.SP - 1) & 0xFFFF;
    this.writeByte(this.registers.SP, (value >> 8) & 0xFF); // High byte
    this.registers.SP = (this.registers.SP - 1) & 0xFFFF;
    this.writeByte(this.registers.SP, value & 0xFF); // Low byte
  }

  private popWord(): number {
    const low = this.readByte(this.registers.SP);
    this.registers.SP = (this.registers.SP + 1) & 0xFFFF;
    const high = this.readByte(this.registers.SP);
    this.registers.SP = (this.registers.SP + 1) & 0xFFFF;
    return (high << 8) | low;
  }
  
  private getPSW(): number {
    let pswFlags = 0;
    if (this.flags.S) pswFlags |= 0x80;
    if (this.flags.Z) pswFlags |= 0x40;
    // Bit 5 is always 0
    if (this.flags.AC) pswFlags |= 0x10;
    // Bit 3 is always 0
    if (this.flags.P) pswFlags |= 0x04;
    // Bit 1 is always 1
    pswFlags |= 0x02;
    if (this.flags.CY) pswFlags |= 0x01;
    return (this.registers.A << 8) | pswFlags;
  }

  private setPSW(value: number): void {
    this.registers.A = (value >> 8) & 0xFF;
    const pswFlags = value & 0xFF;
    this.flags.S  = (pswFlags & 0x80) !== 0;
    this.flags.Z  = (pswFlags & 0x40) !== 0;
    this.flags.AC = (pswFlags & 0x10) !== 0;
    this.flags.P  = (pswFlags & 0x04) !== 0;
    this.flags.CY = (pswFlags & 0x01) !== 0;
  }


  public step(): void {
    if (this.halted) return;

    const opcode = this.readByte(this.registers.PC);
    this.registers.PC = (this.registers.PC + 1) & 0xFFFF;
    
    // For debugging
    // console.log(`PC: ${toHexString(this.registers.PC-1, 4)}, Opcode: ${toHexString(opcode, 2)}`);

    this.executeInstruction(opcode);
  }

  private executeInstruction(opcode: number): void {
    let tempAddr: number;
    let tempVal: number;
    let condition: boolean;

    switch (opcode) {
      // NOP
      case 0x00: break;

      // LXI
      case 0x01: tempVal = this.readWord(this.registers.PC); this.setBC(tempVal); this.registers.PC = (this.registers.PC + 2) & 0xFFFF; break; // LXI B, D16
      case 0x11: tempVal = this.readWord(this.registers.PC); this.setDE(tempVal); this.registers.PC = (this.registers.PC + 2) & 0xFFFF; break; // LXI D, D16
      case 0x21: tempVal = this.readWord(this.registers.PC); this.setHL(tempVal); this.registers.PC = (this.registers.PC + 2) & 0xFFFF; break; // LXI H, D16
      case 0x31: this.registers.SP = this.readWord(this.registers.PC); this.registers.PC = (this.registers.PC + 2) & 0xFFFF; break; // LXI SP, D16

      // STA, LDA
      case 0x32: tempAddr = this.readWord(this.registers.PC); this.writeByte(tempAddr, this.registers.A); this.registers.PC = (this.registers.PC + 2) & 0xFFFF; break; // STA addr
      case 0x3A: tempAddr = this.readWord(this.registers.PC); this.registers.A = this.readByte(tempAddr); this.registers.PC = (this.registers.PC + 2) & 0xFFFF; break; // LDA addr
      
      // MVI R, D8
      case 0x06: this.registers.B = this.readByte(this.registers.PC); this.registers.PC = (this.registers.PC + 1) & 0xFFFF; break;
      case 0x0E: this.registers.C = this.readByte(this.registers.PC); this.registers.PC = (this.registers.PC + 1) & 0xFFFF; break;
      case 0x16: this.registers.D = this.readByte(this.registers.PC); this.registers.PC = (this.registers.PC + 1) & 0xFFFF; break;
      case 0x1E: this.registers.E = this.readByte(this.registers.PC); this.registers.PC = (this.registers.PC + 1) & 0xFFFF; break;
      case 0x26: this.registers.H = this.readByte(this.registers.PC); this.registers.PC = (this.registers.PC + 1) & 0xFFFF; break;
      case 0x2E: this.registers.L = this.readByte(this.registers.PC); this.registers.PC = (this.registers.PC + 1) & 0xFFFF; break;
      case 0x36: this.writeByte(this.getHL(), this.readByte(this.registers.PC)); this.registers.PC = (this.registers.PC + 1) & 0xFFFF; break; // MVI M, D8
      case 0x3E: this.registers.A = this.readByte(this.registers.PC); this.registers.PC = (this.registers.PC + 1) & 0xFFFF; break;

      // MOV R, R'
      // ... many MOV R,R' combinations (Generated for brevity)
      // MOV B,X
      case 0x40: /* MOV B,B */ break;
      case 0x41: this.registers.B = this.registers.C; break;
      case 0x42: this.registers.B = this.registers.D; break;
      case 0x43: this.registers.B = this.registers.E; break;
      case 0x44: this.registers.B = this.registers.H; break;
      case 0x45: this.registers.B = this.registers.L; break;
      case 0x46: this.registers.B = this.readByte(this.getHL()); break; // MOV B,M
      case 0x47: this.registers.B = this.registers.A; break;
      // MOV C,X
      case 0x48: this.registers.C = this.registers.B; break;
      case 0x49: /* MOV C,C */ break;
      case 0x4A: this.registers.C = this.registers.D; break;
      case 0x4B: this.registers.C = this.registers.E; break;
      case 0x4C: this.registers.C = this.registers.H; break;
      case 0x4D: this.registers.C = this.registers.L; break;
      case 0x4E: this.registers.C = this.readByte(this.getHL()); break; // MOV C,M
      case 0x4F: this.registers.C = this.registers.A; break;
      // MOV D,X
      case 0x50: this.registers.D = this.registers.B; break;
      case 0x51: this.registers.D = this.registers.C; break;
      case 0x52: /* MOV D,D */ break;
      case 0x53: this.registers.D = this.registers.E; break;
      case 0x54: this.registers.D = this.registers.H; break;
      case 0x55: this.registers.D = this.registers.L; break;
      case 0x56: this.registers.D = this.readByte(this.getHL()); break; // MOV D,M
      case 0x57: this.registers.D = this.registers.A; break;
      // MOV E,X
      case 0x58: this.registers.E = this.registers.B; break;
      case 0x59: this.registers.E = this.registers.C; break;
      case 0x5A: this.registers.E = this.registers.D; break;
      case 0x5B: /* MOV E,E */ break;
      case 0x5C: this.registers.E = this.registers.H; break;
      case 0x5D: this.registers.E = this.registers.L; break;
      case 0x5E: this.registers.E = this.readByte(this.getHL()); break; // MOV E,M
      case 0x5F: this.registers.E = this.registers.A; break;
      // MOV H,X
      case 0x60: this.registers.H = this.registers.B; break;
      case 0x61: this.registers.H = this.registers.C; break;
      case 0x62: this.registers.H = this.registers.D; break;
      case 0x63: this.registers.H = this.registers.E; break;
      case 0x64: /* MOV H,H */ break;
      case 0x65: this.registers.H = this.registers.L; break;
      case 0x66: this.registers.H = this.readByte(this.getHL()); break; // MOV H,M
      case 0x67: this.registers.H = this.registers.A; break;
      // MOV L,X
      case 0x68: this.registers.L = this.registers.B; break;
      case 0x69: this.registers.L = this.registers.C; break;
      case 0x6A: this.registers.L = this.registers.D; break;
      case 0x6B: this.registers.L = this.registers.E; break;
      case 0x6C: this.registers.L = this.registers.H; break;
      case 0x6D: /* MOV L,L */ break;
      case 0x6E: this.registers.L = this.readByte(this.getHL()); break; // MOV L,M
      case 0x6F: this.registers.L = this.registers.A; break;
      // MOV M,X
      case 0x70: this.writeByte(this.getHL(), this.registers.B); break; // MOV M,B
      case 0x71: this.writeByte(this.getHL(), this.registers.C); break; // MOV M,C
      case 0x72: this.writeByte(this.getHL(), this.registers.D); break; // MOV M,D
      case 0x73: this.writeByte(this.getHL(), this.registers.E); break; // MOV M,E
      case 0x74: this.writeByte(this.getHL(), this.registers.H); break; // MOV M,H
      case 0x75: this.writeByte(this.getHL(), this.registers.L); break; // MOV M,L
      // HLT (0x76) is handled below
      case 0x77: this.writeByte(this.getHL(), this.registers.A); break; // MOV M,A
      // MOV A,X
      case 0x78: this.registers.A = this.registers.B; break;
      case 0x79: this.registers.A = this.registers.C; break;
      case 0x7A: this.registers.A = this.registers.D; break;
      case 0x7B: this.registers.A = this.registers.E; break;
      case 0x7C: this.registers.A = this.registers.H; break;
      case 0x7D: this.registers.A = this.registers.L; break;
      case 0x7E: this.registers.A = this.readByte(this.getHL()); break; // MOV A,M
      case 0x7F: /* MOV A,A */ break;
      
      // HLT
      case 0x76: this.halted = true; break;

      // ADD R
      case 0x80: this.registers.A = this.add8bit(this.registers.A, this.registers.B); break; // ADD B
      case 0x81: this.registers.A = this.add8bit(this.registers.A, this.registers.C); break; // ADD C
      case 0x82: this.registers.A = this.add8bit(this.registers.A, this.registers.D); break; // ADD D
      case 0x83: this.registers.A = this.add8bit(this.registers.A, this.registers.E); break; // ADD E
      case 0x84: this.registers.A = this.add8bit(this.registers.A, this.registers.H); break; // ADD H
      case 0x85: this.registers.A = this.add8bit(this.registers.A, this.registers.L); break; // ADD L
      case 0x86: this.registers.A = this.add8bit(this.registers.A, this.readByte(this.getHL())); break; // ADD M
      case 0x87: this.registers.A = this.add8bit(this.registers.A, this.registers.A); break; // ADD A
      
      // ADC R
      case 0x88: this.registers.A = this.add8bit(this.registers.A, this.registers.B, this.flags.CY); break; // ADC B
      case 0x89: this.registers.A = this.add8bit(this.registers.A, this.registers.C, this.flags.CY); break; // ADC C
      case 0x8A: this.registers.A = this.add8bit(this.registers.A, this.registers.D, this.flags.CY); break; // ADC D
      case 0x8B: this.registers.A = this.add8bit(this.registers.A, this.registers.E, this.flags.CY); break; // ADC E
      case 0x8C: this.registers.A = this.add8bit(this.registers.A, this.registers.H, this.flags.CY); break; // ADC H
      case 0x8D: this.registers.A = this.add8bit(this.registers.A, this.registers.L, this.flags.CY); break; // ADC L
      case 0x8E: this.registers.A = this.add8bit(this.registers.A, this.readByte(this.getHL()), this.flags.CY); break; // ADC M
      case 0x8F: this.registers.A = this.add8bit(this.registers.A, this.registers.A, this.flags.CY); break; // ADC A

      // SUB R
      case 0x90: this.registers.A = this.sub8bit(this.registers.A, this.registers.B); break; // SUB B
      case 0x91: this.registers.A = this.sub8bit(this.registers.A, this.registers.C); break; // SUB C
      case 0x92: this.registers.A = this.sub8bit(this.registers.A, this.registers.D); break; // SUB D
      case 0x93: this.registers.A = this.sub8bit(this.registers.A, this.registers.E); break; // SUB E
      case 0x94: this.registers.A = this.sub8bit(this.registers.A, this.registers.H); break; // SUB H
      case 0x95: this.registers.A = this.sub8bit(this.registers.A, this.registers.L); break; // SUB L
      case 0x96: this.registers.A = this.sub8bit(this.registers.A, this.readByte(this.getHL())); break; // SUB M
      case 0x97: this.registers.A = this.sub8bit(this.registers.A, this.registers.A); break; // SUB A

      // SBB R
      case 0x98: this.registers.A = this.sub8bit(this.registers.A, this.registers.B, this.flags.CY); break; // SBB B
      case 0x99: this.registers.A = this.sub8bit(this.registers.A, this.registers.C, this.flags.CY); break; // SBB C
      case 0x9A: this.registers.A = this.sub8bit(this.registers.A, this.registers.D, this.flags.CY); break; // SBB D
      case 0x9B: this.registers.A = this.sub8bit(this.registers.A, this.registers.E, this.flags.CY); break; // SBB E
      case 0x9C: this.registers.A = this.sub8bit(this.registers.A, this.registers.H, this.flags.CY); break; // SBB H
      case 0x9D: this.registers.A = this.sub8bit(this.registers.A, this.registers.L, this.flags.CY); break; // SBB L
      case 0x9E: this.registers.A = this.sub8bit(this.registers.A, this.readByte(this.getHL()), this.flags.CY); break; // SBB M
      case 0x9F: this.registers.A = this.sub8bit(this.registers.A, this.registers.A, this.flags.CY); break; // SBB A


      // INR R (Note: Standard 8085 INR/DCR do not affect CY flag)
      // To correctly implement no CY change, we'd need to save/restore CY or use a different logic for add/sub.
      // For simplicity, current add8bit/sub8bit affect CY. If strictness is needed, this part needs rework.
      // A common way is to save CY, perform operation, then restore CY.
      case 0x04: { const oldCY = this.flags.CY; this.registers.B = this.add8bit(this.registers.B, 1); this.flags.CY = oldCY; break; } // INR B
      case 0x0C: { const oldCY = this.flags.CY; this.registers.C = this.add8bit(this.registers.C, 1); this.flags.CY = oldCY; break; } // INR C
      case 0x14: { const oldCY = this.flags.CY; this.registers.D = this.add8bit(this.registers.D, 1); this.flags.CY = oldCY; break; } // INR D
      case 0x1C: { const oldCY = this.flags.CY; this.registers.E = this.add8bit(this.registers.E, 1); this.flags.CY = oldCY; break; } // INR E
      case 0x24: { const oldCY = this.flags.CY; this.registers.H = this.add8bit(this.registers.H, 1); this.flags.CY = oldCY; break; } // INR H
      case 0x2C: { const oldCY = this.flags.CY; this.registers.L = this.add8bit(this.registers.L, 1); this.flags.CY = oldCY; break; } // INR L
      case 0x34: { const oldCY = this.flags.CY; tempVal = this.readByte(this.getHL()); tempVal = this.add8bit(tempVal, 1); this.writeByte(this.getHL(), tempVal); this.flags.CY = oldCY; break; } // INR M
      case 0x3C: { const oldCY = this.flags.CY; this.registers.A = this.add8bit(this.registers.A, 1); this.flags.CY = oldCY; break; } // INR A

      // DCR R (Note: Standard 8085 INR/DCR do not affect CY flag)
      case 0x05: { const oldCY = this.flags.CY; this.registers.B = this.sub8bit(this.registers.B, 1); this.flags.CY = oldCY; break; } // DCR B
      case 0x0D: { const oldCY = this.flags.CY; this.registers.C = this.sub8bit(this.registers.C, 1); this.flags.CY = oldCY; break; } // DCR C
      case 0x15: { const oldCY = this.flags.CY; this.registers.D = this.sub8bit(this.registers.D, 1); this.flags.CY = oldCY; break; } // DCR D
      case 0x1D: { const oldCY = this.flags.CY; this.registers.E = this.sub8bit(this.registers.E, 1); this.flags.CY = oldCY; break; } // DCR E
      case 0x25: { const oldCY = this.flags.CY; this.registers.H = this.sub8bit(this.registers.H, 1); this.flags.CY = oldCY; break; } // DCR H
      case 0x2D: { const oldCY = this.flags.CY; this.registers.L = this.sub8bit(this.registers.L, 1); this.flags.CY = oldCY; break; } // DCR L
      case 0x35: { const oldCY = this.flags.CY; tempVal = this.readByte(this.getHL()); tempVal = this.sub8bit(tempVal, 1); this.writeByte(this.getHL(), tempVal); this.flags.CY = oldCY; break; } // DCR M
      case 0x3D: { const oldCY = this.flags.CY; this.registers.A = this.sub8bit(this.registers.A, 1); this.flags.CY = oldCY; break; } // DCR A

      // ADI D8
      case 0xC6: tempVal = this.readByte(this.registers.PC); this.registers.A = this.add8bit(this.registers.A, tempVal); this.registers.PC = (this.registers.PC + 1) & 0xFFFF; break;
      // ACI D8
      case 0xCE: tempVal = this.readByte(this.registers.PC); this.registers.A = this.add8bit(this.registers.A, tempVal, this.flags.CY); this.registers.PC = (this.registers.PC + 1) & 0xFFFF; break;
      // SUI D8
      case 0xD6: tempVal = this.readByte(this.registers.PC); this.registers.A = this.sub8bit(this.registers.A, tempVal); this.registers.PC = (this.registers.PC + 1) & 0xFFFF; break;
      // SBI D8
      case 0xDE: tempVal = this.readByte(this.registers.PC); this.registers.A = this.sub8bit(this.registers.A, tempVal, this.flags.CY); this.registers.PC = (this.registers.PC + 1) & 0xFFFF; break;
      
      // JMP, Jcond
      case 0xC3: this.registers.PC = this.readWord(this.registers.PC); break; // JMP addr
      case 0xC2: condition = !this.flags.Z; tempAddr = this.readWord(this.registers.PC); if (condition) this.registers.PC = tempAddr; else this.registers.PC = (this.registers.PC + 2) & 0xFFFF; break; // JNZ addr
      case 0xCA: condition = this.flags.Z; tempAddr = this.readWord(this.registers.PC); if (condition) this.registers.PC = tempAddr; else this.registers.PC = (this.registers.PC + 2) & 0xFFFF; break; // JZ addr
      case 0xD2: condition = !this.flags.CY; tempAddr = this.readWord(this.registers.PC); if (condition) this.registers.PC = tempAddr; else this.registers.PC = (this.registers.PC + 2) & 0xFFFF; break; // JNC addr
      case 0xDA: condition = this.flags.CY; tempAddr = this.readWord(this.registers.PC); if (condition) this.registers.PC = tempAddr; else this.registers.PC = (this.registers.PC + 2) & 0xFFFF; break; // JC addr
      case 0xE2: condition = !this.flags.P; tempAddr = this.readWord(this.registers.PC); if (condition) this.registers.PC = tempAddr; else this.registers.PC = (this.registers.PC + 2) & 0xFFFF; break; // JPO addr (Parity Odd)
      case 0xEA: condition = this.flags.P; tempAddr = this.readWord(this.registers.PC); if (condition) this.registers.PC = tempAddr; else this.registers.PC = (this.registers.PC + 2) & 0xFFFF; break; // JPE addr (Parity Even)
      case 0xF2: condition = !this.flags.S; tempAddr = this.readWord(this.registers.PC); if (condition) this.registers.PC = tempAddr; else this.registers.PC = (this.registers.PC + 2) & 0xFFFF; break; // JP addr (Plus, Sign false)
      case 0xFA: condition = this.flags.S; tempAddr = this.readWord(this.registers.PC); if (condition) this.registers.PC = tempAddr; else this.registers.PC = (this.registers.PC + 2) & 0xFFFF; break; // JM addr (Minus, Sign true)


      // CALL, Ccond
      case 0xCD: tempAddr = this.readWord(this.registers.PC); this.pushWord((this.registers.PC + 2) & 0xFFFF); this.registers.PC = tempAddr; break; // CALL addr
      case 0xC4: condition = !this.flags.Z; tempAddr = this.readWord(this.registers.PC); if (condition) { this.pushWord((this.registers.PC + 2) & 0xFFFF); this.registers.PC = tempAddr; } else { this.registers.PC = (this.registers.PC + 2) & 0xFFFF; } break; // CNZ addr
      case 0xCC: condition = this.flags.Z; tempAddr = this.readWord(this.registers.PC); if (condition) { this.pushWord((this.registers.PC + 2) & 0xFFFF); this.registers.PC = tempAddr; } else { this.registers.PC = (this.registers.PC + 2) & 0xFFFF; } break; // CZ addr
      case 0xD4: condition = !this.flags.CY; tempAddr = this.readWord(this.registers.PC); if (condition) { this.pushWord((this.registers.PC + 2) & 0xFFFF); this.registers.PC = tempAddr; } else { this.registers.PC = (this.registers.PC + 2) & 0xFFFF; } break; // CNC addr
      case 0xDC: condition = this.flags.CY; tempAddr = this.readWord(this.registers.PC); if (condition) { this.pushWord((this.registers.PC + 2) & 0xFFFF); this.registers.PC = tempAddr; } else { this.registers.PC = (this.registers.PC + 2) & 0xFFFF; } break; // CC addr

      // RET, Rcond
      case 0xC9: this.registers.PC = this.popWord(); break; // RET
      case 0xC0: if (!this.flags.Z) this.registers.PC = this.popWord(); break; // RNZ
      case 0xC8: if (this.flags.Z) this.registers.PC = this.popWord(); break; // RZ
      case 0xD0: if (!this.flags.CY) this.registers.PC = this.popWord(); break; // RNC
      case 0xD8: if (this.flags.CY) this.registers.PC = this.popWord(); break; // RC
      
      // PUSH / POP
      case 0xC1: this.setBC(this.popWord()); break; // POP B
      case 0xD1: this.setDE(this.popWord()); break; // POP D
      case 0xE1: this.setHL(this.popWord()); break; // POP H
      case 0xF1: this.setPSW(this.popWord()); break; // POP PSW
      
      case 0xC5: this.pushWord(this.getBC()); break; // PUSH B
      case 0xD5: this.pushWord(this.getDE()); break; // PUSH D
      case 0xE5: this.pushWord(this.getHL()); break; // PUSH H
      case 0xF5: this.pushWord(this.getPSW()); break; // PUSH PSW

      // IN / OUT (Simplified)
      case 0xDB: tempVal = this.readByte(this.registers.PC); this.registers.A = this.ioPorts[tempVal]; this.registers.PC = (this.registers.PC + 1) & 0xFFFF; break; // IN port
      case 0xD3: tempVal = this.readByte(this.registers.PC); this.ioPorts[tempVal] = this.registers.A; this.registers.PC = (this.registers.PC + 1) & 0xFFFF; break; // OUT port

      // XCHG
      case 0xEB: {
        const tempH = this.registers.H;
        const tempL = this.registers.L;
        this.registers.H = this.registers.D;
        this.registers.L = this.registers.E;
        this.registers.D = tempH;
        this.registers.E = tempL;
        break;
      }
      // XTHL
      case 0xE3: {
        const lFromStack = this.readByte(this.registers.SP);
        const hFromStack = this.readByte(this.registers.SP + 1);
        this.writeByte(this.registers.SP, this.registers.L);
        this.writeByte(this.registers.SP + 1, this.registers.H);
        this.registers.L = lFromStack;
        this.registers.H = hFromStack;
        break;
      }
      // SPHL
      case 0xF9: this.registers.SP = this.getHL(); break;
      // PCHL
      case 0xE9: this.registers.PC = this.getHL(); break;

      // Rotates
      case 0x07: { // RLC
          const msb = (this.registers.A & 0x80) >> 7;
          this.registers.A = ((this.registers.A << 1) | msb) & 0xFF;
          this.flags.CY = msb === 1;
          break;
      }
      case 0x0F: { // RRC
          const lsb = this.registers.A & 0x01;
          this.registers.A = ((this.registers.A >> 1) | (lsb << 7)) & 0xFF;
          this.flags.CY = lsb === 1;
          break;
      }
      case 0x17: { // RAL
          const oldCY = this.flags.CY ? 1 : 0;
          this.flags.CY = (this.registers.A & 0x80) !== 0;
          this.registers.A = ((this.registers.A << 1) | oldCY) & 0xFF;
          break;
      }
      case 0x1F: { // RAR
          const oldCY = this.flags.CY ? 1 : 0;
          this.flags.CY = (this.registers.A & 0x01) !== 0;
          this.registers.A = ((this.registers.A >> 1) | (oldCY << 7)) & 0xFF;
          break;
      }

      // DAA
      case 0x27: {
        let a = this.registers.A;
        let correction = 0;
        const lsn = a & 0x0F;
        const msn = a >> 4;
        let oldCY = this.flags.CY;

        if (this.flags.AC || lsn > 9) {
            correction += 0x06;
        }
        if (this.flags.CY || msn > 9 || (msn >= 9 && lsn > 9)) {
            correction += 0x60;
            this.flags.CY = true;
        }
        
        // DAA works differently based on whether the last operation was an add or sub.
        // This simplified DAA assumes addition context. A full DAA needs to know the last operation.
        // For this simulator, we'll assume ADD context.
        this.registers.A = this.add8bit(a, correction); // Use add8bit to update Z,S,P,AC correctly based on result
        this.flags.CY = oldCY || this.flags.CY; // Preserve original carry if DAA itself didn't set it but it was already set
        break;
      }
      
      // CMA
      case 0x2F: this.registers.A = (~this.registers.A) & 0xFF; break;
      // STC
      case 0x37: this.flags.CY = true; break;
      // CMC
      case 0x3F: this.flags.CY = !this.flags.CY; break;


      // ANA R
      case 0xA0: this.registers.A &= this.registers.B; this.updateZSPFlags(this.registers.A); this.flags.CY = false; this.flags.AC = false; break;
      case 0xA1: this.registers.A &= this.registers.C; this.updateZSPFlags(this.registers.A); this.flags.CY = false; this.flags.AC = false; break;
      // ... (A2-A5 for D,E,H,L)
      case 0xA6: this.registers.A &= this.readByte(this.getHL()); this.updateZSPFlags(this.registers.A); this.flags.CY = false; this.flags.AC = false; break; // ANA M
      case 0xA7: this.registers.A &= this.registers.A; this.updateZSPFlags(this.registers.A); this.flags.CY = false; this.flags.AC = false; break; // ANA A (AC behavior varies on docs, typically set/reset based on ORing bit 3 of operands, for AND it's complex or just cleared)

      // ANI D8
      case 0xE6: tempVal = this.readByte(this.registers.PC); this.registers.A &= tempVal; this.updateZSPFlags(this.registers.A); this.flags.CY = false; this.flags.AC = false; this.registers.PC = (this.registers.PC + 1) & 0xFFFF; break;

      // XRA R
      case 0xA8: this.registers.A ^= this.registers.B; this.updateZSPFlags(this.registers.A); this.flags.CY = false; this.flags.AC = false; break;
      // ... (A9-AD for C,D,E,H,L)
      case 0xAE: this.registers.A ^= this.readByte(this.getHL()); this.updateZSPFlags(this.registers.A); this.flags.CY = false; this.flags.AC = false; break; // XRA M
      case 0xAF: this.registers.A ^= this.registers.A; this.updateZSPFlags(this.registers.A); this.flags.CY = false; this.flags.AC = false; break; // XRA A

      // XRI D8
      case 0xEE: tempVal = this.readByte(this.registers.PC); this.registers.A ^= tempVal; this.updateZSPFlags(this.registers.A); this.flags.CY = false; this.flags.AC = false; this.registers.PC = (this.registers.PC + 1) & 0xFFFF; break;

      // ORA R
      case 0xB0: this.registers.A |= this.registers.B; this.updateZSPFlags(this.registers.A); this.flags.CY = false; this.flags.AC = false; break;
      // ... (B1-B5 for C,D,E,H,L)
      case 0xB6: this.registers.A |= this.readByte(this.getHL()); this.updateZSPFlags(this.registers.A); this.flags.CY = false; this.flags.AC = false; break; // ORA M
      case 0xB7: this.registers.A |= this.registers.A; this.updateZSPFlags(this.registers.A); this.flags.CY = false; this.flags.AC = false; break; // ORA A

      // ORI D8
      case 0xF6: tempVal = this.readByte(this.registers.PC); this.registers.A |= tempVal; this.updateZSPFlags(this.registers.A); this.flags.CY = false; this.flags.AC = false; this.registers.PC = (this.registers.PC + 1) & 0xFFFF; break;

      // CMP R
      case 0xB8: this.sub8bit(this.registers.A, this.registers.B); break; // CMP B (Result discarded, flags set)
      // ... (B9-BD for C,D,E,H,L)
      case 0xBE: this.sub8bit(this.registers.A, this.readByte(this.getHL())); break; // CMP M
      case 0xBF: this.sub8bit(this.registers.A, this.registers.A); break; // CMP A

      // CPI D8
      case 0xFE: tempVal = this.readByte(this.registers.PC); this.sub8bit(this.registers.A, tempVal); this.registers.PC = (this.registers.PC + 1) & 0xFFFF; break;

      // DAD rp
      case 0x09: this.dad(this.getBC()); break; // DAD B
      case 0x19: this.dad(this.getDE()); break; // DAD D
      case 0x29: this.dad(this.getHL()); break; // DAD H
      case 0x39: this.dad(this.registers.SP); break; // DAD SP

      // INX rp, DCX rp
      case 0x03: this.setBC((this.getBC() + 1) & 0xFFFF); break; // INX B
      case 0x0B: this.setBC((this.getBC() - 1) & 0xFFFF); break; // DCX B
      case 0x13: this.setDE((this.getDE() + 1) & 0xFFFF); break; // INX D
      case 0x1B: this.setDE((this.getDE() - 1) & 0xFFFF); break; // DCX D
      case 0x23: this.setHL((this.getHL() + 1) & 0xFFFF); break; // INX H
      case 0x2B: this.setHL((this.getHL() - 1) & 0xFFFF); break; // DCX H
      case 0x33: this.registers.SP = (this.registers.SP + 1) & 0xFFFF; break; // INX SP
      case 0x3B: this.registers.SP = (this.registers.SP - 1) & 0xFFFF; break; // DCX SP
      
      // STAX, LDAX
      case 0x02: this.writeByte(this.getBC(), this.registers.A); break; // STAX B
      case 0x12: this.writeByte(this.getDE(), this.registers.A); break; // STAX D
      case 0x0A: this.registers.A = this.readByte(this.getBC()); break; // LDAX B
      case 0x1A: this.registers.A = this.readByte(this.getDE()); break; // LDAX D

      // SHLD, LHLD
      case 0x22: tempAddr = this.readWord(this.registers.PC); this.writeWord(tempAddr, this.getHL()); this.registers.PC = (this.registers.PC + 2) & 0xFFFF; break; // SHLD addr
      case 0x2A: tempAddr = this.readWord(this.registers.PC); this.setHL(this.readWord(tempAddr)); this.registers.PC = (this.registers.PC + 2) & 0xFFFF; break; // LHLD addr
      
      // EI, DI (Interrupts not fully simulated)
      case 0xFB: /* EI - Enable Interrupts */ break;
      case 0xF3: /* DI - Disable Interrupts */ break;

      // RIM, SIM (Interrupt masks and serial I/O not simulated)
      case 0x20: /* RIM */ break;
      case 0x30: /* SIM */ break;

      // RST n (Restart instructions)
      // Pushes current PC to stack, then jumps to 8 * n
      case 0xC7: this.pushWord(this.registers.PC); this.registers.PC = 0x0000; break; // RST 0
      case 0xCF: this.pushWord(this.registers.PC); this.registers.PC = 0x0008; break; // RST 1
      case 0xD7: this.pushWord(this.registers.PC); this.registers.PC = 0x0010; break; // RST 2
      case 0xDF: this.pushWord(this.registers.PC); this.registers.PC = 0x0018; break; // RST 3
      case 0xE7: this.pushWord(this.registers.PC); this.registers.PC = 0x0020; break; // RST 4
      case 0xEF: this.pushWord(this.registers.PC); this.registers.PC = 0x0028; break; // RST 5
      case 0xF7: this.pushWord(this.registers.PC); this.registers.PC = 0x0030; break; // RST 6
      case 0xFF: this.pushWord(this.registers.PC); this.registers.PC = 0x0038; break; // RST 7

      default:
        // Handle unknown opcode, perhaps treat as NOP or set an error flag
        console.warn(`Unknown/Unimplemented opcode: ${opcode.toString(16).toUpperCase()} at PC=${(this.registers.PC-1).toString(16).toUpperCase()}`);
        this.halted = true; // Halt on unknown instruction
        break;
    }
  }
}
