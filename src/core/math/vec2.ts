/**
 * Immutable 2D vector class with comprehensive geometric operations.
 * Based on the original Zotebook Vec2 implementation but optimized for TypeScript and web performance.
 */
export class Vec2 {
  public readonly x: number;
  public readonly y: number;

  // Cached computed properties for performance
  private _length?: number;
  private _lengthSquared?: number;
  private _normalized?: Vec2;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  // Static factory methods
  static readonly ZERO = new Vec2(0, 0);
  static readonly ONE = new Vec2(1, 1);
  static readonly UNIT_X = new Vec2(1, 0);
  static readonly UNIT_Y = new Vec2(0, 1);

  static fromAngle(radians: number): Vec2 {
    return new Vec2(Math.cos(radians), Math.sin(radians));
  }

  static fromPolar(length: number, angle: number): Vec2 {
    return new Vec2(length * Math.cos(angle), length * Math.sin(angle));
  }

  // Core properties with memoization for performance
  get length(): number {
    if (this._length === undefined) {
      this._length = Math.sqrt(this.lengthSquared);
    }
    return this._length;
  }

  get lengthSquared(): number {
    if (this._lengthSquared === undefined) {
      this._lengthSquared = this.x * this.x + this.y * this.y;
    }
    return this._lengthSquared;
  }

  get normalized(): Vec2 {
    if (this._normalized === undefined) {
      const len = this.length;
      if (len === 0) {
        this._normalized = Vec2.ZERO;
      } else {
        this._normalized = new Vec2(this.x / len, this.y / len);
      }
    }
    return this._normalized;
  }

  get angle(): number {
    return Math.atan2(this.y, this.x);
  }

  get perpendicular(): Vec2 {
    return new Vec2(-this.y, this.x);
  }

  // Vector arithmetic
  add(other: Vec2): Vec2 {
    return new Vec2(this.x + other.x, this.y + other.y);
  }

  subtract(other: Vec2): Vec2 {
    return new Vec2(this.x - other.x, this.y - other.y);
  }

  multiply(scalar: number): Vec2 {
    return new Vec2(this.x * scalar, this.y * scalar);
  }

  divide(scalar: number): Vec2 {
    if (scalar === 0) {
      throw new Error('Division by zero');
    }
    return new Vec2(this.x / scalar, this.y / scalar);
  }

  negate(): Vec2 {
    return new Vec2(-this.x, -this.y);
  }

  // Dot and cross products
  static dot(a: Vec2, b: Vec2): number {
    return a.x * b.x + a.y * b.y;
  }

  dot(other: Vec2): number {
    return Vec2.dot(this, other);
  }

  static cross(a: Vec2, b: Vec2): number {
    return a.x * b.y - a.y * b.x;
  }

  cross(other: Vec2): number {
    return Vec2.cross(this, other);
  }

  // Distance operations
  distanceTo(other: Vec2): number {
    return this.subtract(other).length;
  }

  distanceToSquared(other: Vec2): number {
    return this.subtract(other).lengthSquared;
  }

  // Angular operations
  angleTo(other: Vec2): number {
    const dot = this.dot(other);
    const det = this.cross(other);
    return Math.atan2(det, dot);
  }

  angleToUnsigned(other: Vec2): number {
    const cosAngle = this.dot(other) / (this.length * other.length);
    return Math.acos(Math.max(-1, Math.min(1, cosAngle)));
  }

  // Rotation
  rotateBy(radians: number): Vec2 {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return new Vec2(
      this.x * cos - this.y * sin,
      this.x * sin + this.y * cos
    );
  }

  // Projection operations
  projectOnto(direction: Vec2): Vec2 {
    const normalizedDirection = direction.normalized;
    const projectionLength = this.dot(normalizedDirection);
    return normalizedDirection.multiply(projectionLength);
  }

  rejectFrom(direction: Vec2): Vec2 {
    return this.subtract(this.projectOnto(direction));
  }

  // Reflection
  reflect(normal: Vec2): Vec2 {
    const normalizedNormal = normal.normalized;
    return this.subtract(normalizedNormal.multiply(2 * this.dot(normalizedNormal)));
  }

  // Linear interpolation
  lerp(other: Vec2, t: number): Vec2 {
    return new Vec2(
      this.x + (other.x - this.x) * t,
      this.y + (other.y - this.y) * t
    );
  }

  // Utility methods
  isZero(epsilon: number = Number.EPSILON): boolean {
    return Math.abs(this.x) < epsilon && Math.abs(this.y) < epsilon;
  }

  isEqual(other: Vec2, epsilon: number = Number.EPSILON): boolean {
    return Math.abs(this.x - other.x) < epsilon && Math.abs(this.y - other.y) < epsilon;
  }

  isParallel(other: Vec2, epsilon: number = 1e-6): boolean {
    return Math.abs(this.cross(other)) < epsilon;
  }

  isPerpendicular(other: Vec2, epsilon: number = 1e-6): boolean {
    return Math.abs(this.dot(other)) < epsilon;
  }

  // Clamping and limiting
  clampLength(maxLength: number): Vec2 {
    if (this.length <= maxLength) {
      return this;
    }
    return this.normalized.multiply(maxLength);
  }

  clampComponents(min: number, max: number): Vec2 {
    return new Vec2(
      Math.max(min, Math.min(max, this.x)),
      Math.max(min, Math.min(max, this.y))
    );
  }

  // Conversion methods
  toArray(): [number, number] {
    return [this.x, this.y];
  }

  toString(): string {
    return `Vec2(${this.x.toFixed(3)}, ${this.y.toFixed(3)})`;
  }

  toJSON(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  static fromJSON(data: { x: number; y: number }): Vec2 {
    return new Vec2(data.x, data.y);
  }

  // Hash for use in maps/sets
  hash(): string {
    return `${this.x},${this.y}`;
  }
}

// Convenience aliases for common operations
export namespace Vec2 {
  export const add = (a: Vec2, b: Vec2): Vec2 => a.add(b);
  export const subtract = (a: Vec2, b: Vec2): Vec2 => a.subtract(b);
  export const multiply = (v: Vec2, s: number): Vec2 => v.multiply(s);
  export const distance = (a: Vec2, b: Vec2): number => a.distanceTo(b);
  export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => a.lerp(b, t);
}