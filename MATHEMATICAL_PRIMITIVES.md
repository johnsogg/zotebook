# Mathematical Primitives - TypeScript Implementation Specification

## Overview

This document provides detailed specifications for implementing the core mathematical primitives that form the foundation of the Zotebook web port. These primitives must provide equivalent functionality to the original C# classes while leveraging modern TypeScript features for type safety and performance.

## Core Vector Mathematics

### Vec2 - 2D Vector Implementation

```typescript
/**
 * Immutable 2D vector with comprehensive geometric operations
 * Performance target: <1μs per operation on modern browsers
 */
export class Vec2 {
  constructor(
    public readonly x: number,
    public readonly y: number
  ) {}

  // Factory methods for common vectors
  static readonly ZERO = new Vec2(0, 0);
  static readonly ONE = new Vec2(1, 1);
  static readonly UNIT_X = new Vec2(1, 0);
  static readonly UNIT_Y = new Vec2(0, 1);

  // Computed properties with memoization for performance
  private _length?: number;
  get length(): number {
    if (this._length === undefined) {
      this._length = Math.sqrt(this.x * this.x + this.y * this.y);
    }
    return this._length;
  }

  get lengthSquared(): number {
    return this.x * this.x + this.y * this.y;
  }

  private _normalized?: Vec2;
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

  // Basic arithmetic operations (immutable)
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
    return new Vec2(this.x / scalar, this.y / scalar);
  }

  // Dot product
  dot(other: Vec2): number {
    return this.x * other.x + this.y * other.y;
  }

  // Cross product (returns scalar for 2D)
  cross(other: Vec2): number {
    return this.x * other.y - this.y * other.x;
  }

  // Distance operations
  distanceTo(other: Vec2): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  distanceSquaredTo(other: Vec2): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return dx * dx + dy * dy;
  }

  // Angular operations
  angleTo(other: Vec2): number {
    return Math.atan2(other.y, other.x) - Math.atan2(this.y, this.x);
  }

  get angle(): number {
    return Math.atan2(this.y, this.x);
  }

  // Rotation
  rotatedBy(radians: number): Vec2 {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return new Vec2(
      this.x * cos - this.y * sin,
      this.x * sin + this.y * cos
    );
  }

  // Projection
  projectedOnto(direction: Vec2): Vec2 {
    const normalizedDirection = direction.normalized;
    const scalar = this.dot(normalizedDirection);
    return normalizedDirection.multiply(scalar);
  }

  // Reflection
  reflectedAcross(normal: Vec2): Vec2 {
    const normalizedNormal = normal.normalized;
    const projection = this.projectedOnto(normalizedNormal);
    return this.subtract(projection.multiply(2));
  }

  // Perpendicular vectors
  get perpendicular(): Vec2 {
    return new Vec2(-this.y, this.x);
  }

  // Linear interpolation
  lerp(other: Vec2, t: number): Vec2 {
    return new Vec2(
      this.x + (other.x - this.x) * t,
      this.y + (other.y - this.y) * t
    );
  }

  // Comparison operations
  equals(other: Vec2, tolerance: number = Number.EPSILON): boolean {
    return Math.abs(this.x - other.x) <= tolerance && 
           Math.abs(this.y - other.y) <= tolerance;
  }

  isZero(tolerance: number = Number.EPSILON): boolean {
    return Math.abs(this.x) <= tolerance && Math.abs(this.y) <= tolerance;
  }

  // Utility methods
  toString(): string {
    return `Vec2(${this.x.toFixed(3)}, ${this.y.toFixed(3)})`;
  }

  toArray(): [number, number] {
    return [this.x, this.y];
  }

  clone(): Vec2 {
    return new Vec2(this.x, this.y);
  }

  // Static utility methods
  static fromArray(arr: [number, number]): Vec2 {
    return new Vec2(arr[0], arr[1]);
  }

  static fromAngle(angle: number, magnitude: number = 1): Vec2 {
    return new Vec2(Math.cos(angle) * magnitude, Math.sin(angle) * magnitude);
  }

  static lerp(a: Vec2, b: Vec2, t: number): Vec2 {
    return a.lerp(b, t);
  }

  static min(a: Vec2, b: Vec2): Vec2 {
    return new Vec2(Math.min(a.x, b.x), Math.min(a.y, b.y));
  }

  static max(a: Vec2, b: Vec2): Vec2 {
    return new Vec2(Math.max(a.x, b.x), Math.max(a.y, b.y));
  }
}
```

### Mat3 - 2D Transformation Matrix

```typescript
/**
 * 3x3 transformation matrix for 2D operations with homogeneous coordinates
 * Supports translation, rotation, scaling, and arbitrary transformations
 */
export class Mat3 {
  constructor(
    // Column-major order: [m11, m21, m31, m12, m22, m32, m13, m23, m33]
    private readonly elements: readonly number[]
  ) {
    if (elements.length !== 9) {
      throw new Error('Mat3 requires exactly 9 elements');
    }
  }

  // Access matrix elements (column-major)
  get m11(): number { return this.elements[0]; }
  get m21(): number { return this.elements[1]; }
  get m31(): number { return this.elements[2]; }
  get m12(): number { return this.elements[3]; }
  get m22(): number { return this.elements[4]; }
  get m32(): number { return this.elements[5]; }
  get m13(): number { return this.elements[6]; }
  get m23(): number { return this.elements[7]; }
  get m33(): number { return this.elements[8]; }

  // Factory methods for common matrices
  static readonly IDENTITY = new Mat3([1, 0, 0, 0, 1, 0, 0, 0, 1]);

  static createTranslation(translation: Vec2): Mat3 {
    return new Mat3([
      1, 0, 0,
      0, 1, 0,
      translation.x, translation.y, 1
    ]);
  }

  static createRotation(radians: number): Mat3 {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return new Mat3([
      cos, sin, 0,
      -sin, cos, 0,
      0, 0, 1
    ]);
  }

  static createScale(scale: Vec2): Mat3 {
    return new Mat3([
      scale.x, 0, 0,
      0, scale.y, 0,
      0, 0, 1
    ]);
  }

  static createUniformScale(scale: number): Mat3 {
    return Mat3.createScale(new Vec2(scale, scale));
  }

  static createTransform(translation: Vec2, rotation: number, scale: Vec2): Mat3 {
    // Combine transformations: T * R * S
    return Mat3.createTranslation(translation)
      .multiply(Mat3.createRotation(rotation))
      .multiply(Mat3.createScale(scale));
  }

  // Matrix operations
  multiply(other: Mat3): Mat3 {
    const a = this.elements;
    const b = other.elements;
    
    return new Mat3([
      // First column
      a[0] * b[0] + a[3] * b[1] + a[6] * b[2],
      a[1] * b[0] + a[4] * b[1] + a[7] * b[2],
      a[2] * b[0] + a[5] * b[1] + a[8] * b[2],
      
      // Second column
      a[0] * b[3] + a[3] * b[4] + a[6] * b[5],
      a[1] * b[3] + a[4] * b[4] + a[7] * b[5],
      a[2] * b[3] + a[5] * b[4] + a[8] * b[5],
      
      // Third column
      a[0] * b[6] + a[3] * b[7] + a[6] * b[8],
      a[1] * b[6] + a[4] * b[7] + a[7] * b[8],
      a[2] * b[6] + a[5] * b[7] + a[8] * b[8]
    ]);
  }

  // Transform point (with translation)
  transformPoint(point: Vec2): Vec2 {
    const x = this.m11 * point.x + this.m12 * point.y + this.m13;
    const y = this.m21 * point.x + this.m22 * point.y + this.m23;
    const w = this.m31 * point.x + this.m32 * point.y + this.m33;
    
    // Handle perspective division (though rarely needed for 2D)
    if (w !== 1) {
      return new Vec2(x / w, y / w);
    }
    return new Vec2(x, y);
  }

  // Transform direction (no translation)
  transformDirection(direction: Vec2): Vec2 {
    const x = this.m11 * direction.x + this.m12 * direction.y;
    const y = this.m21 * direction.x + this.m22 * direction.y;
    return new Vec2(x, y);
  }

  // Matrix determinant
  private _determinant?: number;
  get determinant(): number {
    if (this._determinant === undefined) {
      const a = this.elements;
      this._determinant = 
        a[0] * (a[4] * a[8] - a[7] * a[5]) -
        a[3] * (a[1] * a[8] - a[7] * a[2]) +
        a[6] * (a[1] * a[5] - a[4] * a[2]);
    }
    return this._determinant;
  }

  // Matrix inverse
  private _inverse?: Mat3;
  get inverse(): Mat3 {
    if (this._inverse === undefined) {
      const det = this.determinant;
      if (Math.abs(det) < Number.EPSILON) {
        throw new Error('Matrix is not invertible (determinant is zero)');
      }

      const a = this.elements;
      const invDet = 1.0 / det;
      
      this._inverse = new Mat3([
        (a[4] * a[8] - a[7] * a[5]) * invDet,
        (a[7] * a[2] - a[1] * a[8]) * invDet,
        (a[1] * a[5] - a[4] * a[2]) * invDet,
        (a[6] * a[5] - a[3] * a[8]) * invDet,
        (a[0] * a[8] - a[6] * a[2]) * invDet,
        (a[3] * a[2] - a[0] * a[5]) * invDet,
        (a[3] * a[7] - a[6] * a[4]) * invDet,
        (a[6] * a[1] - a[0] * a[7]) * invDet,
        (a[0] * a[4] - a[3] * a[1]) * invDet
      ]);
    }
    return this._inverse;
  }

  // Extract transformation components
  get translation(): Vec2 {
    return new Vec2(this.m13, this.m23);
  }

  get rotation(): number {
    return Math.atan2(this.m21, this.m11);
  }

  get scale(): Vec2 {
    const sx = Math.sqrt(this.m11 * this.m11 + this.m21 * this.m21);
    const sy = Math.sqrt(this.m12 * this.m12 + this.m22 * this.m22);
    return new Vec2(sx, sy);
  }

  // Utility methods
  equals(other: Mat3, tolerance: number = Number.EPSILON): boolean {
    for (let i = 0; i < 9; i++) {
      if (Math.abs(this.elements[i] - other.elements[i]) > tolerance) {
        return false;
      }
    }
    return true;
  }

  toString(): string {
    const e = this.elements;
    return `Mat3(\n  ${e[0].toFixed(3)} ${e[3].toFixed(3)} ${e[6].toFixed(3)}\n  ${e[1].toFixed(3)} ${e[4].toFixed(3)} ${e[7].toFixed(3)}\n  ${e[2].toFixed(3)} ${e[5].toFixed(3)} ${e[8].toFixed(3)}\n)`;
  }

  toArray(): number[] {
    return [...this.elements];
  }

  // For WebGL usage (column-major)
  toFloat32Array(): Float32Array {
    return new Float32Array(this.elements);
  }
}
```

### Pt - Multi-Coordinate System Point

```typescript
/**
 * Point class supporting multiple coordinate systems
 * Essential for handling transformations between world, screen, and model coordinates
 */
export class Pt {
  private _worldCoordinates: Vec2;
  private _screenCoordinates?: Vec2;
  private _modelCoordinates?: Vec2;

  constructor(worldCoordinates: Vec2) {
    this._worldCoordinates = worldCoordinates;
  }

  // World coordinates (primary coordinate system)
  get worldCoordinates(): Vec2 {
    return this._worldCoordinates;
  }

  set worldCoordinates(value: Vec2) {
    this._worldCoordinates = value;
    // Invalidate cached coordinate systems
    this._screenCoordinates = undefined;
    this._modelCoordinates = undefined;
  }

  // Screen coordinates (for input handling and rendering)
  getScreenCoordinates(worldToScreen: Mat3): Vec2 {
    if (!this._screenCoordinates) {
      this._screenCoordinates = worldToScreen.transformPoint(this._worldCoordinates);
    }
    return this._screenCoordinates;
  }

  setScreenCoordinates(screenCoords: Vec2, screenToWorld: Mat3): void {
    this._screenCoordinates = screenCoords;
    this._worldCoordinates = screenToWorld.transformPoint(screenCoords);
    this._modelCoordinates = undefined; // Invalidate model coordinates
  }

  // Model coordinates (for constraint solving)
  getModelCoordinates(worldToModel: Mat3): Vec2 {
    if (!this._modelCoordinates) {
      this._modelCoordinates = worldToModel.transformPoint(this._worldCoordinates);
    }
    return this._modelCoordinates;
  }

  setModelCoordinates(modelCoords: Vec2, modelToWorld: Mat3): void {
    this._modelCoordinates = modelCoords;
    this._worldCoordinates = modelToWorld.transformPoint(modelCoords);
    this._screenCoordinates = undefined; // Invalidate screen coordinates
  }

  // Coordinate system updates
  updateFromWorld(worldToScreen: Mat3, worldToModel?: Mat3): void {
    this._screenCoordinates = worldToScreen.transformPoint(this._worldCoordinates);
    if (worldToModel) {
      this._modelCoordinates = worldToModel.transformPoint(this._worldCoordinates);
    }
  }

  updateFromScreen(screenCoords: Vec2, screenToWorld: Mat3): void {
    this.setScreenCoordinates(screenCoords, screenToWorld);
  }

  // Snapping operations
  isSnappedTo(other: Pt, tolerance: number): boolean {
    return this._worldCoordinates.distanceTo(other._worldCoordinates) <= tolerance;
  }

  snapTo(target: Pt, tolerance: number): Pt {
    if (this.isSnappedTo(target, tolerance)) {
      return new Pt(target._worldCoordinates);
    }
    return this;
  }

  // Distance operations
  distanceTo(other: Pt): number {
    return this._worldCoordinates.distanceTo(other._worldCoordinates);
  }

  distanceSquaredTo(other: Pt): number {
    return this._worldCoordinates.distanceSquaredTo(other._worldCoordinates);
  }

  // Utility methods
  clone(): Pt {
    const cloned = new Pt(this._worldCoordinates);
    cloned._screenCoordinates = this._screenCoordinates;
    cloned._modelCoordinates = this._modelCoordinates;
    return cloned;
  }

  equals(other: Pt, tolerance: number = Number.EPSILON): boolean {
    return this._worldCoordinates.equals(other._worldCoordinates, tolerance);
  }

  toString(): string {
    return `Pt(world: ${this._worldCoordinates.toString()})`;
  }

  // Factory methods
  static fromWorld(worldCoords: Vec2): Pt {
    return new Pt(worldCoords);
  }

  static fromScreen(screenCoords: Vec2, screenToWorld: Mat3): Pt {
    const worldCoords = screenToWorld.transformPoint(screenCoords);
    const pt = new Pt(worldCoords);
    pt._screenCoordinates = screenCoords;
    return pt;
  }

  static fromModel(modelCoords: Vec2, modelToWorld: Mat3): Pt {
    const worldCoords = modelToWorld.transformPoint(modelCoords);
    const pt = new Pt(worldCoords);
    pt._modelCoordinates = modelCoords;
    return pt;
  }
}
```

## Advanced Mathematical Utilities

### Bounding Box

```typescript
/**
 * Axis-aligned bounding box for efficient geometric queries
 */
export class BoundingBox {
  constructor(
    public readonly min: Vec2,
    public readonly max: Vec2
  ) {}

  static fromPoints(points: Vec2[]): BoundingBox {
    if (points.length === 0) {
      return new BoundingBox(Vec2.ZERO, Vec2.ZERO);
    }

    let minX = points[0].x;
    let minY = points[0].y;
    let maxX = points[0].x;
    let maxY = points[0].y;

    for (const point of points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }

    return new BoundingBox(new Vec2(minX, minY), new Vec2(maxX, maxY));
  }

  get width(): number {
    return this.max.x - this.min.x;
  }

  get height(): number {
    return this.max.y - this.min.y;
  }

  get center(): Vec2 {
    return new Vec2(
      (this.min.x + this.max.x) / 2,
      (this.min.y + this.max.y) / 2
    );
  }

  get area(): number {
    return this.width * this.height;
  }

  contains(point: Vec2): boolean {
    return point.x >= this.min.x && point.x <= this.max.x &&
           point.y >= this.min.y && point.y <= this.max.y;
  }

  intersects(other: BoundingBox): boolean {
    return this.min.x <= other.max.x && this.max.x >= other.min.x &&
           this.min.y <= other.max.y && this.max.y >= other.min.y;
  }

  expand(amount: number): BoundingBox {
    const expansion = new Vec2(amount, amount);
    return new BoundingBox(
      this.min.subtract(expansion),
      this.max.add(expansion)
    );
  }

  union(other: BoundingBox): BoundingBox {
    return new BoundingBox(
      Vec2.min(this.min, other.min),
      Vec2.max(this.max, other.max)
    );
  }
}
```

### Numerical Utilities

```typescript
/**
 * Numerical utilities for robust geometric computations
 */
export class MathUtils {
  static readonly EPSILON = 1e-10;
  static readonly ANGLE_EPSILON = 1e-6;
  
  // Robust floating-point comparison
  static equals(a: number, b: number, tolerance: number = MathUtils.EPSILON): boolean {
    return Math.abs(a - b) <= tolerance;
  }

  // Clamp value to range
  static clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  // Linear interpolation
  static lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  // Angle normalization
  static normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }

  // Shortest angular difference
  static angleDifference(a: number, b: number): number {
    return MathUtils.normalizeAngle(b - a);
  }

  // Smooth step function
  static smoothstep(edge0: number, edge1: number, x: number): number {
    const t = MathUtils.clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }

  // Convert degrees to radians
  static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  // Convert radians to degrees
  static toDegrees(radians: number): number {
    return radians * (180 / Math.PI);
  }

  // Robust quadratic equation solver
  static solveQuadratic(a: number, b: number, c: number): number[] {
    if (Math.abs(a) < MathUtils.EPSILON) {
      // Linear equation: bx + c = 0
      if (Math.abs(b) < MathUtils.EPSILON) {
        return []; // No solution
      }
      return [-c / b];
    }

    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) {
      return []; // No real solutions
    }

    if (discriminant === 0) {
      return [-b / (2 * a)]; // One solution
    }

    const sqrtDiscriminant = Math.sqrt(discriminant);
    return [
      (-b + sqrtDiscriminant) / (2 * a),
      (-b - sqrtDiscriminant) / (2 * a)
    ];
  }
}
```

## Performance Considerations

### Object Pooling for High-Frequency Operations

```typescript
/**
 * Object pool for reusing Vec2 instances during intensive computations
 */
export class Vec2Pool {
  private static pool: Vec2[] = [];
  private static maxSize = 1000;

  static acquire(x: number = 0, y: number = 0): Vec2 {
    const vec = Vec2Pool.pool.pop();
    if (vec) {
      // Reuse existing object (requires mutable Vec2 variant)
      return new Vec2(x, y); // For immutable Vec2, just create new
    }
    return new Vec2(x, y);
  }

  static release(vec: Vec2): void {
    if (Vec2Pool.pool.length < Vec2Pool.maxSize) {
      Vec2Pool.pool.push(vec);
    }
  }

  static clear(): void {
    Vec2Pool.pool.length = 0;
  }
}
```

## Type Definitions

```typescript
// Type aliases for clarity
export type Point2D = Vec2;
export type Vector2D = Vec2;
export type Transform2D = Mat3;

// Geometric tolerance constants
export const GEOMETRIC_TOLERANCE = 1e-6;
export const ANGULAR_TOLERANCE = 1e-6;
export const SNAP_TOLERANCE = 5.0; // pixels

// Common transformations
export const IDENTITY_TRANSFORM = Mat3.IDENTITY;
```

These mathematical primitives form the foundation for all geometric operations in the Zotebook web port. They provide type-safe, performant implementations that maintain the precision and robustness required for professional CAD applications while leveraging modern TypeScript features for better developer experience and runtime safety.