// Print Size: the physical size the design is made for. Everything physical
// derives from it. Always mm here; the UI converts for display.

export interface PrintSize {
  widthMm: number;
  /** Max height: the loudest Bucket reaches it. */
  heightMm: number;
}

export const DEFAULT_PRINT_SIZE: PrintSize = { widthMm: 80, heightMm: 25 };
