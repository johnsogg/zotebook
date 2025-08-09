// Vitest test setup file
import { beforeEach } from 'vitest'

// Global test setup
beforeEach(() => {
  // Reset DOM state before each test
  document.body.innerHTML = ''
})

// Mock browser APIs that may not be available in jsdom
Object.defineProperty(window, 'requestAnimationFrame', {
  value: (callback: FrameRequestCallback) => setTimeout(callback, 16),
})

Object.defineProperty(window, 'cancelAnimationFrame', {
  value: (id: number) => clearTimeout(id),
})

// Mock WebGL context for rendering tests
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: (contextType: string) => {
    if (contextType === 'webgl' || contextType === 'webgl2') {
      return {
        // Minimal WebGL mock - extend as needed for testing
        createProgram: () => ({}),
        createShader: () => ({}),
        compileShader: () => {},
        attachShader: () => {},
        linkProgram: () => {},
        useProgram: () => {},
        getProgramParameter: () => true,
        getShaderParameter: () => true,
      }
    }
    return null
  },
})