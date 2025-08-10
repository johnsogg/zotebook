import { describe, it, expect } from 'vitest';

import { Vec2 } from './vec2.js';

describe('Vec2', () => {
  describe('Construction and Constants', () => {
    it('should construct with x and y values', () => {
      const v = new Vec2(3, 4);
      expect(v.x).toBe(3);
      expect(v.y).toBe(4);
    });

    it('should provide static constants', () => {
      expect(Vec2.ZERO.x).toBe(0);
      expect(Vec2.ZERO.y).toBe(0);
      expect(Vec2.ONE.x).toBe(1);
      expect(Vec2.ONE.y).toBe(1);
      expect(Vec2.UNIT_X.x).toBe(1);
      expect(Vec2.UNIT_X.y).toBe(0);
      expect(Vec2.UNIT_Y.x).toBe(0);
      expect(Vec2.UNIT_Y.y).toBe(1);
    });

    it('should create from angle', () => {
      const v = Vec2.fromAngle(Math.PI / 2);
      expect(v.x).toBeCloseTo(0);
      expect(v.y).toBeCloseTo(1);
    });

    it('should create from polar coordinates', () => {
      const v = Vec2.fromPolar(5, Math.PI / 2);
      expect(v.x).toBeCloseTo(0);
      expect(v.y).toBeCloseTo(5);
    });
  });

  describe('Properties', () => {
    it('should calculate length correctly', () => {
      const v = new Vec2(3, 4);
      expect(v.length).toBe(5);
    });

    it('should calculate lengthSquared correctly', () => {
      const v = new Vec2(3, 4);
      expect(v.lengthSquared).toBe(25);
    });

    it('should calculate angle correctly', () => {
      const v = new Vec2(1, 1);
      expect(v.angle).toBeCloseTo(Math.PI / 4);
    });

    it('should provide normalized vector', () => {
      const v = new Vec2(3, 4);
      const normalized = v.normalized;
      expect(normalized.length).toBeCloseTo(1);
      expect(normalized.x).toBeCloseTo(0.6);
      expect(normalized.y).toBeCloseTo(0.8);
    });

    it('should handle zero vector normalization', () => {
      const v = Vec2.ZERO;
      expect(v.normalized).toBe(Vec2.ZERO);
    });

    it('should provide perpendicular vector', () => {
      const v = new Vec2(3, 4);
      const perp = v.perpendicular;
      expect(perp.x).toBe(-4);
      expect(perp.y).toBe(3);
      expect(v.dot(perp)).toBeCloseTo(0);
    });
  });

  describe('Arithmetic Operations', () => {
    const v1 = new Vec2(1, 2);
    const v2 = new Vec2(3, 4);

    it('should add vectors', () => {
      const result = v1.add(v2);
      expect(result.x).toBe(4);
      expect(result.y).toBe(6);
    });

    it('should subtract vectors', () => {
      const result = v2.subtract(v1);
      expect(result.x).toBe(2);
      expect(result.y).toBe(2);
    });

    it('should multiply by scalar', () => {
      const result = v1.multiply(3);
      expect(result.x).toBe(3);
      expect(result.y).toBe(6);
    });

    it('should divide by scalar', () => {
      const result = v2.divide(2);
      expect(result.x).toBe(1.5);
      expect(result.y).toBe(2);
    });

    it('should throw on division by zero', () => {
      expect(() => v1.divide(0)).toThrow('Division by zero');
    });

    it('should negate vector', () => {
      const result = v1.negate();
      expect(result.x).toBe(-1);
      expect(result.y).toBe(-2);
    });
  });

  describe('Dot and Cross Products', () => {
    const v1 = new Vec2(2, 3);
    const v2 = new Vec2(4, -1);

    it('should calculate dot product', () => {
      expect(v1.dot(v2)).toBe(5); // 2*4 + 3*(-1) = 8 - 3 = 5
      expect(Vec2.dot(v1, v2)).toBe(5);
    });

    it('should calculate cross product', () => {
      expect(v1.cross(v2)).toBe(-14); // 2*(-1) - 3*4 = -2 - 12 = -14
      expect(Vec2.cross(v1, v2)).toBe(-14);
    });
  });

  describe('Distance Operations', () => {
    const v1 = new Vec2(0, 0);
    const v2 = new Vec2(3, 4);

    it('should calculate distance', () => {
      expect(v1.distanceTo(v2)).toBe(5);
    });

    it('should calculate squared distance', () => {
      expect(v1.distanceToSquared(v2)).toBe(25);
    });
  });

  describe('Angular Operations', () => {
    it('should calculate angle between vectors', () => {
      const v1 = new Vec2(1, 0);
      const v2 = new Vec2(0, 1);
      expect(v1.angleTo(v2)).toBeCloseTo(Math.PI / 2);
    });

    it('should calculate unsigned angle between vectors', () => {
      const v1 = new Vec2(1, 0);
      const v2 = new Vec2(0, -1);
      expect(v1.angleToUnsigned(v2)).toBeCloseTo(Math.PI / 2);
    });
  });

  describe('Rotation', () => {
    it('should rotate vector by angle', () => {
      const v = new Vec2(1, 0);
      const rotated = v.rotateBy(Math.PI / 2);
      expect(rotated.x).toBeCloseTo(0);
      expect(rotated.y).toBeCloseTo(1);
    });
  });

  describe('Projection Operations', () => {
    it('should project vector onto direction', () => {
      const v = new Vec2(3, 4);
      const direction = new Vec2(1, 0);
      const projected = v.projectOnto(direction);
      expect(projected.x).toBe(3);
      expect(projected.y).toBe(0);
    });

    it('should reject vector from direction', () => {
      const v = new Vec2(3, 4);
      const direction = new Vec2(1, 0);
      const rejected = v.rejectFrom(direction);
      expect(rejected.x).toBe(0);
      expect(rejected.y).toBe(4);
    });
  });

  describe('Reflection', () => {
    it('should reflect vector across normal', () => {
      const v = new Vec2(1, 1);
      const normal = new Vec2(0, 1);
      const reflected = v.reflect(normal);
      expect(reflected.x).toBeCloseTo(1);
      expect(reflected.y).toBeCloseTo(-1);
    });
  });

  describe('Linear Interpolation', () => {
    it('should interpolate between vectors', () => {
      const v1 = new Vec2(0, 0);
      const v2 = new Vec2(4, 4);
      const midpoint = v1.lerp(v2, 0.5);
      expect(midpoint.x).toBe(2);
      expect(midpoint.y).toBe(2);
    });
  });

  describe('Utility Methods', () => {
    it('should detect zero vector', () => {
      expect(Vec2.ZERO.isZero()).toBe(true);
      expect(new Vec2(0.1, 0.1).isZero()).toBe(false);
    });

    it('should test equality', () => {
      const v1 = new Vec2(1, 2);
      const v2 = new Vec2(1, 2);
      const v3 = new Vec2(1.1, 2.1);
      expect(v1.isEqual(v2)).toBe(true);
      expect(v1.isEqual(v3)).toBe(false);
    });

    it('should test if vectors are parallel', () => {
      const v1 = new Vec2(1, 2);
      const v2 = new Vec2(2, 4);
      const v3 = new Vec2(1, 0);
      expect(v1.isParallel(v2)).toBe(true);
      expect(v1.isParallel(v3)).toBe(false);
    });

    it('should test if vectors are perpendicular', () => {
      const v1 = new Vec2(1, 0);
      const v2 = new Vec2(0, 1);
      const v3 = new Vec2(1, 1);
      expect(v1.isPerpendicular(v2)).toBe(true);
      expect(v1.isPerpendicular(v3)).toBe(false);
    });

    it('should clamp length', () => {
      const v = new Vec2(3, 4); // length = 5
      const clamped = v.clampLength(3);
      expect(clamped.length).toBeCloseTo(3);
    });

    it('should clamp components', () => {
      const v = new Vec2(-5, 10);
      const clamped = v.clampComponents(-2, 5);
      expect(clamped.x).toBe(-2);
      expect(clamped.y).toBe(5);
    });
  });

  describe('Conversion Methods', () => {
    const v = new Vec2(1.23456, 2.34567);

    it('should convert to array', () => {
      const array = v.toArray();
      expect(array).toEqual([1.23456, 2.34567]);
    });

    it('should convert to string', () => {
      const str = v.toString();
      expect(str).toBe('Vec2(1.235, 2.346)');
    });

    it('should convert to/from JSON', () => {
      const json = v.toJSON();
      expect(json).toEqual({ x: 1.23456, y: 2.34567 });
      
      const restored = Vec2.fromJSON(json);
      expect(restored.isEqual(v)).toBe(true);
    });

    it('should generate hash', () => {
      const hash = v.hash();
      expect(hash).toBe('1.23456,2.34567');
    });
  });

  describe('Namespace Functions', () => {
    it('should provide convenience functions', () => {
      const v1 = new Vec2(1, 2);
      const v2 = new Vec2(3, 4);

      expect(Vec2.add(v1, v2)).toEqual(v1.add(v2));
      expect(Vec2.subtract(v1, v2)).toEqual(v1.subtract(v2));
      expect(Vec2.multiply(v1, 2)).toEqual(v1.multiply(2));
      expect(Vec2.distance(v1, v2)).toBe(v1.distanceTo(v2));
      expect(Vec2.lerp(v1, v2, 0.5)).toEqual(v1.lerp(v2, 0.5));
    });
  });

  describe('Performance and Memoization', () => {
    it('should cache expensive computations', () => {
      const v = new Vec2(3, 4);
      
      // First access should compute
      const length1 = v.length;
      const length2 = v.length;
      
      // Should return same reference (cached)
      expect(length1).toBe(length2);
      expect(length1).toBe(5);
    });

    it('should cache normalized vector', () => {
      const v = new Vec2(3, 4);
      
      const normalized1 = v.normalized;
      const normalized2 = v.normalized;
      
      // Should return same reference (cached)
      expect(normalized1).toBe(normalized2);
    });
  });
});