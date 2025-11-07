// Clean OpenCV.js loader for global-script usage
// No import of opencv-js -- loaded via <script> in index.html!

// $1 coin diameter in millimeters
export const COIN_DIAMETER_MM = 26.5;

let cvReady = false;
let cvInitPromise = null;

// Await until OpenCV global is ready (handles Promise and API global)
export async function initOpenCV() {
  // If OpenCV is already patched and ready, return it
  if (window.cv && window.cv.Mat) return window.cv;

  // If window.cv is a Promise (some script/CDN mistakes), await it,
  // then patch it back to window.cv = result (so others get correct cv)
  if (window.cv && typeof window.cv.then === "function") {
    window.cv = await window.cv;
    if (window.cv.Mat) return window.cv;
  }

  // Wait for script to load and initialize
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function tryReady() {
      // If OpenCV is available, done!
      if (window.cv && window.cv.Mat) return resolve(window.cv);
      // Timeout after 30 seconds
      if (Date.now() - start > 30000) return reject(new Error("OpenCV.js failed to load in 30s"));
      setTimeout(tryReady, 100);
    }
    tryReady();
  });
}

// All other OpenCV utility functions (contour etc) must call await initOpenCV() before using window.cv!

export async function detectContours(imageDataUrl) {
  const cv = await initOpenCV();
  return new Promise((resolve, reject) => {
    try {
      const img = new window.Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const src = cv.matFromImageData(imageData);
          const gray = new cv.Mat();
          const blurred = new cv.Mat();
          const edges = new cv.Mat();
          
          // Convert to grayscale
          cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
          
          // Apply bilateral filter to reduce noise while keeping edges sharp
          cv.bilateralFilter(gray, blurred, 11, 80, 80);
          
          // Use Canny edge detection for better edge finding - reduced sensitivity
          cv.Canny(blurred, edges, 100, 200);
          
          // Dilate edges slightly to close small gaps
          const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(2, 2));
          cv.dilate(edges, edges, kernel);
          kernel.delete();
          
          const contours = new cv.MatVector();
          const hierarchy = new cv.Mat();
          cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
          
          const objects = [];
          let objectId = 1;
          
          // Calculate image boundary (to filter out contours that touch edges)
          const imageBoundary = {
            left: 5,
            right: canvas.width - 5,
            top: 5,
            bottom: canvas.height - 5
          };
          
          for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const area = cv.contourArea(contour);
            
            // Skip small areas and very large areas (likely image border)
            const imageArea = canvas.width * canvas.height;
            if (area < 5000 || area > imageArea * 0.5) { 
              contour.delete(); 
              continue; 
            }
            
            // Get bounding box
            const rect = cv.boundingRect(contour);
            
            // Skip contours that touch the image border
            if (rect.x <= imageBoundary.left || 
                rect.y <= imageBoundary.top ||
                rect.x + rect.width >= imageBoundary.right ||
                rect.y + rect.height >= imageBoundary.bottom) {
              contour.delete();
              continue;
            }
            
            // Skip very small objects (width or height less than 20px)
            if (rect.width < 20 || rect.height < 20) {
              contour.delete();
              continue;
            }
            
            // Approximate contour to polygon
            const epsilon = 0.02 * cv.arcLength(contour, true);
            const approx = new cv.Mat();
            cv.approxPolyDP(contour, approx, epsilon, true);
            const points = [];
            for (let j = 0; j < approx.rows; j++) {
              points.push({x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1]});
            }
            
            // Calculate circularity
            const perimeter = cv.arcLength(contour, true);
            const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
            
            // Detect coins: high circularity, reasonable size, and aspect ratio close to 1
            const aspectRatio = rect.width / rect.height;
            const isCoin = circularity > 0.75 && 
                          area > 2000 && 
                          area < imageArea * 0.3 &&
                          aspectRatio > 0.8 && 
                          aspectRatio < 1.2;
            
            // Build edges
            const edgesList = [];
            for (let j = 0; j < points.length; j++) {
              const p1 = points[j], p2 = points[(j + 1) % points.length];
              const length = Math.sqrt((p2.x-p1.x)**2 + (p2.y-p1.y)**2);
              edgesList.push({start: p1, end: p2, pixelLength: length, realLength: null});
            }
            
            objects.push({
              id: objectId++,
              name: isCoin ? 'Coin' : `Object ${objectId-1}`,
              color: ['#3B82F6','#EF4444','#10B981','#F59E0B','#8B5CF6','#EC4899','#06B6D4', '#F97316'][(objectId-2)%8],
              contour: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
              points,
              edges: edgesList,
              area,
              perimeter,
              isCoin,
              pixelDistance: null,
              measurements: {edges: edgesList.map(e=>({pixelLength:e.pixelLength,realLength:null})), perimeter:null}
            });
            approx.delete();
            contour.delete();
          }
          src.delete(); gray.delete(); blurred.delete(); edges.delete(); contours.delete(); hierarchy.delete();
          resolve(objects);
        } catch (e) { reject(new Error('detectContours error: ' + e.message)); }
      };
      img.onerror = (e) => reject(new Error('detectContours failed to load image'));
      img.src = imageDataUrl;
    } catch (e) { reject(new Error('detectContours outer error: ' + e.message)); }
  });
}

export async function detectCoin(imageDataUrl) {
  const cv = await initOpenCV();
  return new Promise((resolve, reject) => {
    try {
      const img = new window.Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const src = cv.matFromImageData(imageData);
          const gray = new cv.Mat();
          const blurred = new cv.Mat();
          const edges = new cv.Mat();
          
          // Convert to grayscale
          cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
          
          // Apply bilateral filter
          cv.bilateralFilter(gray, blurred, 11, 80, 80);
          
          // Use Canny edge detection - reduced sensitivity
          cv.Canny(blurred, edges, 100, 200);
          
          // Dilate edges slightly
          const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(2, 2));
          cv.dilate(edges, edges, kernel);
          kernel.delete();
          
          const contours = new cv.MatVector();
          const hierarchy = new cv.Mat();
          cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
          
          let coinDiameter = null;
          const imageArea = canvas.width * canvas.height;
          
          // Calculate image boundary
          const imageBoundary = {
            left: 5,
            right: canvas.width - 5,
            top: 5,
            bottom: canvas.height - 5
          };
          
          for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const area = cv.contourArea(contour);
            
            // Skip small and very large areas
            if (area < 5000 || area > imageArea * 0.3) { 
              contour.delete(); 
              continue; 
            }
            
            const rect = cv.boundingRect(contour);
            
            // Skip very small objects
            if (rect.width < 30 || rect.height < 30) {
              contour.delete();
              continue;
            }
            
            // Skip contours touching image border
            if (rect.x <= imageBoundary.left || 
                rect.y <= imageBoundary.top ||
                rect.x + rect.width >= imageBoundary.right ||
                rect.y + rect.height >= imageBoundary.bottom) {
              contour.delete();
              continue;
            }
            
            // Calculate circularity and aspect ratio
            const perimeter = cv.arcLength(contour, true);
            const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
            const aspectRatio = rect.width / rect.height;
            
            // Coin detection: high circularity and aspect ratio close to 1
            console.log(`Contour ${i}: area=${area.toFixed(0)}, circ=${circularity.toFixed(3)}, aspect=${aspectRatio.toFixed(3)}`);
            if (circularity > 0.70 && aspectRatio > 0.75 && aspectRatio < 1.25) {
              coinDiameter = Math.max(rect.width, rect.height);
              console.log(`✓ Found coin! diameter=${coinDiameter}px`);
              contour.delete();
              break;
            }
            contour.delete();
          }
          
          src.delete(); gray.delete(); blurred.delete(); edges.delete(); contours.delete(); hierarchy.delete();
          
          if (coinDiameter) resolve(coinDiameter);
          else reject(new Error('No coin detected'));
        } catch (e) { reject(new Error('detectCoin error: ' + e.message)); }
      };
      img.onerror = (e) => reject(new Error('detectCoin failed to load image'));
      img.src = imageDataUrl;
    } catch (e) { reject(new Error('detectCoin outer error: ' + e.message)); }
  });
}

export function calculatePPM(pixelDistance) { return pixelDistance / COIN_DIAMETER_MM; }
export function calculatePixelDistance(p1, p2) { const dx = p2.x-p1.x, dy = p2.y-p1.y; return Math.sqrt(dx*dx+dy*dy); }
export function applyPPMToObject(obj, ppm) {
  if (!ppm || ppm <= 0) return obj;
  const updatedEdges = obj.edges.map(edge => ({...edge,realLength:Math.round((edge.pixelLength/ppm)*100)/100}));
  const realPerimeter = Math.round((obj.perimeter/ppm)*100)/100;
  return {
    ...obj,
    measurements:{edges:updatedEdges.map(e=>({pixelLength:e.pixelLength,realLength:e.realLength})),perimeter:realPerimeter}
  };
}