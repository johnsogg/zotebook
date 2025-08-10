import { Mat3 } from '../math/mat3.js';
import { Vec2 } from '../math/vec2.js';

import { Segment, SegmentType, SegmentIntersection, BoundingBox, SegmentUtils } from './segment.js';

/**
 * Immutable line segment implementation for Zotebook.
 * Represents a straight line between two points with efficient geometric operations.
 */
export class LineSegment extends Segment {
  private readonly _startPoint: Vec2;
  private readonly _endPoint: Vec2;
  
  // Cached computed properties
  private _direction?: Vec2;
  private _normal?: Vec2;

  constructor(start: Vec2, end: Vec2, id?: string) {
    super(SegmentType.LINE, id);
    this._startPoint = start;
    this._endPoint = end;
  }

  // Static factory methods
  static fromPoints(start: Vec2, end: Vec2): LineSegment {
    return new LineSegment(start, end);
  }

  static fromPointAndDirection(start: Vec2, direction: Vec2, length: number): LineSegment {
    const end = start.add(direction.normalized.multiply(length));
    return new LineSegment(start, end);
  }

  static fromPointAndAngle(start: Vec2, angle: number, length: number): LineSegment {
    const direction = Vec2.fromAngle(angle);
    return LineSegment.fromPointAndDirection(start, direction, length);
  }

  // Properties
  get startPoint(): Vec2 {
    return this._startPoint;
  }

  get endPoint(): Vec2 {
    return this._endPoint;
  }

  get isClosed(): boolean {
    return false;
  }

  get direction(): Vec2 {
    if (this._direction === undefined) {
      this._direction = this._endPoint.subtract(this._startPoint).normalized;
    }
    return this._direction;
  }

  get normal(): Vec2 {
    if (this._normal === undefined) {
      this._normal = this.direction.perpendicular;
    }
    return this._normal;
  }

  get angle(): number {
    return this.direction.angle;
  }

  get midpoint(): Vec2 {
    return this._startPoint.lerp(this._endPoint, 0.5);
  }

  // Parametric evaluation
  pointAt(t: number): Vec2 {
    return this._startPoint.lerp(this._endPoint, t);
  }

  tangentAt(t: number): Vec2 {
    return this.direction;
  }

  normalAt(t: number): Vec2 {
    return this.normal;
  }

  curvatureAt(t: number): number {
    return 0; // Lines have zero curvature
  }

  // Distance calculations
  distanceToPoint(point: Vec2): number {
    return this.closestPointTo(point).distance;
  }

  closestPointTo(point: Vec2): { point: Vec2; t: number; distance: number } {
    const lineVector = this._endPoint.subtract(this._startPoint);
    const pointVector = point.subtract(this._startPoint);
    
    if (lineVector.lengthSquared === 0) {
      // Degenerate line (start == end)
      const distance = point.distanceTo(this._startPoint);
      return {
        point: this._startPoint,
        t: 0,
        distance
      };
    }

    // Project point onto line
    const t = pointVector.dot(lineVector) / lineVector.lengthSquared;
    const clampedT = this.clampParameter(t);
    const closestPoint = this.pointAt(clampedT);
    const distance = point.distanceTo(closestPoint);

    return {
      point: closestPoint,
      t: t, // Return unclamped t for accurate parameter checking
      distance
    };
  }

  // Line-specific geometric operations
  signedDistanceToPoint(point: Vec2): number {
    // Positive distance means point is on the left side of the line (when looking from start to end)
    const toPoint = point.subtract(this._startPoint);
    return this.direction.cross(toPoint);
  }

  isPointOnLine(point: Vec2, tolerance: number = 1e-6): boolean {
    return Math.abs(this.signedDistanceToPoint(point)) <= tolerance;
  }

  isPointOnSegment(point: Vec2, tolerance: number = 1e-6): boolean {
    if (!this.isPointOnLine(point, tolerance)) {
      return false;
    }

    const { t } = this.closestPointTo(point);
    return t >= -tolerance && t <= 1 + tolerance;
  }

  // Intersection with other lines
  intersectWithLine(other: LineSegment, tolerance: number = 1e-6): SegmentIntersection | null {
    const lineVec1 = this._endPoint.subtract(this._startPoint);
    const lineVec2 = other._endPoint.subtract(other._startPoint);
    const startDiff = other._startPoint.subtract(this._startPoint);
    
    const cross = lineVec1.cross(lineVec2);
    
    if (Math.abs(cross) < tolerance) {
      // Lines are parallel or coincident
      return this.handleParallelLines(other, tolerance);
    }

    // Lines intersect at a single point
    const t1 = startDiff.cross(lineVec2) / cross;
    const t2 = startDiff.cross(lineVec1) / cross;
    
    const intersectionPoint = this.pointAt(t1);
    
    // Determine intersection type
    const isT1Valid = this.isValidParameter(t1);
    const isT2Valid = other.isValidParameter(t2);
    
    let type: 'endpoint' | 'interior' | 'tangent' | 'overlap';
    if (!isT1Valid || !isT2Valid) {
      type = 'endpoint';
    } else {
      const isT1Endpoint = t1 < tolerance || t1 > (1 - tolerance);
      const isT2Endpoint = t2 < tolerance || t2 > (1 - tolerance);
      type = (isT1Endpoint || isT2Endpoint) ? 'endpoint' : 'interior';
    }

    return {
      point: intersectionPoint,
      t1,
      t2,
      type
    };
  }

  private handleParallelLines(other: LineSegment, tolerance: number): SegmentIntersection | null {
    // Check if lines are coincident (same line)
    if (!this.isPointOnLine(other._startPoint, tolerance)) {
      return null; // Parallel but not coincident
    }

    // Lines are coincident - check for overlap
    const thisStart = 0;
    const thisEnd = 1;
    
    // Project other line's endpoints onto this line
    const otherStartProj = this.projectPointOntoLine(other._startPoint);
    const otherEndProj = this.projectPointOntoLine(other._endPoint);
    
    const otherStart = Math.min(otherStartProj, otherEndProj);
    const otherEnd = Math.max(otherStartProj, otherEndProj);
    
    // Check for overlap
    const overlapStart = Math.max(thisStart, otherStart);
    const overlapEnd = Math.min(thisEnd, otherEnd);
    
    if (overlapStart <= overlapEnd) {
      // There is overlap
      const overlapMidpoint = (overlapStart + overlapEnd) / 2;
      return {
        point: this.pointAt(overlapMidpoint),
        t1: overlapMidpoint,
        t2: this.mapParameterToOtherLine(overlapMidpoint, other),
        type: 'overlap'
      };
    }
    
    return null; // No overlap
  }

  private projectPointOntoLine(point: Vec2): number {
    const lineVector = this._endPoint.subtract(this._startPoint);
    const pointVector = point.subtract(this._startPoint);
    
    if (lineVector.lengthSquared === 0) {
      return 0;
    }
    
    return pointVector.dot(lineVector) / lineVector.lengthSquared;
  }

  private mapParameterToOtherLine(t: number, other: LineSegment): number {
    const pointOnThis = this.pointAt(t);
    return other.projectPointOntoLine(pointOnThis);
  }

  // Transformation
  transform(matrix: Mat3): LineSegment {
    const newStart = matrix.transformPoint(this._startPoint);
    const newEnd = matrix.transformPoint(this._endPoint);
    return new LineSegment(newStart, newEnd, this.id);
  }

  // Subdivision
  subdivide(t: number): [LineSegment, LineSegment] {
    const splitPoint = this.pointAt(t);
    const segment1 = new LineSegment(this._startPoint, splitPoint);
    const segment2 = new LineSegment(splitPoint, this._endPoint);
    return [segment1, segment2];
  }

  subdivideAtLength(length: number): [LineSegment, LineSegment] {
    const t = length / this.length;
    return this.subdivide(t);
  }

  // Offset operations
  offset(distance: number): LineSegment {
    const offsetVector = this.normal.multiply(distance);
    return new LineSegment(
      this._startPoint.add(offsetVector),
      this._endPoint.add(offsetVector)
    );
  }

  // Extension operations
  extendStart(distance: number): LineSegment {
    const extendVector = this.direction.multiply(-distance);
    return new LineSegment(
      this._startPoint.add(extendVector),
      this._endPoint
    );
  }

  extendEnd(distance: number): LineSegment {
    const extendVector = this.direction.multiply(distance);
    return new LineSegment(
      this._startPoint,
      this._endPoint.add(extendVector)
    );
  }

  extend(startDistance: number, endDistance: number): LineSegment {
    return this.extendStart(startDistance).extendEnd(endDistance);
  }

  // Cloning and copying
  clone(): LineSegment {
    return new LineSegment(this._startPoint, this._endPoint, this.id);
  }

  reverse(): LineSegment {
    return new LineSegment(this._endPoint, this._startPoint);
  }

  // Length computation
  protected computeLength(): number {
    return this._startPoint.distanceTo(this._endPoint);
  }

  // Bounding box computation
  protected computeBoundingBox(): BoundingBox {
    return SegmentUtils.createBoundingBox([this._startPoint, this._endPoint]);
  }

  // Specialized intersection overrides
  intersectWithSegment(other: Segment, tolerance: number = 1e-6): SegmentIntersection[] {
    if (other instanceof LineSegment) {
      const intersection = this.intersectWithLine(other, tolerance);
      return intersection ? [intersection] : [];
    }
    
    // Fall back to numerical method for other segment types
    return super.intersectWithSegment(other, tolerance);
  }

  // Equality testing
  isEqual(other: Segment, tolerance: number = 1e-6): boolean {
    if (!(other instanceof LineSegment)) {
      return false;
    }
    
    return (this._startPoint.isEqual(other._startPoint, tolerance) &&
            this._endPoint.isEqual(other._endPoint, tolerance)) ||
           (this._startPoint.isEqual(other._endPoint, tolerance) &&
            this._endPoint.isEqual(other._startPoint, tolerance));
  }

  // Serialization
  toJSON(): any {
    return {
      ...super.toJSON(),
      startPoint: this._startPoint.toJSON(),
      endPoint: this._endPoint.toJSON()
    };
  }

  static fromJSON(data: any): LineSegment {
    const start = Vec2.fromJSON(data.startPoint);
    const end = Vec2.fromJSON(data.endPoint);
    return new LineSegment(start, end, data.id);
  }

  // Additional utility methods
  isHorizontal(tolerance: number = 1e-6): boolean {
    return Math.abs(this._endPoint.y - this._startPoint.y) <= tolerance;
  }

  isVertical(tolerance: number = 1e-6): boolean {
    return Math.abs(this._endPoint.x - this._startPoint.x) <= tolerance;
  }

  isParallelTo(other: LineSegment, tolerance: number = 1e-6): boolean {
    return this.direction.isParallel(other.direction, tolerance);
  }

  isPerpendicularTo(other: LineSegment, tolerance: number = 1e-6): boolean {
    return this.direction.isPerpendicular(other.direction, tolerance);
  }

  // Debug information
  toString(): string {
    return `LINE[${this._startPoint.toString()} -> ${this._endPoint.toString()}] length=${this.length.toFixed(3)}`;
  }
}

// Utility functions for working with line segments
export namespace LineSegmentUtils {
  export function createHorizontalLine(y: number, x1: number, x2: number): LineSegment {
    return new LineSegment(new Vec2(x1, y), new Vec2(x2, y));
  }

  export function createVerticalLine(x: number, y1: number, y2: number): LineSegment {
    return new LineSegment(new Vec2(x, y1), new Vec2(x, y2));
  }

  export function createFromPointAngleLength(start: Vec2, angle: number, length: number): LineSegment {
    return LineSegment.fromPointAndAngle(start, angle, length);
  }

  export function findBestFitLine(points: Vec2[]): LineSegment | null {
    if (points.length < 2) {
      return null;
    }

    // Simple least squares linear regression
    const n = points.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

    for (const point of points) {
      sumX += point.x;
      sumY += point.y;
      sumXY += point.x * point.y;
      sumXX += point.x * point.x;
    }

    const meanX = sumX / n;
    const meanY = sumY / n;

    const denominator = sumXX - n * meanX * meanX;
    
    if (Math.abs(denominator) < 1e-10) {
      // Vertical line case
      const x = meanX;
      const minY = Math.min(...points.map(p => p.y));
      const maxY = Math.max(...points.map(p => p.y));
      return createVerticalLine(x, minY, maxY);
    }

    const slope = (sumXY - n * meanX * meanY) / denominator;
    const intercept = meanY - slope * meanX;

    // Find extent of line that covers the points
    const xMin = Math.min(...points.map(p => p.x));
    const xMax = Math.max(...points.map(p => p.x));

    const start = new Vec2(xMin, slope * xMin + intercept);
    const end = new Vec2(xMax, slope * xMax + intercept);

    return new LineSegment(start, end);
  }

  export function connectPoints(points: Vec2[]): LineSegment[] {
    const segments: LineSegment[] = [];
    
    for (let i = 0; i < points.length - 1; i++) {
      segments.push(new LineSegment(points[i], points[i + 1]));
    }
    
    return segments;
  }
}