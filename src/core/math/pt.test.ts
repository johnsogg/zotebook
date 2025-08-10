import { describe, it, expect, beforeEach } from 'vitest';

import { Mat3 } from './mat3.js';
import { Pt, TransformContext, CoordinateSystem } from './pt.js';
import { Vec2 } from './vec2.js';

describe('Pt (Multi-coordinate Point System)', () => {
  let transforms: TransformContext;

  beforeEach(() => {
    // Set up a typical viewport scenario
    const canvasSize = new Vec2(800, 600);
    const panOffset = new Vec2(100, 50);
    const zoomLevel = 2.0;
    
    transforms = Pt.createTransformContext(canvasSize, panOffset, zoomLevel, 1.0);
  });

  describe('Construction and Factory Methods', () => {
    it('should create point from world coordinates', () => {
      const worldCoords = new Vec2(10, 20);
      const pt = Pt.fromWorld(worldCoords, transforms.transforms);
      
      expect(pt.world.x).toBe(10);
      expect(pt.world.y).toBe(20);
    });

    it('should create point from viewport coordinates', () => {
      const viewportCoords = new Vec2(400, 300);
      const pt = Pt.fromViewport(viewportCoords, transforms.transforms);
      
      expect(pt.viewport.x).toBe(400);
      expect(pt.viewport.y).toBe(300);
    });

    it('should create point from screen coordinates', () => {
      const screenCoords = new Vec2(200, 150);
      const pt = Pt.fromScreen(screenCoords, transforms.transforms);
      
      expect(pt.screen.x).toBe(200);
      expect(pt.screen.y).toBe(150);
    });
  });

  describe('Coordinate System Conversions', () => {
    it('should maintain consistency between coordinate systems', () => {
      const originalWorld = new Vec2(0, 0); // World origin
      const pt = Pt.fromWorld(originalWorld, transforms.transforms);
      
      // Convert through all systems and back
      const viewport = pt.viewport;
      const screen = pt.screen;
      
      const ptFromViewport = Pt.fromViewport(viewport, transforms.transforms);
      const ptFromScreen = Pt.fromScreen(screen, transforms.transforms);
      
      expect(pt.world.isEqual(ptFromViewport.world, 1e-10)).toBe(true);
      expect(pt.world.isEqual(ptFromScreen.world, 1e-10)).toBe(true);
    });

    it('should handle coordinate system queries', () => {
      const pt = Pt.fromWorld(new Vec2(10, 20), transforms.transforms);
      
      expect(pt.inSystem(CoordinateSystem.WORLD)).toEqual(pt.world);
      expect(pt.inSystem(CoordinateSystem.VIEWPORT)).toEqual(pt.viewport);
      expect(pt.inSystem(CoordinateSystem.SCREEN)).toEqual(pt.screen);
    });

    it('should apply zoom transformation correctly', () => {
      const worldPoint = new Vec2(100, 100);
      const pt = Pt.fromWorld(worldPoint, transforms.transforms);
      
      // With 2x zoom, world coordinates should be scaled in viewport
      const viewport = pt.viewport;
      const expectedViewport = new Vec2(
        400 + (100 + 100) * 2, // center + (world + pan) * zoom
        300 + (100 + 50) * 2
      );
      
      expect(viewport.x).toBeCloseTo(expectedViewport.x);
      expect(viewport.y).toBeCloseTo(expectedViewport.y);
    });
  });

  describe('Distance Operations', () => {
    it('should calculate distance in specified coordinate system', () => {
      const pt1 = Pt.fromWorld(new Vec2(0, 0), transforms.transforms);
      const pt2 = Pt.fromWorld(new Vec2(10, 0), transforms.transforms);
      
      const worldDistance = pt1.distanceTo(pt2, CoordinateSystem.WORLD);
      const viewportDistance = pt1.distanceTo(pt2, CoordinateSystem.VIEWPORT);
      
      expect(worldDistance).toBe(10);
      expect(viewportDistance).toBe(20); // 2x zoom
    });

    it('should calculate squared distance', () => {
      const pt1 = Pt.fromWorld(new Vec2(0, 0), transforms.transforms);
      const pt2 = Pt.fromWorld(new Vec2(3, 4), transforms.transforms);
      
      const distanceSquared = pt1.distanceToSquared(pt2, CoordinateSystem.WORLD);
      expect(distanceSquared).toBe(25); // 3² + 4² = 25
    });
  });

  describe('Vector Operations', () => {
    it('should add vector to point', () => {
      const pt = Pt.fromWorld(new Vec2(10, 20), transforms.transforms);
      const vector = new Vec2(5, 5);
      const newPt = pt.add(vector, CoordinateSystem.WORLD);
      
      expect(newPt.world.x).toBe(15);
      expect(newPt.world.y).toBe(25);
    });

    it('should subtract points to get vector', () => {
      const pt1 = Pt.fromWorld(new Vec2(10, 20), transforms.transforms);
      const pt2 = Pt.fromWorld(new Vec2(5, 15), transforms.transforms);
      const vector = pt1.subtract(pt2, CoordinateSystem.WORLD);
      
      expect(vector.x).toBe(5);
      expect(vector.y).toBe(5);
    });

    it('should interpolate between points', () => {
      const pt1 = Pt.fromWorld(new Vec2(0, 0), transforms.transforms);
      const pt2 = Pt.fromWorld(new Vec2(10, 10), transforms.transforms);
      const midpoint = pt1.lerp(pt2, 0.5, CoordinateSystem.WORLD);
      
      expect(midpoint.world.x).toBe(5);
      expect(midpoint.world.y).toBe(5);
    });
  });

  describe('Transform Context Updates', () => {
    it('should update point with new transforms', () => {
      const pt = Pt.fromWorld(new Vec2(10, 20), transforms.transforms);
      const originalViewport = pt.viewport;
      
      // Create new transform context with different zoom
      const newTransforms = Pt.createTransformContext(
        new Vec2(800, 600),
        new Vec2(100, 50),
        4.0, // 4x zoom instead of 2x
        1.0
      );
      
      const updatedPt = pt.withTransforms(newTransforms.transforms);
      const newViewport = updatedPt.viewport;
      
      // World coordinates should remain the same
      expect(updatedPt.world.isEqual(pt.world)).toBe(true);
      
      // But viewport coordinates should be different due to zoom change
      expect(newViewport.isEqual(originalViewport)).toBe(false);
    });
  });

  describe('Equality and Comparison', () => {
    it('should test equality in different coordinate systems', () => {
      const pt1 = Pt.fromWorld(new Vec2(10, 20), transforms.transforms);
      const pt2 = Pt.fromWorld(new Vec2(10, 20), transforms.transforms);
      const pt3 = Pt.fromWorld(new Vec2(10, 21), transforms.transforms);
      
      expect(pt1.isEqual(pt2, CoordinateSystem.WORLD)).toBe(true);
      expect(pt1.isEqual(pt3, CoordinateSystem.WORLD)).toBe(false);
    });

    it('should test touch tolerance for gesture recognition', () => {
      const pt1 = Pt.fromScreen(new Vec2(100, 100), transforms.transforms);
      const pt2 = Pt.fromScreen(new Vec2(105, 105), transforms.transforms);
      const pt3 = Pt.fromScreen(new Vec2(120, 120), transforms.transforms);
      
      expect(pt1.isNearTouch(pt2, 10)).toBe(true); // Within 10 pixels
      expect(pt1.isNearTouch(pt3, 10)).toBe(false); // Beyond 10 pixels
    });
  });

  describe('Snapping Utilities', () => {
    it('should snap to grid', () => {
      const pt = Pt.fromWorld(new Vec2(12.7, 27.3), transforms.transforms);
      const snapped = pt.snapToGrid(5, CoordinateSystem.WORLD);
      
      expect(snapped.world.x).toBe(15); // Rounded to nearest 5
      expect(snapped.world.y).toBe(25);
    });

    it('should snap to nearby points', () => {
      const pt1 = Pt.fromWorld(new Vec2(10, 20), transforms.transforms);
      const pt2 = Pt.fromWorld(new Vec2(12, 21), transforms.transforms);
      
      const snapped = pt1.snapToPoint(pt2, 5, CoordinateSystem.WORLD);
      expect(snapped).toBe(pt2); // Should snap to pt2
      
      const notSnapped = pt1.snapToPoint(pt2, 1, CoordinateSystem.WORLD);
      expect(notSnapped).toBe(pt1); // Should not snap (distance > 1)
    });
  });

  describe('Serialization', () => {
    it('should convert to JSON', () => {
      const pt = Pt.fromWorld(new Vec2(10, 20), transforms.transforms);
      const json = pt.toJSON(CoordinateSystem.WORLD);
      
      expect(json.x).toBe(10);
      expect(json.y).toBe(20);
      expect(json.system).toBe('world');
    });

    it('should convert to string', () => {
      const pt = Pt.fromWorld(new Vec2(10.123, 20.456), transforms.transforms);
      const str = pt.toString(CoordinateSystem.WORLD);
      
      expect(str).toContain('10.12');
      expect(str).toContain('20.46');
      expect(str).toContain('world');
    });

    it('should provide debug information', () => {
      const pt = Pt.fromWorld(new Vec2(10, 20), transforms.transforms);
      const debugInfo = pt.debugInfo();
      
      expect(debugInfo).toContain('world:');
      expect(debugInfo).toContain('viewport:');
      expect(debugInfo).toContain('screen:');
    });
  });

  describe('TransformContext', () => {
    it('should create transform context from UI state', () => {
      const context = Pt.createTransformContext(
        new Vec2(1920, 1080), // Canvas size
        new Vec2(200, 150),   // Pan offset
        1.5,                  // Zoom level
        2.0                   // Device pixel ratio
      );
      
      expect(context).toBeInstanceOf(TransformContext);
    });

    it('should provide factory methods for points', () => {
      const worldPoint = transforms.createPointFromWorld(new Vec2(10, 20));
      const viewportPoint = transforms.createPointFromViewport(new Vec2(400, 300));
      const screenPoint = transforms.createPointFromScreen(new Vec2(200, 150));
      
      expect(worldPoint.world.x).toBe(10);
      expect(viewportPoint.viewport.x).toBe(400);
      expect(screenPoint.screen.x).toBe(200);
    });

    it('should update with new world transform', () => {
      const newWorldTransform = Mat3.scale(3).translate(50, 25);
      const updatedContext = transforms.withWorldTransform(newWorldTransform);
      
      expect(updatedContext).toBeInstanceOf(TransformContext);
      expect(updatedContext).not.toBe(transforms);
    });

    it('should adopt points from other contexts', () => {
      const otherTransforms = Pt.createTransformContext(
        new Vec2(1024, 768),
        new Vec2(0, 0),
        1.0
      );
      
      const pt = otherTransforms.createPointFromWorld(new Vec2(10, 20));
      const adoptedPt = transforms.adoptPoint(pt);
      
      expect(adoptedPt.world.isEqual(pt.world)).toBe(true);
      expect(adoptedPt.viewport.isEqual(pt.viewport)).toBe(false); // Different transforms
    });
  });

  describe('Device Pixel Ratio Handling', () => {
    it('should handle high DPI displays', () => {
      const highDPITransforms = Pt.createTransformContext(
        new Vec2(800, 600),
        new Vec2(0, 0),
        1.0,
        2.0 // 2x device pixel ratio
      );
      
      const screenPoint = new Vec2(200, 150); // Screen pixels
      const pt = Pt.fromScreen(screenPoint, highDPITransforms.transforms);
      
      // Viewport coordinates should account for DPI scaling
      expect(pt.viewport.x).toBe(100); // 200 / 2
      expect(pt.viewport.y).toBe(75);  // 150 / 2
    });
  });

  describe('Namespace Functions', () => {
    it('should provide convenience functions', () => {
      const pt1 = Pt.fromWorld(new Vec2(0, 0), transforms.transforms);
      const pt2 = Pt.fromWorld(new Vec2(10, 0), transforms.transforms);
      
      expect(Pt.distance(pt1, pt2)).toBe(pt1.distanceTo(pt2));
      expect(Pt.lerp(pt1, pt2, 0.5).world).toEqual(pt1.lerp(pt2, 0.5).world);
    });
  });

  describe('Performance Considerations', () => {
    it('should cache coordinate conversions', () => {
      const pt = Pt.fromWorld(new Vec2(10, 20), transforms.transforms);
      
      // First access should compute
      const viewport1 = pt.viewport;
      const viewport2 = pt.viewport;
      
      // Should return same reference (cached)
      expect(viewport1).toBe(viewport2);
    });

    it('should handle many coordinate conversions efficiently', () => {
      const points = Array.from({ length: 1000 }, (_, i) => 
        Pt.fromWorld(new Vec2(i, i), transforms.transforms)
      );
      
      const start = performance.now();
      points.forEach(pt => {
        pt.viewport;
        pt.screen;
      });
      const end = performance.now();
      
      // Should complete in reasonable time (less than 10ms)
      expect(end - start).toBeLessThan(10);
    });
  });

  describe('Real-world Touch Scenarios', () => {
    it('should handle touch event to world coordinate conversion', () => {
      // Simulate touch event coordinates
      const touchX = 150;
      const touchY = 200;
      
      const touchPoint = Pt.fromScreen(new Vec2(touchX, touchY), transforms.transforms);
      const worldCoords = touchPoint.world;
      
      // Should accurately convert touch to world coordinates
      expect(worldCoords).toBeInstanceOf(Vec2);
      expect(typeof worldCoords.x).toBe('number');
      expect(typeof worldCoords.y).toBe('number');
    });

    it('should maintain accuracy across zoom levels', () => {
      const worldPoint = new Vec2(100, 100);
      
      // Test at different zoom levels
      const zoomLevels = [0.5, 1.0, 2.0, 4.0, 8.0];
      
      zoomLevels.forEach(zoom => {
        const context = Pt.createTransformContext(
          new Vec2(800, 600),
          new Vec2(0, 0),
          zoom
        );
        
        const pt = Pt.fromWorld(worldPoint, context.transforms);
        
        // World coordinates should remain consistent
        expect(pt.world.isEqual(worldPoint, 1e-10)).toBe(true);
        
        // Screen coordinates should scale with zoom
        const expectedScale = zoom;
        const centerOffset = 400; // Canvas center
        expect(pt.viewport.x).toBeCloseTo(centerOffset + worldPoint.x * expectedScale);
      });
    });
  });
});