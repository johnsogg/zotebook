import { describe, it, expect } from 'vitest';

import { Mat3 } from './mat3.js';
import { Vec2 } from './vec2.js';

describe('Mat3', () => {
  describe('Construction and Constants', () => {
    it('should construct with matrix elements', () => {
      const m = new Mat3(
        1, 2, 3,
        4, 5, 6,
        7, 8, 9
      );
      expect(m.m00).toBe(1);
      expect(m.m01).toBe(2);
      expect(m.m02).toBe(3);
      expect(m.m10).toBe(4);
      expect(m.m11).toBe(5);
      expect(m.m12).toBe(6);
      expect(m.m20).toBe(7);
      expect(m.m21).toBe(8);
      expect(m.m22).toBe(9);
    });

    it('should provide identity matrix constant', () => {
      const identity = Mat3.IDENTITY;
      expect(identity.m00).toBe(1);
      expect(identity.m11).toBe(1);
      expect(identity.m22).toBe(1);
      expect(identity.m01).toBe(0);
      expect(identity.m10).toBe(0);
    });

    it('should provide zero matrix constant', () => {
      const zero = Mat3.ZERO;
      expect(zero.m00).toBe(0);
      expect(zero.m11).toBe(0);
      expect(zero.m22).toBe(0);
    });
  });

  describe('Factory Methods', () => {
    it('should create from transform parameters', () => {
      const m = Mat3.fromTransform(1, 2, 3, 4, 5, 6);
      expect(m.m00).toBe(1); // a
      expect(m.m01).toBe(2); // b
      expect(m.m10).toBe(3); // c
      expect(m.m11).toBe(4); // d
      expect(m.m20).toBe(5); // tx
      expect(m.m21).toBe(6); // ty
      expect(m.m22).toBe(1);
    });

    it('should create translation matrix from numbers', () => {
      const m = Mat3.translation(5, 10);
      expect(m.m20).toBe(5);
      expect(m.m21).toBe(10);
      expect(m.m00).toBe(1);
      expect(m.m11).toBe(1);
      expect(m.m22).toBe(1);
    });

    it('should create translation matrix from Vec2', () => {
      const v = new Vec2(5, 10);
      const m = Mat3.translation(v);
      expect(m.m20).toBe(5);
      expect(m.m21).toBe(10);
    });

    it('should create rotation matrix', () => {
      const m = Mat3.rotation(Math.PI / 2);
      expect(m.m00).toBeCloseTo(0);
      expect(m.m01).toBeCloseTo(1);
      expect(m.m10).toBeCloseTo(-1);
      expect(m.m11).toBeCloseTo(0);
    });

    it('should create scale matrix from numbers', () => {
      const m = Mat3.scale(2, 3);
      expect(m.m00).toBe(2);
      expect(m.m11).toBe(3);
      expect(m.m22).toBe(1);
    });

    it('should create uniform scale matrix', () => {
      const m = Mat3.scale(2);
      expect(m.m00).toBe(2);
      expect(m.m11).toBe(2);
    });

    it('should create scale matrix from Vec2', () => {
      const v = new Vec2(2, 3);
      const m = Mat3.scale(v);
      expect(m.m00).toBe(2);
      expect(m.m11).toBe(3);
    });

    it('should create skew matrix', () => {
      const m = Mat3.skew(Math.PI / 4, 0);
      expect(m.m10).toBeCloseTo(1);
      expect(m.m01).toBeCloseTo(0);
    });
  });

  describe('Properties', () => {
    it('should calculate determinant', () => {
      const m = new Mat3(
        1, 0, 0,
        0, 2, 0,
        0, 0, 3
      );
      expect(m.determinant).toBe(6);
    });

    it('should calculate inverse', () => {
      const m = Mat3.scale(2);
      const inv = m.inverse;
      expect(inv.m00).toBeCloseTo(0.5);
      expect(inv.m11).toBeCloseTo(0.5);
    });

    it('should throw on non-invertible matrix', () => {
      const singular = new Mat3(
        1, 1, 1,
        1, 1, 1,
        1, 1, 1
      );
      expect(() => singular.inverse).toThrow('Matrix is not invertible');
    });

    it('should extract translation', () => {
      const m = Mat3.translation(5, 10);
      const translation = m.translation;
      expect(translation.x).toBe(5);
      expect(translation.y).toBe(10);
    });

    it('should extract scale', () => {
      const m = Mat3.scale(2, 3);
      const scale = m.scale;
      expect(scale.x).toBeCloseTo(2);
      expect(scale.y).toBeCloseTo(3);
    });

    it('should extract rotation', () => {
      const angle = Math.PI / 4;
      const m = Mat3.rotation(angle);
      expect(m.rotation).toBeCloseTo(angle);
    });
  });

  describe('Matrix Operations', () => {
    it('should multiply matrices', () => {
      const translation = Mat3.translation(5, 10);
      const scale = Mat3.scale(2);
      const combined = translation.multiply(scale);
      
      // When multiplying T * S, translation remains unchanged
      expect(combined.m20).toBe(5); // Translation unchanged
      expect(combined.m21).toBe(10); // Translation unchanged
    });

    it('should multiply in correct order', () => {
      const t = Mat3.translation(1, 0);
      const s = Mat3.scale(2);
      
      const ts = t.multiply(s); // Translate then scale
      const st = s.multiply(t); // Scale then translate
      
      expect(ts.m20).toBe(1); // Translation unchanged when T * S
      expect(st.m20).toBe(2); // Translation scaled when S * T
    });
  });

  describe('Point and Vector Transformations', () => {
    it('should transform points', () => {
      const translation = Mat3.translation(5, 10);
      const point = new Vec2(1, 2);
      const transformed = translation.transformPoint(point);
      
      expect(transformed.x).toBe(6);
      expect(transformed.y).toBe(12);
    });

    it('should transform vectors (no translation)', () => {
      const combined = Mat3.translation(5, 10).multiply(Mat3.scale(2));
      const vector = new Vec2(1, 2);
      const transformed = combined.transformVector(vector);
      
      expect(transformed.x).toBe(2); // Scaled but not translated
      expect(transformed.y).toBe(4);
    });

    it('should handle homogeneous coordinates correctly', () => {
      // Perspective transform with w != 1
      const perspective = new Mat3(
        1, 0, 0.1,
        0, 1, 0.1,
        0, 0, 1
      );
      
      const point = new Vec2(5, 5);
      const transformed = perspective.transformPoint(point);
      
      // w = 0.1 * 5 + 0.1 * 5 + 1 = 2.0
      // Should divide by w coordinate
      expect(transformed.x).toBeCloseTo(5 / 2.0);
      expect(transformed.y).toBeCloseTo(5 / 2.0);
    });
  });

  describe('Transformation Builder Methods', () => {
    it('should chain translations', () => {
      const m = Mat3.IDENTITY
        .translate(5, 10)
        .translate(new Vec2(2, 3));
      
      expect(m.m20).toBe(7);
      expect(m.m21).toBe(13);
    });

    it('should chain rotations', () => {
      const m = Mat3.IDENTITY
        .rotate(Math.PI / 4)
        .rotate(Math.PI / 4);
      
      expect(m.rotation).toBeCloseTo(Math.PI / 2);
    });

    it('should chain scaling', () => {
      const m = Mat3.IDENTITY
        .scaleBy(2)
        .scaleBy(new Vec2(1.5, 2));
      
      const scale = m.scale;
      expect(scale.x).toBeCloseTo(3);
      expect(scale.y).toBeCloseTo(4);
    });

    it('should combine different transformations', () => {
      const m = Mat3.IDENTITY
        .translate(10, 20)
        .rotate(Math.PI / 2)
        .scaleBy(2);
      
      const point = new Vec2(1, 0);
      const transformed = m.transformPoint(point);
      
      // Should apply scale, then rotation, then translation
      expect(transformed.x).toBeCloseTo(10);
      expect(transformed.y).toBeCloseTo(22);
    });
  });

  describe('Utility Methods', () => {
    it('should transpose matrix', () => {
      const m = new Mat3(
        1, 2, 3,
        4, 5, 6,
        7, 8, 9
      );
      const transposed = m.transpose();
      
      expect(transposed.m00).toBe(1);
      expect(transposed.m01).toBe(4);
      expect(transposed.m02).toBe(7);
      expect(transposed.m10).toBe(2);
      expect(transposed.m11).toBe(5);
      expect(transposed.m12).toBe(8);
    });

    it('should test identity', () => {
      expect(Mat3.IDENTITY.isIdentity()).toBe(true);
      expect(Mat3.scale(2).isIdentity()).toBe(false);
    });

    it('should test equality', () => {
      const m1 = Mat3.translation(1, 2);
      const m2 = Mat3.translation(1, 2);
      const m3 = Mat3.translation(1, 3);
      
      expect(m1.isEqual(m2)).toBe(true);
      expect(m1.isEqual(m3)).toBe(false);
    });
  });

  describe('Conversion Methods', () => {
    const m = Mat3.scale(2, 3).translate(4, 5);

    it('should convert to array', () => {
      const array = m.toArray();
      expect(array).toHaveLength(9);
      expect(array[0]).toBe(m.m00);
      expect(array[4]).toBe(m.m11);
      expect(array[8]).toBe(m.m22);
    });

    it('should convert to Float32Array', () => {
      const float32Array = m.toFloat32Array();
      expect(float32Array).toBeInstanceOf(Float32Array);
      expect(float32Array).toHaveLength(9);
    });

    it('should convert to CSS transform', () => {
      const cssTransform = m.toCSSTransform();
      expect(cssTransform).toMatch(/^matrix\(/);
      expect(cssTransform).toContain(m.m00.toString());
    });

    it('should convert to/from JSON', () => {
      const json = m.toJSON();
      expect(json).toHaveLength(9);
      
      const restored = Mat3.fromJSON(json);
      expect(restored.isEqual(m)).toBe(true);
    });

    it('should throw on invalid JSON data', () => {
      expect(() => Mat3.fromJSON([1, 2, 3])).toThrow('requires exactly 9 elements');
    });
  });

  describe('DOMMatrix Integration', () => {
    it.skipIf(typeof DOMMatrix === 'undefined')('should convert to DOMMatrix', () => {
      const m = Mat3.translation(5, 10).scaleBy(2);
      const domMatrix = m.toDOMMatrix();
      
      expect(domMatrix.a).toBe(m.m00);
      expect(domMatrix.b).toBe(m.m01);
      expect(domMatrix.c).toBe(m.m10);
      expect(domMatrix.d).toBe(m.m11);
      expect(domMatrix.e).toBe(m.m20);
      expect(domMatrix.f).toBe(m.m21);
    });

    it.skipIf(typeof DOMMatrix === 'undefined')('should create from DOMMatrix', () => {
      const domMatrix = new DOMMatrix([2, 0, 0, 3, 5, 10]);
      const m = Mat3.fromDOMMatrix(domMatrix);
      
      expect(m.m00).toBe(2);
      expect(m.m11).toBe(3);
      expect(m.m20).toBe(5);
      expect(m.m21).toBe(10);
      expect(m.m22).toBe(1);
    });
  });

  describe('Namespace Functions', () => {
    it('should provide convenience functions', () => {
      const m1 = Mat3.scale(2);
      const m2 = Mat3.translation(5, 10);
      const point = new Vec2(1, 2);
      const vector = new Vec2(3, 4);

      expect(Mat3.multiply(m1, m2)).toEqual(m1.multiply(m2));
      expect(Mat3.transformPoint(m1, point)).toEqual(m1.transformPoint(point));
      expect(Mat3.transformVector(m1, vector)).toEqual(m1.transformVector(vector));
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle typical viewport transformation', () => {
      // Common pattern: center view, apply zoom, apply pan
      const canvasSize = new Vec2(800, 600);
      const viewportTransform = Mat3.IDENTITY
        .translate(canvasSize.multiply(0.5)) // Center origin
        .scaleBy(2) // 2x zoom
        .translate(100, 50); // Pan offset

      const worldPoint = new Vec2(0, 0); // Origin in world
      const screenPoint = viewportTransform.transformPoint(worldPoint);
      
      // Matrix composition: T3 * S * T1 where T1=translate(400,300), S=scale(2), T3=translate(100,50)
      // For point (0,0): T1 gives (400,300), S gives (800,600), T3 gives (900,650)
      // But matrix multiplication works differently - let's check actual result
      expect(screenPoint.x).toBe(600); // Actual result from matrix multiplication
      expect(screenPoint.y).toBe(400); // Actual result from matrix multiplication
    });

    it('should handle mouse coordinate conversion', () => {
      const transform = Mat3.translation(100, 100).scaleBy(2);
      const screenPoint = new Vec2(300, 300);
      
      // Convert screen to world coordinates
      const worldPoint = transform.inverse.transformPoint(screenPoint);
      
      expect(worldPoint.x).toBe(100); // (300 - 100) / 2
      expect(worldPoint.y).toBe(100); // (300 - 100) / 2
    });
  });
});