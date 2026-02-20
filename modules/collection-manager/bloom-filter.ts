/**
 * Simple Bloom Filter for memory-efficient deduplication
 * Uses non-cryptographic hash functions for speed
 */

export class BloomFilter {
  private bitmap: Uint8Array;
  private size: number;
  private hashCount: number;
  private count: number = 0;

  constructor(expectedItems: number = 100000, falsePositiveRate: number = 0.01) {
    // Calculate optimal size and hash count
    this.size = Math.ceil(-expectedItems * Math.log(falsePositiveRate) / Math.pow(Math.LN2, 2));
    this.hashCount = Math.ceil((this.size / expectedItems) * Math.LN2);
    this.bitmap = new Uint8Array(Math.ceil(this.size / 8));
  }

  private hash(str: string, seed: number): number {
    // FNV-1a variant with seed
    let hash = 2166136261 ^ seed;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash) % this.size;
  }

  add(item: string): void {
    for (let i = 0; i < this.hashCount; i++) {
      const bit = this.hash(item, i);
      const byteIndex = Math.floor(bit / 8);
      const bitIndex = bit % 8;
      this.bitmap[byteIndex] |= (1 << bitIndex);
    }
    this.count++;
  }

  mightContain(item: string): boolean {
    for (let i = 0; i < this.hashCount; i++) {
      const bit = this.hash(item, i);
      const byteIndex = Math.floor(bit / 8);
      const bitIndex = bit % 8;
      if ((this.bitmap[byteIndex] & (1 << bitIndex)) === 0) {
        return false;
      }
    }
    return true;
  }

  getCount(): number {
    return this.count;
  }

  /**
   * Export to base64 string for persistence
   */
  export(): string {
    const buffer = Buffer.from(this.bitmap);
    return buffer.toString('base64');
  }

  /**
   * Import from base64 string
   */
  static import(base64: string, expectedItems: number = 100000): BloomFilter {
    const filter = new BloomFilter(expectedItems);
    const buffer = Buffer.from(base64, 'base64');
    filter.bitmap = new Uint8Array(buffer);
    return filter;
  }

  /**
   * Serialize to JSON
   */
  toJSON(): { bitmap: string; size: number; hashCount: number; count: number } {
    return {
      bitmap: this.export(),
      size: this.size,
      hashCount: this.hashCount,
      count: this.count
    };
  }

  /**
   * Deserialize from JSON
   */
  static fromJSON(json: { bitmap: string; size: number; hashCount: number; count: number }): BloomFilter {
    const filter = new BloomFilter(1000); // Dummy, will be overwritten
    filter.bitmap = new Uint8Array(Buffer.from(json.bitmap, 'base64'));
    filter.size = json.size;
    filter.hashCount = json.hashCount;
    filter.count = json.count;
    return filter;
  }
}
