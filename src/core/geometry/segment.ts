import { Pt } from '../math/pt.js';
import { Vec2 } from '../math/vec2.js';

/**
 * Abstract base class for all geometric segments in Zotebook.
 * Based on the original Zotebook Segment hierarchy but designed for immutability and web performance.
 */

export enum SegmentType {
  LINE = 'line',
  ARC = 'arc',
  CIRCLE = 'circle',
  SPLINE = 'spline',
  ELLIPSE = 'ellipse'
}

export interface SegmentIntersection {
  point: Vec2;
  t1: number; // Parameter on first segment [0,1]
  t2?: number; // Parameter on second segment [0,1] (for segment-segment intersections)
  type: 'endpoint' | 'interior' | 'tangent' | 'overlap';
}

export interface BoundingBox {
  min: Vec2;
  max: Vec2;
  center: Vec2;
  size: Vec2;
}

/**
 * Abstract base class for all drawable geometric segments.
 * Provides common interface for geometric operations and rendering.
 */
export abstract class Segment {
  public readonly id: string;
  public readonly type: SegmentType;
  
  // Cached computed properties for performance
  private _length?: number;
  private _boundingBox?: BoundingBox;
  
  constructor(type: SegmentType, id?: string) {
    this.type = type;
    this.id = id || this.generateId();
  }

  // Abstract properties that must be implemented by subclasses
  abstract get startPoint(): Vec2;
  abstract get endPoint(): Vec2;
  abstract get isClosed(): boolean;

  // Abstract methods for geometric operations
  abstract pointAt(t: number): Vec2;
  abstract tangentAt(t: number): Vec2;
  abstract normalAt(t: number): Vec2;
  abstract curvatureAt(t: number): number;
  abstract distanceToPoint(point: Vec2): number;
  abstract closestPointTo(point: Vec2): { point: Vec2; t: number; distance: number };
  abstract subdivide(t: number): [Segment, Segment];
  abstract transform(matrix: any): Segment; // Will use Mat3 when importing
  abstract clone(): Segment;

  // Length property with caching
  get length(): number {
    if (this._length === undefined) {
      this._length = this.computeLength();
    }
    return this._length;
  }

  // Bounding box with caching
  get boundingBox(): BoundingBox {
    if (this._boundingBox === undefined) {
      this._boundingBox = this.computeBoundingBox();
    }
    return this._boundingBox;
  }

  // Abstract method to compute length (implemented by subclasses)
  protected abstract computeLength(): number;
  
  // Abstract method to compute bounding box (implemented by subclasses)
  protected abstract computeBoundingBox(): BoundingBox;

  // Parametric evaluation helpers
  isValidParameter(t: number): boolean {
    return t >= 0 && t <= 1;
  }

  clampParameter(t: number): number {
    return Math.max(0, Math.min(1, t));
  }

  // Sampling methods for rendering and analysis
  samplePoints(numPoints: number): Vec2[] {
    const points: Vec2[] = [];
    for (let i = 0; i < numPoints; i++) {
      const t = i / (numPoints - 1);
      points.push(this.pointAt(t));
    }
    return points;
  }

  sampleUniform(spacing: number): Vec2[] {
    const numPoints = Math.max(2, Math.ceil(this.length / spacing) + 1);
    return this.samplePoints(numPoints);
  }

  // Geometric queries
  containsPoint(point: Vec2, tolerance: number = 1e-6): boolean {
    return this.distanceToPoint(point) <= tolerance;
  }

  intersectWithSegment(other: Segment, tolerance: number = 1e-6): SegmentIntersection[] {
    // Default implementation using numerical methods
    // Subclasses can override with analytical solutions
    return this.findIntersectionsNumerical(other, tolerance);
  }

  // Numerical intersection finding (fallback method)
  private findIntersectionsNumerical(other: Segment, tolerance: number): SegmentIntersection[] {
    const intersections: SegmentIntersection[] = [];
    const samples = 100; // Sampling resolution

    // Simple grid-based intersection detection
    for (let i = 0; i <= samples; i++) {
      const t1 = i / samples;
      const p1 = this.pointAt(t1);
      
      for (let j = 0; j <= samples; j++) {
        const t2 = j / samples;
        const p2 = other.pointAt(t2);
        
        if (p1.distanceTo(p2) <= tolerance) {
          // Found potential intersection, refine it
          const refined = this.refineIntersection(other, t1, t2, tolerance);
          if (refined) {
            intersections.push(refined);
          }
        }
      }
    }
    
    return this.removeDuplicateIntersections(intersections, tolerance);
  }

  private refineIntersection(
    other: Segment, 
    t1: number, 
    t2: number, 
    tolerance: number
  ): SegmentIntersection | null {
    // Simple Newton-Raphson refinement
    let currentT1 = t1;
    let currentT2 = t2;
    
    for (let iter = 0; iter < 10; iter++) {
      const p1 = this.pointAt(currentT1);
      const p2 = other.pointAt(currentT2);
      const distance = p1.distanceTo(p2);
      
      if (distance <= tolerance) {
        const intersectionType = this.classifyIntersection(currentT1, currentT2);
        return {
          point: p1.lerp(p2, 0.5),
          t1: currentT1,
          t2: currentT2,
          type: intersectionType
        };
      }
      
      // Simple step adjustment (could be improved with proper derivatives)
      const step = 0.01;
      const gradient1 = this.pointAt(currentT1 + step).subtract(p1);
      const gradient2 = other.pointAt(currentT2 + step).subtract(p2);
      
      currentT1 = Math.max(0, Math.min(1, currentT1 - step));
      currentT2 = Math.max(0, Math.min(1, currentT2 - step));
    }
    
    return null;
  }

  private classifyIntersection(t1: number, t2: number): 'endpoint' | 'interior' | 'tangent' | 'overlap' {
    const epsilon = 1e-6;
    const isT1Endpoint = t1 < epsilon || t1 > (1 - epsilon);
    const isT2Endpoint = t2 < epsilon || t2 > (1 - epsilon);
    
    if (isT1Endpoint || isT2Endpoint) {
      return 'endpoint';
    }
    return 'interior';
  }

  private removeDuplicateIntersections(
    intersections: SegmentIntersection[], 
    tolerance: number
  ): SegmentIntersection[] {
    const unique: SegmentIntersection[] = [];
    
    for (const intersection of intersections) {
      const isDuplicate = unique.some(existing => 
        existing.point.distanceTo(intersection.point) <= tolerance
      );
      
      if (!isDuplicate) {
        unique.push(intersection);
      }
    }
    
    return unique;
  }

  // Utility methods
  reverse(): Segment {
    // Default implementation - subclasses should override for efficiency
    return this.reparameterize(t => 1 - t);
  }

  // Reparameterization utility
  reparameterize(fn: (t: number) => number): Segment {
    // Create a new segment with reparameterized evaluation
    // This is a generic fallback - specific segments can optimize this
    return new ReparameterizedSegment(this, fn);
  }

  // Serialization support
  toJSON(): any {
    return {
      id: this.id,
      type: this.type,
      // Subclasses should extend this with their specific data
    };
  }

  // Factory method for deserialization
  static fromJSON(data: any): Segment {
    // Will be implemented by specific segment types
    throw new Error('fromJSON must be implemented by concrete segment classes');
  }

  // Unique ID generation
  private generateId(): string {
    return `segment_${this.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Equality testing
  isEqual(other: Segment, tolerance: number = 1e-6): boolean {
    if (this.type !== other.type) {
      return false;
    }
    
    // Compare key points
    return this.startPoint.isEqual(other.startPoint, tolerance) &&
           this.endPoint.isEqual(other.endPoint, tolerance) &&
           Math.abs(this.length - other.length) <= tolerance;
  }

  // Debug information
  toString(): string {
    return `${this.type.toUpperCase()}[${this.startPoint.toString()} -> ${this.endPoint.toString()}]`;
  }
}

/**
 * Utility class for reparameterized segments
 */
class ReparameterizedSegment extends Segment {
  private originalSegment: Segment;
  private paramFn: (t: number) => number;

  constructor(original: Segment, paramFn: (t: number) => number) {
    super(original.type, `reparam_${original.id}`);
    this.originalSegment = original;
    this.paramFn = paramFn;
  }

  get startPoint(): Vec2 {
    return this.originalSegment.pointAt(this.paramFn(0));
  }

  get endPoint(): Vec2 {
    return this.originalSegment.pointAt(this.paramFn(1));
  }

  get isClosed(): boolean {
    return this.originalSegment.isClosed;
  }

  pointAt(t: number): Vec2 {
    return this.originalSegment.pointAt(this.paramFn(t));
  }

  tangentAt(t: number): Vec2 {
    return this.originalSegment.tangentAt(this.paramFn(t));
  }

  normalAt(t: number): Vec2 {
    return this.originalSegment.normalAt(this.paramFn(t));
  }

  curvatureAt(t: number): number {
    return this.originalSegment.curvatureAt(this.paramFn(t));
  }

  distanceToPoint(point: Vec2): number {
    return this.originalSegment.distanceToPoint(point);
  }

  closestPointTo(point: Vec2): { point: Vec2; t: number; distance: number } {
    const result = this.originalSegment.closestPointTo(point);
    // Need to transform t parameter back through inverse of paramFn
    // This is complex for arbitrary functions, so we'll use approximation
    return result;
  }

  subdivide(t: number): [Segment, Segment] {
    // Complex to implement generically
    throw new Error('Subdivide not implemented for reparameterized segments');
  }

  transform(matrix: any): Segment {
    return new ReparameterizedSegment(this.originalSegment.transform(matrix), this.paramFn);
  }

  clone(): Segment {
    return new ReparameterizedSegment(this.originalSegment.clone(), this.paramFn);
  }

  protected computeLength(): number {
    return this.originalSegment.length;
  }

  protected computeBoundingBox(): BoundingBox {
    return this.originalSegment.boundingBox;
  }
}

// Utility functions for working with segments
export namespace SegmentUtils {
  export function createBoundingBox(points: Vec2[]): BoundingBox {
    if (points.length === 0) {
      return {
        min: Vec2.ZERO,
        max: Vec2.ZERO,
        center: Vec2.ZERO,
        size: Vec2.ZERO
      };
    }

    let minX = points[0].x, minY = points[0].y;
    let maxX = points[0].x, maxY = points[0].y;

    for (const point of points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }

    const min = new Vec2(minX, minY);
    const max = new Vec2(maxX, maxY);
    const center = min.add(max).multiply(0.5);
    const size = max.subtract(min);

    return { min, max, center, size };
  }

  export function expandBoundingBox(box: BoundingBox, margin: number): BoundingBox {
    const marginVec = new Vec2(margin, margin);
    return {
      min: box.min.subtract(marginVec),
      max: box.max.add(marginVec),
      center: box.center,
      size: box.size.add(marginVec.multiply(2))
    };
  }

  export function boundingBoxesIntersect(box1: BoundingBox, box2: BoundingBox): boolean {
    return !(box1.max.x < box2.min.x || box2.max.x < box1.min.x ||
             box1.max.y < box2.min.y || box2.max.y < box1.min.y);
  }
}