import { describe, it, expect } from 'vitest';

import { Mat3 } from '../math/mat3.js';
import { Vec2 } from '../math/vec2.js';

import { ArcSegment, ArcSegmentUtils } from './arc-segment.js';
import { SegmentType } from './segment.js';

describe('ArcSegment', () => {
  describe('Construction', () => {
    it('should construct from center, radius, and angles', () => {
      const center = new Vec2(0, 0);
      const radius = 5;
      const startAngle = 0;
      const sweepAngle = Math.PI / 2;
      
      const arc = new ArcSegment(center, radius, startAngle, sweepAngle);
      
      expect(arc.center).toBe(center);
      expect(arc.radius).toBe(radius);
      expect(arc.startAngle).toBe(startAngle);
      expect(arc.sweepAngle).toBe(sweepAngle);
      expect(arc.type).toBe(SegmentType.ARC);
      expect(arc.isClosed).toBe(false);
    });

    it('should construct from center and angles', () => {
      const center = new Vec2(10, 20);
      const radius = 8;
      const startAngle = Math.PI / 4;
      const endAngle = 3 * Math.PI / 4;
      
      const arc = ArcSegment.fromCenterAndAngles(center, radius, startAngle, endAngle);
      
      expect(arc.center).toBe(center);
      expect(arc.radius).toBe(radius);
      expect(arc.startAngle).toBeCloseTo(startAngle);
      expect(arc.endAngle).toBeCloseTo(endAngle);
    });

    it('should construct from three points', () => {
      const p1 = new Vec2(1, 0);
      const p2 = new Vec2(0, 1);
      const p3 = new Vec2(-1, 0);
      
      const arc = ArcSegment.fromThreePoints(p1, p2, p3);
      
      expect(arc).not.toBeNull();
      expect(arc!.center.isEqual(Vec2.ZERO, 1e-10)).toBe(true);
      expect(arc!.radius).toBeCloseTo(1);
    });

    it('should return null for collinear points', () => {
      const p1 = new Vec2(0, 0);
      const p2 = new Vec2(1, 1);
      const p3 = new Vec2(2, 2);
      
      const arc = ArcSegment.fromThreePoints(p1, p2, p3);
      expect(arc).toBeNull();
    });

    it('should construct from start, end, and bulge', () => {
      const start = new Vec2(0, 0);
      const end = new Vec2(10, 0);
      const bulge = 0.5; // Corresponds to 90 degree arc
      
      const arc = ArcSegment.fromStartEndAndBulge(start, end, bulge);
      
      expect(arc).not.toBeNull();
      expect(arc.startPoint.isEqual(start, 1e-10)).toBe(true);
      expect(arc.endPoint.isEqual(end, 1e-10)).toBe(true);
      expect(arc.sweepAngle).toBeGreaterThan(0);
    });

    it('should throw on zero radius', () => {
      expect(() => new ArcSegment(Vec2.ZERO, 0, 0, Math.PI)).toThrow('Arc radius cannot be zero');
    });
  });

  describe('Properties', () => {
    const arc = new ArcSegment(Vec2.ZERO, 5, 0, Math.PI / 2);

    it('should calculate end angle correctly', () => {
      expect(arc.endAngle).toBeCloseTo(Math.PI / 2);
    });

    it('should provide start and end points', () => {
      expect(arc.startPoint.isEqual(new Vec2(5, 0), 1e-10)).toBe(true);
      expect(arc.endPoint.isEqual(new Vec2(0, 5), 1e-10)).toBe(true);
    });

    it('should detect closed arcs', () => {
      const fullCircle = new ArcSegment(Vec2.ZERO, 5, 0, Math.PI * 2);
      const quarterArc = new ArcSegment(Vec2.ZERO, 5, 0, Math.PI / 2);
      
      expect(fullCircle.isClosed).toBe(true);
      expect(quarterArc.isClosed).toBe(false);
    });

    it('should detect clockwise arcs', () => {
      const ccw = new ArcSegment(Vec2.ZERO, 5, 0, Math.PI / 2);
      const cw = new ArcSegment(Vec2.ZERO, 5, 0, -Math.PI / 2);
      
      expect(ccw.isClockwise).toBe(false);
      expect(cw.isClockwise).toBe(true);
    });

    it('should provide midpoint', () => {
      const midpoint = arc.midpoint;
      const expectedAngle = Math.PI / 4;
      const expected = new Vec2(5 * Math.cos(expectedAngle), 5 * Math.sin(expectedAngle));
      
      expect(midpoint.isEqual(expected, 1e-10)).toBe(true);
    });
  });

  describe('Parametric Evaluation', () => {
    const arc = new ArcSegment(Vec2.ZERO, 5, 0, Math.PI / 2);

    it('should evaluate point at parameter', () => {
      expect(arc.pointAt(0).isEqual(new Vec2(5, 0), 1e-10)).toBe(true);
      expect(arc.pointAt(1).isEqual(new Vec2(0, 5), 1e-10)).toBe(true);
      
      const midPoint = arc.pointAt(0.5);
      const expectedMid = new Vec2(5 * Math.cos(Math.PI / 4), 5 * Math.sin(Math.PI / 4));
      expect(midPoint.isEqual(expectedMid, 1e-10)).toBe(true);
    });

    it('should provide tangent at parameter', () => {
      const tangentAtStart = arc.tangentAt(0);
      const expectedTangent = new Vec2(0, 1); // Perpendicular to radius at start
      
      expect(tangentAtStart.isEqual(expectedTangent, 1e-10)).toBe(true);
    });

    it('should provide normal at parameter', () => {
      const normalAtStart = arc.normalAt(0);
      const expectedNormal = new Vec2(1, 0); // Pointing outward from center
      
      expect(normalAtStart.isEqual(expectedNormal, 1e-10)).toBe(true);
    });

    it('should provide constant curvature', () => {
      const expectedCurvature = 1 / 5; // 1/radius
      
      expect(arc.curvatureAt(0)).toBeCloseTo(expectedCurvature);
      expect(arc.curvatureAt(0.5)).toBeCloseTo(expectedCurvature);
      expect(arc.curvatureAt(1)).toBeCloseTo(expectedCurvature);
    });

    it('should calculate angle at parameter', () => {
      expect(arc.angleAt(0)).toBeCloseTo(0);
      expect(arc.angleAt(0.5)).toBeCloseTo(Math.PI / 4);
      expect(arc.angleAt(1)).toBeCloseTo(Math.PI / 2);
    });
  });

  describe('Distance Calculations', () => {
    const arc = new ArcSegment(Vec2.ZERO, 5, 0, Math.PI / 2);

    it('should calculate distance to point on arc', () => {
      const pointOnArc = new Vec2(5, 0);
      expect(arc.distanceToPoint(pointOnArc)).toBeCloseTo(0);
    });

    it('should calculate distance to point inside arc', () => {
      const pointInside = new Vec2(3, 0);
      expect(arc.distanceToPoint(pointInside)).toBeCloseTo(2); // 5 - 3
    });

    it('should calculate distance to point outside arc range', () => {
      const pointOutside = new Vec2(0, -5);
      const expectedDistance = Math.sqrt(50); // Distance to start point
      expect(arc.distanceToPoint(pointOutside)).toBeCloseTo(expectedDistance);
    });

    it('should calculate distance to center', () => {
      expect(arc.distanceToPoint(Vec2.ZERO)).toBeCloseTo(5);
    });

    it('should find closest point on arc', () => {
      const point = new Vec2(4, 0);
      const result = arc.closestPointTo(point);
      
      expect(result.point.isEqual(new Vec2(5, 0), 1e-10)).toBe(true);
      expect(result.t).toBeCloseTo(0);
      expect(result.distance).toBeCloseTo(1);
    });

    it('should find closest endpoint for points outside angular range', () => {
      const point = new Vec2(0, -5);
      const result = arc.closestPointTo(point);
      
      expect(result.t).toBeCloseTo(0); // Closest to start point
      expect(result.distance).toBeCloseTo(Math.sqrt(50));
    });
  });

  describe('Angular Operations', () => {
    const arc = new ArcSegment(Vec2.ZERO, 5, 0, Math.PI / 2);

    it('should detect if angle is contained in arc', () => {
      expect(arc.containsAngle(Math.PI / 4)).toBe(true);
      expect(arc.containsAngle(Math.PI)).toBe(false);
      expect(arc.containsAngle(-Math.PI / 4)).toBe(false);
    });

    it('should convert angle to parameter', () => {
      expect(arc.angleToParameter(0)).toBeCloseTo(0);
      expect(arc.angleToParameter(Math.PI / 4)).toBeCloseTo(0.5);
      expect(arc.angleToParameter(Math.PI / 2)).toBeCloseTo(1);
    });

    it('should handle angle wrapping', () => {
      const arc360 = new ArcSegment(Vec2.ZERO, 5, -Math.PI / 4, Math.PI / 2);
      expect(arc360.containsAngle(0)).toBe(true);
    });
  });

  describe('Transformations', () => {
    const arc = new ArcSegment(Vec2.ZERO, 5, 0, Math.PI / 2);

    it('should apply translation', () => {
      const translation = Mat3.translation(10, 20);
      const transformed = arc.transform(translation);
      
      expect(transformed.center.isEqual(new Vec2(10, 20))).toBe(true);
      expect(transformed.radius).toBe(5);
      expect(transformed.startAngle).toBeCloseTo(0);
      expect(transformed.sweepAngle).toBeCloseTo(Math.PI / 2);
    });

    it('should apply uniform scaling', () => {
      const scale = Mat3.scale(2);
      const transformed = arc.transform(scale);
      
      expect(transformed.center.isEqual(Vec2.ZERO)).toBe(true);
      expect(transformed.radius).toBe(10);
      expect(transformed.startAngle).toBeCloseTo(0);
    });

    it('should apply rotation', () => {
      const rotation = Mat3.rotation(Math.PI / 4);
      const transformed = arc.transform(rotation);
      
      expect(transformed.center.isEqual(Vec2.ZERO)).toBe(true);
      expect(transformed.radius).toBe(5);
      expect(transformed.startAngle).toBeCloseTo(Math.PI / 4);
      expect(transformed.sweepAngle).toBeCloseTo(Math.PI / 2);
    });

    it('should throw on non-uniform scaling', () => {
      const nonUniformScale = Mat3.scale(2, 3);
      expect(() => arc.transform(nonUniformScale)).toThrow('Non-uniform scaling');
    });
  });

  describe('Subdivision', () => {
    const arc = new ArcSegment(Vec2.ZERO, 5, 0, Math.PI);

    it('should subdivide at parameter', () => {
      const [arc1, arc2] = arc.subdivide(0.5);
      
      expect(arc1.startAngle).toBeCloseTo(0);
      expect(arc1.sweepAngle).toBeCloseTo(Math.PI / 2);
      expect(arc2.startAngle).toBeCloseTo(Math.PI / 2);
      expect(arc2.sweepAngle).toBeCloseTo(Math.PI / 2);
      
      expect(arc1.endPoint.isEqual(arc2.startPoint, 1e-10)).toBe(true);
    });
  });

  describe('Length Calculation', () => {
    it('should calculate arc length correctly', () => {
      const quarterCircle = new ArcSegment(Vec2.ZERO, 10, 0, Math.PI / 2);
      const expectedLength = 10 * Math.PI / 2; // r * θ
      
      expect(quarterCircle.length).toBeCloseTo(expectedLength);
    });

    it('should handle full circle', () => {
      const fullCircle = new ArcSegment(Vec2.ZERO, 5, 0, Math.PI * 2);
      const expectedLength = 2 * Math.PI * 5;
      
      expect(fullCircle.length).toBeCloseTo(expectedLength);
    });

    it('should handle clockwise arcs', () => {
      const clockwiseArc = new ArcSegment(Vec2.ZERO, 10, 0, -Math.PI / 2);
      const expectedLength = 10 * Math.PI / 2;
      
      expect(clockwiseArc.length).toBeCloseTo(expectedLength);
    });
  });

  describe('Bounding Box', () => {
    it('should compute bounding box for quarter arc', () => {
      const arc = new ArcSegment(Vec2.ZERO, 5, 0, Math.PI / 2);
      const bbox = arc.boundingBox;
      
      expect(bbox.min.isEqual(new Vec2(0, 0), 1e-10)).toBe(true);
      expect(bbox.max.isEqual(new Vec2(5, 5), 1e-10)).toBe(true);
    });

    it('should compute bounding box for arc crossing axes', () => {
      const arc = new ArcSegment(Vec2.ZERO, 5, -Math.PI / 4, Math.PI / 2);
      const bbox = arc.boundingBox;
      
      // Should include the positive x-axis crossing
      expect(bbox.max.x).toBeCloseTo(5);
    });

    it('should compute bounding box for full circle', () => {
      const circle = new ArcSegment(new Vec2(10, 20), 5, 0, Math.PI * 2);
      const bbox = circle.boundingBox;
      
      expect(bbox.min.isEqual(new Vec2(5, 15))).toBe(true);
      expect(bbox.max.isEqual(new Vec2(15, 25))).toBe(true);
      expect(bbox.center.isEqual(new Vec2(10, 20))).toBe(true);
    });
  });

  describe('Cloning and Reversal', () => {
    const arc = new ArcSegment(new Vec2(1, 2), 5, Math.PI / 4, Math.PI / 2);

    it('should clone correctly', () => {
      const cloned = arc.clone();
      
      expect(cloned).not.toBe(arc);
      expect(cloned.isEqual(arc)).toBe(true);
    });

    it('should reverse correctly', () => {
      const reversed = arc.reverse();
      
      expect(reversed.startPoint.isEqual(arc.endPoint, 1e-10)).toBe(true);
      expect(reversed.endPoint.isEqual(arc.startPoint, 1e-10)).toBe(true);
      expect(reversed.sweepAngle).toBeCloseTo(-arc.sweepAngle);
      expect(reversed.length).toBeCloseTo(arc.length);
    });
  });

  describe('Equality Testing', () => {
    const arc1 = new ArcSegment(Vec2.ZERO, 5, 0, Math.PI / 2);
    const arc2 = new ArcSegment(Vec2.ZERO, 5, 0, Math.PI / 2);
    const arc3 = new ArcSegment(new Vec2(1, 0), 5, 0, Math.PI / 2);

    it('should detect equal arcs', () => {
      expect(arc1.isEqual(arc2)).toBe(true);
    });

    it('should detect different arcs', () => {
      expect(arc1.isEqual(arc3)).toBe(false);
    });
  });

  describe('Serialization', () => {
    it('should serialize and deserialize correctly', () => {
      const arc = new ArcSegment(new Vec2(1, 2), 5, Math.PI / 4, Math.PI / 2);
      const json = arc.toJSON();
      const restored = ArcSegment.fromJSON(json);
      
      expect(restored.isEqual(arc)).toBe(true);
    });
  });
});

describe('ArcSegmentUtils', () => {
  describe('Factory Methods', () => {
    it('should create full circle', () => {
      const circle = ArcSegmentUtils.createFullCircle(Vec2.ZERO, 10);
      
      expect(circle.isClosed).toBe(true);
      expect(circle.radius).toBe(10);
      expect(Math.abs(circle.sweepAngle)).toBeCloseTo(Math.PI * 2);
    });

    it('should create semicircle', () => {
      const semicircle = ArcSegmentUtils.createSemiCircle(Vec2.ZERO, 5);
      
      expect(semicircle.sweepAngle).toBeCloseTo(Math.PI);
      expect(semicircle.length).toBeCloseTo(Math.PI * 5);
    });

    it('should create quarter circle', () => {
      const quarter = ArcSegmentUtils.createQuarterCircle(Vec2.ZERO, 8);
      
      expect(quarter.sweepAngle).toBeCloseTo(Math.PI / 2);
      expect(quarter.length).toBeCloseTo(Math.PI * 4);
    });

    it('should create arc from start, end, and radius', () => {
      const start = new Vec2(-5, 0);
      const end = new Vec2(5, 0);
      const radius = 5;
      
      const arc = ArcSegmentUtils.createFromStartEndRadius(start, end, radius, false);
      
      expect(arc).not.toBeNull();
      expect(arc!.startPoint.isEqual(start, 1e-10)).toBe(true);
      expect(arc!.endPoint.isEqual(end, 1e-10)).toBe(true);
      expect(arc!.radius).toBeCloseTo(radius);
    });

    it('should return null for invalid radius', () => {
      const start = new Vec2(0, 0);
      const end = new Vec2(10, 0);
      const radius = 3; // Too small for the chord length
      
      const arc = ArcSegmentUtils.createFromStartEndRadius(start, end, radius);
      expect(arc).toBeNull();
    });

    it('should return null for coincident points', () => {
      const point = new Vec2(5, 5);
      const arc = ArcSegmentUtils.createFromStartEndRadius(point, point, 10);
      expect(arc).toBeNull();
    });

    it('should create large arc when requested', () => {
      const start = new Vec2(-5, 0);
      const end = new Vec2(5, 0);
      const radius = 8;
      
      const smallArc = ArcSegmentUtils.createFromStartEndRadius(start, end, radius, false);
      const largeArc = ArcSegmentUtils.createFromStartEndRadius(start, end, radius, true);
      
      expect(smallArc).not.toBeNull();
      expect(largeArc).not.toBeNull();
      expect(Math.abs(largeArc!.sweepAngle)).toBeGreaterThan(Math.abs(smallArc!.sweepAngle));
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle typical CAD arc creation', () => {
      // Common scenario: create arc tangent to two lines
      const start = new Vec2(0, 0);
      const end = new Vec2(10, 10);
      const bulge = 0.414; // 45 degree arc
      
      const arc = ArcSegment.fromStartEndAndBulge(start, end, bulge);
      
      expect(arc.startPoint.isEqual(start, 1e-10)).toBe(true);
      expect(arc.endPoint.isEqual(end, 1e-10)).toBe(true);
      expect(arc.sweepAngle).toBeGreaterThan(0);
    });

    it('should handle precision requirements', () => {
      // High precision arc for manufacturing applications
      const center = new Vec2(100.123456789, 200.987654321);
      const radius = 50.0000001;
      const startAngle = 0.123456789;
      const sweepAngle = 1.234567891;
      
      const arc = new ArcSegment(center, radius, startAngle, sweepAngle);
      
      expect(arc.center.x).toBeCloseTo(100.123456789, 8);
      expect(arc.radius).toBeCloseTo(50.0000001, 8);
    });
  });
});