
export const toHexString = (value: number, length: number): string => {
  return value.toString(16).toUpperCase().padStart(length, '0');
};

export const toBinaryString = (value: number, length: number): string => {
  return value.toString(2).padStart(length, '0');
};
    