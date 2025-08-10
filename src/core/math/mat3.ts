import { Vec2 } from './vec2.js';

/**
 * Immutable 3x3 matrix class for 2D transformations using homogeneous coordinates.
 * Based on the original Zotebook Mat3 implementation but optimized for TypeScript and web performance.
 * 
 * Matrix layout (column-major order for WebGL compatibility):
 * | m00 m10 m20 |   | a c tx |
 * | m01 m11 m21 | = | b d ty |
 * | m02 m12 m22 |   | 0 0 1  |
 */
export class Mat3 {
  // Matrix elements in column-major order for WebGL compatibility
  public readonly m00: number; // a - x scale
  public readonly m01: number; // b - x skew
  public readonly m02: number; // 0

  public readonly m10: number; // c - y skew  
  public readonly m11: number; // d - y scale
  public readonly m12: number; // 0

  public readonly m20: number; // tx - x translation
  public readonly m21: number; // ty - y translation
  public readonly m22: number; // 1

  // Cached computed properties
  private _determinant?: number;
  private _inverse?: Mat3;

  constructor(
    m00: number, m01: number, m02: number,
    m10: number, m11: number, m12: number,
    m20: number, m21: number, m22: number
  ) {
    this.m00 = m00; this.m01 = m01; this.m02 = m02;
    this.m10 = m10; this.m11 = m11; this.m12 = m12;
    this.m20 = m20; this.m21 = m21; this.m22 = m22;
  }

  // Static factory methods
  static readonly IDENTITY = new Mat3(
    1, 0, 0,
    0, 1, 0,
    0, 0, 1
  );

  static readonly ZERO = new Mat3(
    0, 0, 0,
    0, 0, 0,
    0, 0, 0
  );

  static fromTransform(a: number, b: number, c: number, d: number, tx: number, ty: number): Mat3 {
    return new Mat3(
      a, b, 0,
      c, d, 0,
      tx, ty, 1
    );
  }

  static translation(x: number, y: number): Mat3;
  static translation(vec: Vec2): Mat3;
  static translation(xOrVec: number | Vec2, y?: number): Mat3 {
    if (typeof xOrVec === 'number') {
      return new Mat3(
        1, 0, 0,
        0, 1, 0,
        xOrVec, y!, 1
      );
    } else {
      return new Mat3(
        1, 0, 0,
        0, 1, 0,
        xOrVec.x, xOrVec.y, 1
      );
    }
  }

  static rotation(radians: number): Mat3 {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return new Mat3(
      cos, sin, 0,
      -sin, cos, 0,
      0, 0, 1
    );
  }

  static scale(x: number, y?: number): Mat3;
  static scale(vec: Vec2): Mat3;
  static scale(xOrVec: number | Vec2, y?: number): Mat3 {
    if (typeof xOrVec === 'number') {
      const scaleY = y !== undefined ? y : xOrVec;
      return new Mat3(
        xOrVec, 0, 0,
        0, scaleY, 0,
        0, 0, 1
      );
    } else {
      return new Mat3(
        xOrVec.x, 0, 0,
        0, xOrVec.y, 0,
        0, 0, 1
      );
    }
  }

  static skew(xRadians: number, yRadians: number): Mat3 {
    return new Mat3(
      1, Math.tan(yRadians), 0,
      Math.tan(xRadians), 1, 0,
      0, 0, 1
    );
  }

  // Computed properties
  get determinant(): number {
    if (this._determinant === undefined) {
      this._determinant = 
        this.m00 * (this.m11 * this.m22 - this.m12 * this.m21) -
        this.m01 * (this.m10 * this.m22 - this.m12 * this.m20) +
        this.m02 * (this.m10 * this.m21 - this.m11 * this.m20);
    }
    return this._determinant;
  }

  get inverse(): Mat3 {
    if (this._inverse === undefined) {
      const det = this.determinant;
      if (Math.abs(det) < Number.EPSILON) {
        throw new Error('Matrix is not invertible (determinant is zero)');
      }

      const invDet = 1 / det;
      this._inverse = new Mat3(
        (this.m11 * this.m22 - this.m12 * this.m21) * invDet,
        (this.m02 * this.m21 - this.m01 * this.m22) * invDet,
        (this.m01 * this.m12 - this.m02 * this.m11) * invDet,

        (this.m12 * this.m20 - this.m10 * this.m22) * invDet,
        (this.m00 * this.m22 - this.m02 * this.m20) * invDet,
        (this.m02 * this.m10 - this.m00 * this.m12) * invDet,

        (this.m10 * this.m21 - this.m11 * this.m20) * invDet,
        (this.m01 * this.m20 - this.m00 * this.m21) * invDet,
        (this.m00 * this.m11 - this.m01 * this.m10) * invDet
      );
    }
    return this._inverse;
  }

  get translation(): Vec2 {
    return new Vec2(this.m20, this.m21);
  }

  get scale(): Vec2 {
    const scaleX = Math.sqrt(this.m00 * this.m00 + this.m01 * this.m01);
    const scaleY = Math.sqrt(this.m10 * this.m10 + this.m11 * this.m11);
    return new Vec2(scaleX, scaleY);
  }

  get rotation(): number {
    return Math.atan2(this.m01, this.m00);
  }

  // Matrix operations
  multiply(other: Mat3): Mat3 {
    return new Mat3(
      this.m00 * other.m00 + this.m10 * other.m01 + this.m20 * other.m02,
      this.m01 * other.m00 + this.m11 * other.m01 + this.m21 * other.m02,
      this.m02 * other.m00 + this.m12 * other.m01 + this.m22 * other.m02,

      this.m00 * other.m10 + this.m10 * other.m11 + this.m20 * other.m12,
      this.m01 * other.m10 + this.m11 * other.m11 + this.m21 * other.m12,
      this.m02 * other.m10 + this.m12 * other.m11 + this.m22 * other.m12,

      this.m00 * other.m20 + this.m10 * other.m21 + this.m20 * other.m22,
      this.m01 * other.m20 + this.m11 * other.m21 + this.m21 * other.m22,
      this.m02 * other.m20 + this.m12 * other.m21 + this.m22 * other.m22
    );
  }

  // Transform a point (2D vector) by this matrix
  transformPoint(point: Vec2): Vec2 {
    const w = this.m02 * point.x + this.m12 * point.y + this.m22;
    return new Vec2(
      (this.m00 * point.x + this.m10 * point.y + this.m20) / w,
      (this.m01 * point.x + this.m11 * point.y + this.m21) / w
    );
  }

  // Transform a vector (no translation, w=0)
  transformVector(vector: Vec2): Vec2 {
    return new Vec2(
      this.m00 * vector.x + this.m10 * vector.y,
      this.m01 * vector.x + this.m11 * vector.y
    );
  }

  // Transformation builder methods (return new matrix)
  translate(x: number, y: number): Mat3;
  translate(vec: Vec2): Mat3;
  translate(xOrVec: number | Vec2, y?: number): Mat3 {
    if (typeof xOrVec === 'number') {
      return this.multiply(Mat3.translation(xOrVec, y!));
    } else {
      return this.multiply(Mat3.translation(xOrVec));
    }
  }

  rotate(radians: number): Mat3 {
    return this.multiply(Mat3.rotation(radians));
  }

  scaleBy(x: number, y?: number): Mat3;
  scaleBy(vec: Vec2): Mat3;
  scaleBy(xOrVec: number | Vec2, y?: number): Mat3 {
    if (typeof xOrVec === 'number') {
      return this.multiply(Mat3.scale(xOrVec, y));
    } else {
      return this.multiply(Mat3.scale(xOrVec));
    }
  }

  // Utility methods
  transpose(): Mat3 {
    return new Mat3(
      this.m00, this.m10, this.m20,
      this.m01, this.m11, this.m21,
      this.m02, this.m12, this.m22
    );
  }

  isIdentity(epsilon: number = Number.EPSILON): boolean {
    return this.isEqual(Mat3.IDENTITY, epsilon);
  }

  isEqual(other: Mat3, epsilon: number = Number.EPSILON): boolean {
    return Math.abs(this.m00 - other.m00) < epsilon &&
           Math.abs(this.m01 - other.m01) < epsilon &&
           Math.abs(this.m02 - other.m02) < epsilon &&
           Math.abs(this.m10 - other.m10) < epsilon &&
           Math.abs(this.m11 - other.m11) < epsilon &&
           Math.abs(this.m12 - other.m12) < epsilon &&
           Math.abs(this.m20 - other.m20) < epsilon &&
           Math.abs(this.m21 - other.m21) < epsilon &&
           Math.abs(this.m22 - other.m22) < epsilon;
  }

  // Conversion methods
  toArray(): number[] {
    return [
      this.m00, this.m01, this.m02,
      this.m10, this.m11, this.m12,
      this.m20, this.m21, this.m22
    ];
  }

  toFloat32Array(): Float32Array {
    return new Float32Array(this.toArray());
  }

  // CSS transform string (for DOM manipulation)
  toCSSTransform(): string {
    return `matrix(${this.m00}, ${this.m01}, ${this.m10}, ${this.m11}, ${this.m20}, ${this.m21})`;
  }

  toString(): string {
    return `Mat3[\n` +
           `  ${this.m00.toFixed(3)} ${this.m10.toFixed(3)} ${this.m20.toFixed(3)}\n` +
           `  ${this.m01.toFixed(3)} ${this.m11.toFixed(3)} ${this.m21.toFixed(3)}\n` +
           `  ${this.m02.toFixed(3)} ${this.m12.toFixed(3)} ${this.m22.toFixed(3)}\n` +
           `]`;
  }

  toJSON(): number[] {
    return this.toArray();
  }

  static fromJSON(data: number[]): Mat3 {
    if (data.length !== 9) {
      throw new Error('Mat3.fromJSON requires exactly 9 elements');
    }
    return new Mat3(
      data[0], data[1], data[2],
      data[3], data[4], data[5],
      data[6], data[7], data[8]
    );
  }

  // CSS DOMMatrix compatibility
  static fromDOMMatrix(domMatrix: DOMMatrix): Mat3 {
    return new Mat3(
      domMatrix.a, domMatrix.b, 0,
      domMatrix.c, domMatrix.d, 0,
      domMatrix.e, domMatrix.f, 1
    );
  }

  toDOMMatrix(): DOMMatrix {
    return new DOMMatrix([this.m00, this.m01, this.m10, this.m11, this.m20, this.m21]);
  }
}

// Convenience aliases
export namespace Mat3 {
  export const multiply = (a: Mat3, b: Mat3): Mat3 => a.multiply(b);
  export const transformPoint = (matrix: Mat3, point: Vec2): Vec2 => matrix.transformPoint(point);
  export const transformVector = (matrix: Mat3, vector: Vec2): Vec2 => matrix.transformVector(vector);
}