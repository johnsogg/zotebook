import { Mat3 } from '../math/mat3.js';
import { Vec2 } from '../math/vec2.js';

import { Segment, SegmentType, SegmentIntersection, BoundingBox, SegmentUtils } from './segment.js';

/**
 * Immutable arc segment implementation for Zotebook.
 * Represents a circular arc defined by center, radius, start angle, and sweep angle.
 */
export class ArcSegment extends Segment {
  private readonly _center: Vec2;
  private readonly _radius: number;
  private readonly _startAngle: number; // In radians
  private readonly _sweepAngle: number; // In radians (positive = counterclockwise)
  
  // Cached computed properties
  private _startPoint?: Vec2;
  private _endPoint?: Vec2;
  private _endAngle?: number;

  constructor(center: Vec2, radius: number, startAngle: number, sweepAngle: number, id?: string) {
    super(SegmentType.ARC, id);
    this._center = center;
    this._radius = Math.abs(radius);
    this._startAngle = this.normalizeAngle(startAngle);
    this._sweepAngle = sweepAngle;
    
    if (this._radius === 0) {
      throw new Error('Arc radius cannot be zero');
    }
  }

  // Static factory methods
  static fromCenterAndAngles(center: Vec2, radius: number, startAngle: number, endAngle: number): ArcSegment {
    let sweepAngle = endAngle - startAngle;
    
    // Normalize sweep angle to be within [-2π, 2π]
    while (sweepAngle > Math.PI * 2) sweepAngle -= Math.PI * 2;
    while (sweepAngle < -Math.PI * 2) sweepAngle += Math.PI * 2;
    
    return new ArcSegment(center, radius, startAngle, sweepAngle);
  }

  static fromThreePoints(p1: Vec2, p2: Vec2, p3: Vec2): ArcSegment | null {
    // Find circle through three points
    const circle = ArcSegment.findCircleFromThreePoints(p1, p2, p3);
    if (!circle) {
      return null; // Points are collinear
    }

    const { center, radius } = circle;
    
    // Calculate angles
    const angle1 = Math.atan2(p1.y - center.y, p1.x - center.x);
    const angle2 = Math.atan2(p2.y - center.y, p2.x - center.x);
    const angle3 = Math.atan2(p3.y - center.y, p3.x - center.x);
    
    // Determine arc direction and sweep angle
    const sweepAngle = ArcSegment.calculateSweepAngle(angle1, angle3, angle2);
    
    return new ArcSegment(center, radius, angle1, sweepAngle);
  }

  static fromStartEndAndBulge(start: Vec2, end: Vec2, bulge: number): ArcSegment {
    // Bulge factor method common in CAD systems
    // bulge = tan(sweep_angle / 4)
    const chord = end.subtract(start);
    const chordLength = chord.length;
    
    if (chordLength === 0 || bulge === 0) {
      throw new Error('Cannot create arc from coincident points or zero bulge');
    }
    
    const sweepAngle = 4 * Math.atan(Math.abs(bulge));
    const radius = chordLength / (2 * Math.sin(sweepAngle / 2));
    
    // Calculate center using sagitta method
    const chordMidpoint = start.lerp(end, 0.5);
    const chordDirection = chord.normalized;
    const perpendicular = chordDirection.perpendicular;
    
    // Distance from chord midpoint to center
    const h = Math.sqrt(radius * radius - (chordLength / 2) * (chordLength / 2));
    const centerOffset = perpendicular.multiply(h * (bulge > 0 ? 1 : -1));
    const center = chordMidpoint.add(centerOffset);
    
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    const actualSweepAngle = sweepAngle * (bulge > 0 ? 1 : -1);
    
    return new ArcSegment(center, radius, startAngle, actualSweepAngle);
  }

  // Properties
  get center(): Vec2 {
    return this._center;
  }

  get radius(): number {
    return this._radius;
  }

  get startAngle(): number {
    return this._startAngle;
  }

  get sweepAngle(): number {
    return this._sweepAngle;
  }

  get endAngle(): number {
    if (this._endAngle === undefined) {
      this._endAngle = this.normalizeAngle(this._startAngle + this._sweepAngle);
    }
    return this._endAngle;
  }

  get startPoint(): Vec2 {
    if (this._startPoint === undefined) {
      this._startPoint = this._center.add(Vec2.fromPolar(this._radius, this._startAngle));
    }
    return this._startPoint;
  }

  get endPoint(): Vec2 {
    if (this._endPoint === undefined) {
      this._endPoint = this._center.add(Vec2.fromPolar(this._radius, this.endAngle));
    }
    return this._endPoint;
  }

  get isClosed(): boolean {
    return Math.abs(Math.abs(this._sweepAngle) - Math.PI * 2) < 1e-6;
  }

  get isClockwise(): boolean {
    return this._sweepAngle < 0;
  }

  get midpoint(): Vec2 {
    return this.pointAt(0.5);
  }

  // Parametric evaluation
  pointAt(t: number): Vec2 {
    const angle = this._startAngle + this._sweepAngle * t;
    return this._center.add(Vec2.fromPolar(this._radius, angle));
  }

  tangentAt(t: number): Vec2 {
    const angle = this._startAngle + this._sweepAngle * t;
    const tangentAngle = angle + (this._sweepAngle > 0 ? Math.PI / 2 : -Math.PI / 2);
    return Vec2.fromAngle(tangentAngle);
  }

  normalAt(t: number): Vec2 {
    const angle = this._startAngle + this._sweepAngle * t;
    const normalAngle = angle + (this._sweepAngle > 0 ? 0 : Math.PI);
    return Vec2.fromAngle(normalAngle);
  }

  curvatureAt(t: number): number {
    return 1 / this._radius;
  }

  angleAt(t: number): number {
    return this._startAngle + this._sweepAngle * t;
  }

  // Distance calculations
  distanceToPoint(point: Vec2): number {
    const centerToPoint = point.subtract(this._center);
    const distanceToCenter = centerToPoint.length;
    
    if (distanceToCenter === 0) {
      return this._radius; // Point is at center
    }
    
    const pointAngle = Math.atan2(centerToPoint.y, centerToPoint.x);
    
    if (this.containsAngle(pointAngle)) {
      // Point is within angular range of arc
      return Math.abs(distanceToCenter - this._radius);
    } else {
      // Point is outside angular range - find distance to endpoints
      const distToStart = point.distanceTo(this.startPoint);
      const distToEnd = point.distanceTo(this.endPoint);
      return Math.min(distToStart, distToEnd);
    }
  }

  closestPointTo(point: Vec2): { point: Vec2; t: number; distance: number } {
    const centerToPoint = point.subtract(this._center);
    const distanceToCenter = centerToPoint.length;
    
    if (distanceToCenter === 0) {
      // Point is at center - return start point
      return {
        point: this.startPoint,
        t: 0,
        distance: this._radius
      };
    }
    
    const pointAngle = Math.atan2(centerToPoint.y, centerToPoint.x);
    
    if (this.containsAngle(pointAngle)) {
      // Point is within angular range - closest point is on arc
      const closestPoint = this._center.add(centerToPoint.normalized.multiply(this._radius));
      const t = this.angleToParameter(pointAngle);
      const distance = Math.abs(distanceToCenter - this._radius);
      
      return { point: closestPoint, t, distance };
    } else {
      // Point is outside angular range - check endpoints
      const distToStart = point.distanceTo(this.startPoint);
      const distToEnd = point.distanceTo(this.endPoint);
      
      if (distToStart <= distToEnd) {
        return { point: this.startPoint, t: 0, distance: distToStart };
      } else {
        return { point: this.endPoint, t: 1, distance: distToEnd };
      }
    }
  }

  // Arc-specific methods
  containsAngle(angle: number): boolean {
    const normalizedAngle = this.normalizeAngle(angle);
    const startAngle = this._startAngle;
    const endAngle = this.endAngle;
    
    if (this._sweepAngle > 0) {
      // Counter-clockwise
      if (startAngle <= endAngle) {
        return normalizedAngle >= startAngle && normalizedAngle <= endAngle;
      } else {
        return normalizedAngle >= startAngle || normalizedAngle <= endAngle;
      }
    } else {
      // Clockwise
      if (startAngle >= endAngle) {
        return normalizedAngle <= startAngle && normalizedAngle >= endAngle;
      } else {
        return normalizedAngle <= startAngle || normalizedAngle >= endAngle;
      }
    }
  }

  angleToParameter(angle: number): number {
    let normalizedAngle = this.normalizeAngle(angle);
    const startAngle = this._startAngle;
    
    // Handle angle wrapping
    if (this._sweepAngle > 0) {
      while (normalizedAngle < startAngle) {
        normalizedAngle += Math.PI * 2;
      }
    } else {
      while (normalizedAngle > startAngle) {
        normalizedAngle -= Math.PI * 2;
      }
    }
    
    return (normalizedAngle - startAngle) / this._sweepAngle;
  }

  // Transformation
  transform(matrix: Mat3): ArcSegment {
    // For non-uniform scaling, we need to convert to a more general curve
    const scale = matrix.scale;
    if (Math.abs(scale.x - scale.y) > 1e-6) {
      throw new Error('Non-uniform scaling of arcs not supported - would create ellipse');
    }
    
    const newCenter = matrix.transformPoint(this._center);
    const newRadius = this._radius * Math.abs(scale.x);
    
    // Handle rotation
    const rotation = matrix.rotation;
    const newStartAngle = this._startAngle + rotation;
    
    return new ArcSegment(newCenter, newRadius, newStartAngle, this._sweepAngle, this.id);
  }

  // Subdivision
  subdivide(t: number): [ArcSegment, ArcSegment] {
    const splitAngle = this._startAngle + this._sweepAngle * t;
    
    const arc1 = new ArcSegment(
      this._center,
      this._radius,
      this._startAngle,
      this._sweepAngle * t
    );
    
    const arc2 = new ArcSegment(
      this._center,
      this._radius,
      splitAngle,
      this._sweepAngle * (1 - t)
    );
    
    return [arc1, arc2];
  }

  // Cloning and copying
  clone(): ArcSegment {
    return new ArcSegment(this._center, this._radius, this._startAngle, this._sweepAngle, this.id);
  }

  reverse(): ArcSegment {
    return new ArcSegment(
      this._center,
      this._radius,
      this.endAngle,
      -this._sweepAngle
    );
  }

  // Length computation
  protected computeLength(): number {
    return this._radius * Math.abs(this._sweepAngle);
  }

  // Bounding box computation
  protected computeBoundingBox(): BoundingBox {
    const points: Vec2[] = [];
    
    // For full circles, just use the center +/- radius
    if (this.isClosed) {
      points.push(
        this._center.add(new Vec2(-this._radius, -this._radius)),
        this._center.add(new Vec2(this._radius, this._radius))
      );
    } else {
      // Add start and end points
      points.push(this.startPoint, this.endPoint);
      
      // Check if arc crosses axis-aligned directions
      const angles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
      
      for (const angle of angles) {
        if (this.containsAngle(angle)) {
          points.push(this._center.add(Vec2.fromPolar(this._radius, angle)));
        }
      }
    }
    
    return SegmentUtils.createBoundingBox(points);
  }

  // Utility methods
  private normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  private static findCircleFromThreePoints(p1: Vec2, p2: Vec2, p3: Vec2): { center: Vec2; radius: number } | null {
    // Calculate circle center using perpendicular bisectors
    const mid1 = p1.lerp(p2, 0.5);
    const mid2 = p2.lerp(p3, 0.5);
    
    const dir1 = p2.subtract(p1).perpendicular;
    const dir2 = p3.subtract(p2).perpendicular;
    
    // Find intersection of perpendicular bisectors
    const det = dir1.cross(dir2);
    if (Math.abs(det) < 1e-10) {
      return null; // Points are collinear
    }
    
    const diff = mid2.subtract(mid1);
    const t = diff.cross(dir2) / det;
    
    const center = mid1.add(dir1.multiply(t));
    const radius = center.distanceTo(p1);
    
    return { center, radius };
  }

  private static calculateSweepAngle(startAngle: number, endAngle: number, midAngle: number): number {
    // Determine if we should go clockwise or counter-clockwise
    const ccwSweep = endAngle - startAngle;
    const cwSweep = ccwSweep - 2 * Math.PI * Math.sign(ccwSweep);
    
    // Check which direction contains the middle point
    const normalizedMid = midAngle;
    
    // Simple heuristic: choose the sweep that keeps the middle point closer to the arc
    return Math.abs(ccwSweep) <= Math.PI ? ccwSweep : cwSweep;
  }

  // Equality testing
  isEqual(other: Segment, tolerance: number = 1e-6): boolean {
    if (!(other instanceof ArcSegment)) {
      return false;
    }
    
    return this._center.isEqual(other._center, tolerance) &&
           Math.abs(this._radius - other._radius) <= tolerance &&
           Math.abs(this._startAngle - other._startAngle) <= tolerance &&
           Math.abs(this._sweepAngle - other._sweepAngle) <= tolerance;
  }

  // Serialization
  toJSON(): any {
    return {
      ...super.toJSON(),
      center: this._center.toJSON(),
      radius: this._radius,
      startAngle: this._startAngle,
      sweepAngle: this._sweepAngle
    };
  }

  static fromJSON(data: any): ArcSegment {
    const center = Vec2.fromJSON(data.center);
    return new ArcSegment(center, data.radius, data.startAngle, data.sweepAngle, data.id);
  }

  // Debug information
  toString(): string {
    const degrees = (rad: number) => (rad * 180 / Math.PI).toFixed(1);
    return `ARC[center=${this._center.toString()}, r=${this._radius.toFixed(3)}, ` +
           `start=${degrees(this._startAngle)}°, sweep=${degrees(this._sweepAngle)}°]`;
  }
}

// Utility functions for working with arc segments
export namespace ArcSegmentUtils {
  export function createFullCircle(center: Vec2, radius: number): ArcSegment {
    return new ArcSegment(center, radius, 0, Math.PI * 2);
  }

  export function createSemiCircle(center: Vec2, radius: number, startAngle: number = 0): ArcSegment {
    return new ArcSegment(center, radius, startAngle, Math.PI);
  }

  export function createQuarterCircle(center: Vec2, radius: number, startAngle: number = 0): ArcSegment {
    return new ArcSegment(center, radius, startAngle, Math.PI / 2);
  }

  export function createFromStartEndRadius(start: Vec2, end: Vec2, radius: number, largeArc: boolean = false): ArcSegment | null {
    const chord = end.subtract(start);
    const chordLength = chord.length;
    
    if (chordLength === 0) {
      return null; // Same point
    }
    
    if (radius < chordLength / 2) {
      return null; // Radius too small
    }
    
    const chordMidpoint = start.lerp(end, 0.5);
    const chordDirection = chord.normalized;
    const perpendicular = chordDirection.perpendicular;
    
    const h = Math.sqrt(radius * radius - (chordLength / 2) * (chordLength / 2));
    const centerOffset = perpendicular.multiply(largeArc ? -h : h);
    const center = chordMidpoint.add(centerOffset);
    
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
    
    let sweepAngle = endAngle - startAngle;
    
    // Adjust sweep angle based on largeArc flag
    if (largeArc) {
      if (Math.abs(sweepAngle) < Math.PI) {
        sweepAngle += sweepAngle > 0 ? -Math.PI * 2 : Math.PI * 2;
      }
    } else {
      if (Math.abs(sweepAngle) > Math.PI) {
        sweepAngle += sweepAngle > 0 ? -Math.PI * 2 : Math.PI * 2;
      }
    }
    
    return new ArcSegment(center, radius, startAngle, sweepAngle);
  }
}