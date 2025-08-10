import { describe, it, expect } from 'vitest';

import { Mat3 } from '../math/mat3.js';
import { Vec2 } from '../math/vec2.js';

import { LineSegment, LineSegmentUtils } from './line-segment.js';
import { SegmentType } from './segment.js';

describe('LineSegment', () => {
  describe('Construction', () => {
    it('should construct from two points', () => {
      const start = new Vec2(0, 0);
      const end = new Vec2(10, 5);
      const line = new LineSegment(start, end);

      expect(line.startPoint).toBe(start);
      expect(line.endPoint).toBe(end);
      expect(line.type).toBe(SegmentType.LINE);
      expect(line.isClosed).toBe(false);
    });

    it('should construct from factory methods', () => {
      const start = new Vec2(1, 2);
      const end = new Vec2(4, 6);
      const line = LineSegment.fromPoints(start, end);

      expect(line.startPoint.isEqual(start)).toBe(true);
      expect(line.endPoint.isEqual(end)).toBe(true);
    });

    it('should construct from point and direction', () => {
      const start = new Vec2(0, 0);
      const direction = new Vec2(1, 1);
      const length = 10;
      const line = LineSegment.fromPointAndDirection(start, direction, length);

      expect(line.startPoint.isEqual(start)).toBe(true);
      expect(line.length).toBeCloseTo(length);
      expect(line.direction.isEqual(direction.normalized)).toBe(true);
    });

    it('should construct from point, angle, and length', () => {
      const start = new Vec2(0, 0);
      const angle = Math.PI / 4; // 45 degrees
      const length = 10;
      const line = LineSegment.fromPointAndAngle(start, angle, length);

      expect(line.startPoint.isEqual(start)).toBe(true);
      expect(line.length).toBeCloseTo(length);
      expect(line.angle).toBeCloseTo(angle);
    });
  });

  describe('Properties', () => {
    const line = new LineSegment(new Vec2(0, 0), new Vec2(6, 8));

    it('should calculate length correctly', () => {
      expect(line.length).toBe(10); // 3-4-5 triangle scaled by 2
    });

    it('should provide direction vector', () => {
      const expectedDirection = new Vec2(0.6, 0.8); // Normalized (6, 8)
      expect(line.direction.isEqual(expectedDirection, 1e-10)).toBe(true);
    });

    it('should provide normal vector', () => {
      const expectedNormal = new Vec2(-0.8, 0.6); // Perpendicular to direction
      expect(line.normal.isEqual(expectedNormal, 1e-10)).toBe(true);
    });

    it('should calculate angle correctly', () => {
      const expectedAngle = Math.atan2(8, 6);
      expect(line.angle).toBeCloseTo(expectedAngle);
    });

    it('should provide midpoint', () => {
      const expectedMidpoint = new Vec2(3, 4);
      expect(line.midpoint.isEqual(expectedMidpoint)).toBe(true);
    });
  });

  describe('Parametric Evaluation', () => {
    const line = new LineSegment(new Vec2(0, 0), new Vec2(10, 20));

    it('should evaluate point at parameter', () => {
      expect(line.pointAt(0).isEqual(new Vec2(0, 0))).toBe(true);
      expect(line.pointAt(1).isEqual(new Vec2(10, 20))).toBe(true);
      expect(line.pointAt(0.5).isEqual(new Vec2(5, 10))).toBe(true);
    });

    it('should provide constant tangent', () => {
      const tangent1 = line.tangentAt(0);
      const tangent2 = line.tangentAt(0.5);
      const tangent3 = line.tangentAt(1);

      expect(tangent1.isEqual(tangent2)).toBe(true);
      expect(tangent2.isEqual(tangent3)).toBe(true);
    });

    it('should provide constant normal', () => {
      const normal1 = line.normalAt(0);
      const normal2 = line.normalAt(0.5);
      const normal3 = line.normalAt(1);

      expect(normal1.isEqual(normal2)).toBe(true);
      expect(normal2.isEqual(normal3)).toBe(true);
    });

    it('should have zero curvature', () => {
      expect(line.curvatureAt(0)).toBe(0);
      expect(line.curvatureAt(0.5)).toBe(0);
      expect(line.curvatureAt(1)).toBe(0);
    });
  });

  describe('Distance Calculations', () => {
    const line = new LineSegment(new Vec2(0, 0), new Vec2(10, 0)); // Horizontal line

    it('should calculate distance to point on line', () => {
      const pointOnLine = new Vec2(5, 0);
      expect(line.distanceToPoint(pointOnLine)).toBeCloseTo(0);
    });

    it('should calculate distance to point above line', () => {
      const pointAbove = new Vec2(5, 3);
      expect(line.distanceToPoint(pointAbove)).toBeCloseTo(3);
    });

    it('should calculate distance to point before start', () => {
      const pointBefore = new Vec2(-5, 0);
      expect(line.distanceToPoint(pointBefore)).toBeCloseTo(5);
    });

    it('should calculate distance to point after end', () => {
      const pointAfter = new Vec2(15, 0);
      expect(line.distanceToPoint(pointAfter)).toBeCloseTo(5);
    });

    it('should find closest point on segment', () => {
      const point = new Vec2(5, 3);
      const result = line.closestPointTo(point);
      
      expect(result.point.isEqual(new Vec2(5, 0))).toBe(true);
      expect(result.t).toBeCloseTo(0.5);
      expect(result.distance).toBeCloseTo(3);
    });

    it('should find closest point at endpoint when outside segment', () => {
      const point = new Vec2(-5, 3);
      const result = line.closestPointTo(point);
      
      expect(result.point.isEqual(new Vec2(0, 0))).toBe(true);
      expect(result.t).toBeCloseTo(-0.5); // Unclamped t value
      expect(result.distance).toBeCloseTo(Math.sqrt(25 + 9));
    });
  });

  describe('Geometric Queries', () => {
    const line = new LineSegment(new Vec2(0, 0), new Vec2(10, 0));

    it('should calculate signed distance correctly', () => {
      const pointAbove = new Vec2(5, 3);
      const pointBelow = new Vec2(5, -3);
      
      expect(line.signedDistanceToPoint(pointAbove)).toBeCloseTo(3);
      expect(line.signedDistanceToPoint(pointBelow)).toBeCloseTo(-3);
    });

    it('should detect point on line', () => {
      expect(line.isPointOnLine(new Vec2(5, 0))).toBe(true);
      expect(line.isPointOnLine(new Vec2(5, 1))).toBe(false);
    });

    it('should detect point on segment', () => {
      expect(line.isPointOnSegment(new Vec2(5, 0))).toBe(true);
      expect(line.isPointOnSegment(new Vec2(-5, 0))).toBe(false);
      expect(line.isPointOnSegment(new Vec2(15, 0))).toBe(false);
    });

    it('should detect horizontal and vertical lines', () => {
      const horizontal = new LineSegment(new Vec2(0, 5), new Vec2(10, 5));
      const vertical = new LineSegment(new Vec2(5, 0), new Vec2(5, 10));
      const diagonal = new LineSegment(new Vec2(0, 0), new Vec2(5, 5));
      
      expect(horizontal.isHorizontal()).toBe(true);
      expect(vertical.isVertical()).toBe(true);
      expect(diagonal.isHorizontal()).toBe(false);
      expect(diagonal.isVertical()).toBe(false);
    });

    it('should detect parallel and perpendicular lines', () => {
      const line1 = new LineSegment(new Vec2(0, 0), new Vec2(10, 0));
      const parallel = new LineSegment(new Vec2(0, 5), new Vec2(10, 5));
      const perpendicular = new LineSegment(new Vec2(5, -5), new Vec2(5, 5));
      
      expect(line1.isParallelTo(parallel)).toBe(true);
      expect(line1.isPerpendicularTo(perpendicular)).toBe(true);
    });
  });

  describe('Line Intersections', () => {
    it('should find intersection of crossing lines', () => {
      const line1 = new LineSegment(new Vec2(0, 0), new Vec2(10, 10));
      const line2 = new LineSegment(new Vec2(0, 10), new Vec2(10, 0));
      
      const intersection = line1.intersectWithLine(line2);
      expect(intersection).not.toBeNull();
      expect(intersection!.point.isEqual(new Vec2(5, 5))).toBe(true);
      expect(intersection!.t1).toBeCloseTo(0.5);
      expect(intersection!.t2).toBeCloseTo(0.5);
      expect(intersection!.type).toBe('interior');
    });

    it('should find intersection at endpoint', () => {
      const line1 = new LineSegment(new Vec2(0, 0), new Vec2(10, 0));
      const line2 = new LineSegment(new Vec2(10, 0), new Vec2(10, 10));
      
      const intersection = line1.intersectWithLine(line2);
      expect(intersection).not.toBeNull();
      expect(intersection!.point.isEqual(new Vec2(10, 0))).toBe(true);
      expect(intersection!.type).toBe('endpoint');
    });

    it('should return null for parallel non-coincident lines', () => {
      const line1 = new LineSegment(new Vec2(0, 0), new Vec2(10, 0));
      const line2 = new LineSegment(new Vec2(0, 5), new Vec2(10, 5));
      
      const intersection = line1.intersectWithLine(line2);
      expect(intersection).toBeNull();
    });

    it('should handle coincident lines with overlap', () => {
      const line1 = new LineSegment(new Vec2(0, 0), new Vec2(10, 0));
      const line2 = new LineSegment(new Vec2(5, 0), new Vec2(15, 0));
      
      const intersection = line1.intersectWithLine(line2);
      expect(intersection).not.toBeNull();
      expect(intersection!.type).toBe('overlap');
    });
  });

  describe('Transformations', () => {
    const line = new LineSegment(new Vec2(0, 0), new Vec2(10, 0));

    it('should apply translation', () => {
      const translation = Mat3.translation(5, 10);
      const transformed = line.transform(translation);
      
      expect(transformed.startPoint.isEqual(new Vec2(5, 10))).toBe(true);
      expect(transformed.endPoint.isEqual(new Vec2(15, 10))).toBe(true);
      expect(transformed.length).toBeCloseTo(line.length);
    });

    it('should apply rotation', () => {
      const rotation = Mat3.rotation(Math.PI / 2);
      const transformed = line.transform(rotation);
      
      expect(transformed.startPoint.isEqual(new Vec2(0, 0))).toBe(true);
      expect(transformed.endPoint.isEqual(new Vec2(0, 10), 1e-10)).toBe(true);
      expect(transformed.length).toBeCloseTo(line.length);
    });

    it('should apply scaling', () => {
      const scale = Mat3.scale(2, 3);
      const transformed = line.transform(scale);
      
      expect(transformed.startPoint.isEqual(new Vec2(0, 0))).toBe(true);
      expect(transformed.endPoint.isEqual(new Vec2(20, 0))).toBe(true);
      expect(transformed.length).toBeCloseTo(20);
    });
  });

  describe('Subdivision', () => {
    const line = new LineSegment(new Vec2(0, 0), new Vec2(10, 20));

    it('should subdivide at parameter', () => {
      const [seg1, seg2] = line.subdivide(0.3);
      
      expect(seg1.startPoint.isEqual(new Vec2(0, 0))).toBe(true);
      expect(seg1.endPoint.isEqual(new Vec2(3, 6))).toBe(true);
      expect(seg2.startPoint.isEqual(new Vec2(3, 6))).toBe(true);
      expect(seg2.endPoint.isEqual(new Vec2(10, 20))).toBe(true);
    });

    it('should subdivide at length', () => {
      const totalLength = line.length;
      const [seg1, seg2] = line.subdivideAtLength(totalLength * 0.4);
      
      expect(seg1.length).toBeCloseTo(totalLength * 0.4);
      expect(seg2.length).toBeCloseTo(totalLength * 0.6);
    });
  });

  describe('Offset and Extension', () => {
    const line = new LineSegment(new Vec2(0, 0), new Vec2(10, 0));

    it('should create offset line', () => {
      const offset = line.offset(5);
      
      expect(offset.startPoint.isEqual(new Vec2(0, 5))).toBe(true);
      expect(offset.endPoint.isEqual(new Vec2(10, 5))).toBe(true);
      expect(offset.length).toBeCloseTo(line.length);
    });

    it('should extend start', () => {
      const extended = line.extendStart(5);
      
      expect(extended.startPoint.isEqual(new Vec2(-5, 0))).toBe(true);
      expect(extended.endPoint.isEqual(new Vec2(10, 0))).toBe(true);
      expect(extended.length).toBeCloseTo(15);
    });

    it('should extend end', () => {
      const extended = line.extendEnd(5);
      
      expect(extended.startPoint.isEqual(new Vec2(0, 0))).toBe(true);
      expect(extended.endPoint.isEqual(new Vec2(15, 0))).toBe(true);
      expect(extended.length).toBeCloseTo(15);
    });

    it('should extend both ends', () => {
      const extended = line.extend(3, 7);
      
      expect(extended.startPoint.isEqual(new Vec2(-3, 0))).toBe(true);
      expect(extended.endPoint.isEqual(new Vec2(17, 0))).toBe(true);
      expect(extended.length).toBeCloseTo(20);
    });
  });

  describe('Cloning and Reversal', () => {
    const line = new LineSegment(new Vec2(1, 2), new Vec2(3, 4));

    it('should clone correctly', () => {
      const cloned = line.clone();
      
      expect(cloned).not.toBe(line);
      expect(cloned.isEqual(line)).toBe(true);
    });

    it('should reverse correctly', () => {
      const reversed = line.reverse();
      
      expect(reversed.startPoint.isEqual(line.endPoint)).toBe(true);
      expect(reversed.endPoint.isEqual(line.startPoint)).toBe(true);
      expect(reversed.length).toBeCloseTo(line.length);
    });
  });

  describe('Bounding Box', () => {
    it('should compute correct bounding box', () => {
      const line = new LineSegment(new Vec2(2, 3), new Vec2(8, 1));
      const bbox = line.boundingBox;
      
      expect(bbox.min.isEqual(new Vec2(2, 1))).toBe(true);
      expect(bbox.max.isEqual(new Vec2(8, 3))).toBe(true);
      expect(bbox.center.isEqual(new Vec2(5, 2))).toBe(true);
      expect(bbox.size.isEqual(new Vec2(6, 2))).toBe(true);
    });
  });

  describe('Serialization', () => {
    it('should serialize and deserialize correctly', () => {
      const line = new LineSegment(new Vec2(1, 2), new Vec2(3, 4));
      const json = line.toJSON();
      const restored = LineSegment.fromJSON(json);
      
      expect(restored.isEqual(line)).toBe(true);
    });
  });
});

describe('LineSegmentUtils', () => {
  describe('Factory Methods', () => {
    it('should create horizontal line', () => {
      const line = LineSegmentUtils.createHorizontalLine(5, 0, 10);
      
      expect(line.isHorizontal()).toBe(true);
      expect(line.startPoint.isEqual(new Vec2(0, 5))).toBe(true);
      expect(line.endPoint.isEqual(new Vec2(10, 5))).toBe(true);
    });

    it('should create vertical line', () => {
      const line = LineSegmentUtils.createVerticalLine(5, 0, 10);
      
      expect(line.isVertical()).toBe(true);
      expect(line.startPoint.isEqual(new Vec2(5, 0))).toBe(true);
      expect(line.endPoint.isEqual(new Vec2(5, 10))).toBe(true);
    });

    it('should create from point, angle, and length', () => {
      const line = LineSegmentUtils.createFromPointAngleLength(
        new Vec2(0, 0),
        Math.PI / 4,
        10
      );
      
      expect(line.length).toBeCloseTo(10);
      expect(line.angle).toBeCloseTo(Math.PI / 4);
    });
  });

  describe('Best Fit Line', () => {
    it('should find best fit line for points', () => {
      const points = [
        new Vec2(0, 0),
        new Vec2(1, 1),
        new Vec2(2, 2),
        new Vec2(3, 3)
      ];
      
      const line = LineSegmentUtils.findBestFitLine(points);
      expect(line).not.toBeNull();
      expect(line!.angle).toBeCloseTo(Math.PI / 4);
    });

    it('should handle vertical line case', () => {
      const points = [
        new Vec2(5, 0),
        new Vec2(5, 1),
        new Vec2(5, 2),
        new Vec2(5, 3)
      ];
      
      const line = LineSegmentUtils.findBestFitLine(points);
      expect(line).not.toBeNull();
      expect(line!.isVertical()).toBe(true);
    });

    it('should return null for insufficient points', () => {
      const line = LineSegmentUtils.findBestFitLine([new Vec2(0, 0)]);
      expect(line).toBeNull();
    });
  });

  describe('Connect Points', () => {
    it('should connect consecutive points', () => {
      const points = [
        new Vec2(0, 0),
        new Vec2(1, 1),
        new Vec2(2, 0),
        new Vec2(3, 1)
      ];
      
      const segments = LineSegmentUtils.connectPoints(points);
      
      expect(segments).toHaveLength(3);
      expect(segments[0].startPoint.isEqual(points[0])).toBe(true);
      expect(segments[0].endPoint.isEqual(points[1])).toBe(true);
      expect(segments[2].endPoint.isEqual(points[3])).toBe(true);
    });
  });
});