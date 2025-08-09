// Zotebook Web - Main entry point
console.log('Zotebook Web - Development environment ready!')

// Initialize the application
const app = document.getElementById('app')
if (app) {
  app.innerHTML = `
    <div style="
      display: flex; 
      align-items: center; 
      justify-content: center; 
      height: 100vh; 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      margin: 0;
    ">
      <div style="text-align: center;">
        <h1 style="margin: 0 0 1rem 0; font-size: 3rem; font-weight: 300;">
          Zotebook Web
        </h1>
        <p style="margin: 0; font-size: 1.2rem; opacity: 0.9;">
          Gesture-based CAD drawing application
        </p>
        <p style="margin: 1rem 0 0 0; font-size: 0.9rem; opacity: 0.7;">
          Development environment initialized
        </p>
      </div>
    </div>
  `
}