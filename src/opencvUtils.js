// Clean OpenCV.js loader for global-script usage
// No import of opencv-js -- loaded via <script> in index.html!

// $1 coin diameter in millimeters (Canadian Loonie)
// Note: Toonie is 28mm, Loonie is 26.5mm - adjust if using Toonie
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
          const thresh = new cv.Mat();
          
          // Convert to grayscale
          cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
          
          // 🔧 TUNING PARAMETER: Blur strength
          // Current: (7, 7) - Larger = more blur, less noise, but loses fine details
          // Try: (5, 5) for more detail, (9, 9) for cleaner detection
          cv.GaussianBlur(gray, blurred, new cv.Size(7, 7), 0);
          
          // Try multiple thresholding approaches and combine results
          const thresh1 = new cv.Mat();
          const thresh2 = new cv.Mat();
          
          // 🔧 TUNING PARAMETER: Adaptive threshold block size and C value
          // Current: block=11, C=2
          // Block size (must be odd): Larger = considers more neighbors (try 7, 9, 11, 13, 15)
          // C value: Subtracted from mean (try 1, 2, 3, 4, 5)
          // Increase C to detect fewer/cleaner objects, decrease for more sensitivity
          cv.adaptiveThreshold(blurred, thresh1, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);
          
          // Approach 2: Otsu's thresholding (good for solid backgrounds)
          cv.threshold(blurred, thresh2, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
          
          // Combine both approaches with bitwise OR
          cv.bitwise_or(thresh1, thresh2, thresh);
          thresh1.delete();
          thresh2.delete();
          
          // 🔧 TUNING PARAMETER: Morphological kernel size
          // Current: ELLIPSE (5, 5)
          // Larger = more aggressive cleanup, may merge close objects (try 3x3, 5x5, 7x7)
          // RECT vs ELLIPSE: ELLIPSE better for rounded shapes, RECT better for angular
          const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
          cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, kernel);
          cv.morphologyEx(thresh, thresh, cv.MORPH_OPEN, kernel);
          kernel.delete();
          
          const contours = new cv.MatVector();
          const hierarchy = new cv.Mat();
          cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
          
          const objects = [];
          const imageArea = canvas.width * canvas.height;
          
          // 🔧 TUNING PARAMETER: Image boundary buffer
          // Current: 10 pixels - Objects touching this border are ignored
          // Decrease to capture edge objects, increase to be more strict
          const imageBoundary = {
            left: 10,
            right: canvas.width - 10,
            top: 10,
            bottom: canvas.height - 10
          };
          
          console.log(`Found ${contours.size()} raw contours`);
          
          for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const area = cv.contourArea(contour);
            
            // 🔧 TUNING PARAMETER: Area filtering
            // Current: min=2000px², max=60% of image
            // DECREASE min to catch smaller objects (try 1000, 1500)
            // INCREASE min to ignore small noise (try 3000, 5000)
            // Adjust max % if objects are being rejected as "too large"
            if (area < 2000 || area > imageArea * 0.6) { 
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
            
            // 🔧 TUNING PARAMETER: Minimum object dimensions
            // Current: 30x30 pixels
            // DECREASE to detect smaller objects (try 20, 25)
            // INCREASE to filter out small noise (try 40, 50)
            if (rect.width < 30 || rect.height < 30) {
              contour.delete();
              continue;
            }
            
            // 🔧 TUNING PARAMETER: Polygon approximation accuracy
            // Current: epsilon = 0.015 * perimeter
            // DECREASE for more precise/detailed shapes (try 0.01)
            // INCREASE for simpler shapes with fewer points (try 0.02, 0.03)
            const epsilon = 0.015 * cv.arcLength(contour, true);
            const approx = new cv.Mat();
            cv.approxPolyDP(contour, approx, epsilon, true);
            const points = [];
            for (let j = 0; j < approx.rows; j++) {
              points.push({x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1]});
            }
            
            // Calculate circularity
            const perimeter = cv.arcLength(contour, true);
            const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
            
            // 🔧 TUNING PARAMETER: Coin detection thresholds
            // Current: circularity > 0.60, aspect 0.65-1.35
            // DECREASE circularity to catch imperfect circles (try 0.50, 0.55)
            // NARROW aspect ratio for stricter circles (try 0.75-1.25)
            // WIDEN aspect ratio for irregular coins (try 0.6-1.4)
            const aspectRatio = rect.width / rect.height;
            const isCoin = circularity > 0.60 &&  // Lowered for non-perfect circles
                          area > 2500 && 
                          area < imageArea * 0.4 &&
                          aspectRatio > 0.65 &&  // More tolerance for aspect ratio
                          aspectRatio < 1.35;
            
            // Build edges
            const edgesList = [];
            for (let j = 0; j < points.length; j++) {
              const p1 = points[j], p2 = points[(j + 1) % points.length];
              const length = Math.sqrt((p2.x-p1.x)**2 + (p2.y-p1.y)**2);
              edgesList.push({start: p1, end: p2, pixelLength: length, realLength: null});
            }
            
            objects.push({
              id: `obj_${Date.now()}_${i}`, // Unique ID using timestamp + index
              name: isCoin ? 'Coin' : `Object ${objects.filter(o => !o.isCoin).length + 1}`,
              color: ['#3B82F6','#EF4444','#10B981','#F59E0B','#8B5CF6','#EC4899','#06B6D4', '#F97316'][objects.length % 8],
              contour: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
              points,
              edges: edgesList,
              area,
              perimeter,
              isCoin,
              circularity,
              pixelDistance: null,
              measurements: {edges: edgesList.map(e=>({pixelLength:e.pixelLength,realLength:null})), perimeter:null}
            });
            
            console.log(`Object ${objects.length}: area=${area.toFixed(0)}, circ=${circularity.toFixed(3)}, aspect=${aspectRatio.toFixed(3)}, isCoin=${isCoin}`);
            
            approx.delete();
            contour.delete();
          }
          
          src.delete(); gray.delete(); blurred.delete(); thresh.delete(); contours.delete(); hierarchy.delete();
          console.log(`Detected ${objects.length} valid objects`);
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
          const thresh = new cv.Mat();
          
          // Convert to grayscale
          cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
          
          // 🔧 COIN TUNING: Blur strength for coin detection
          // Current: (9, 9) with sigma=2
          // INCREASE for noisier images: (11, 11) or sigma=3
          // DECREASE for clearer images: (7, 7) or sigma=1
          cv.GaussianBlur(gray, blurred, new cv.Size(9, 9), 2);
          
          // Try multiple thresholding approaches for better coin detection
          const thresh1 = new cv.Mat();
          const thresh2 = new cv.Mat();
          
          // 🔧 COIN TUNING: Adaptive threshold for shadows
          // Current: block=15, C=2
          // INCREASE block size for larger coins: 17, 19, 21
          // INCREASE C for cleaner detection: 3, 4, 5
          cv.adaptiveThreshold(blurred, thresh1, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 15, 2);
          
          // Approach 2: Otsu's thresholding (excellent for solid backgrounds)
          cv.threshold(blurred, thresh2, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
          
          // Combine both approaches
          cv.bitwise_or(thresh1, thresh2, thresh);
          thresh1.delete();
          thresh2.delete();
          
          // 🔧 COIN TUNING: Morphological kernel for circular cleanup
          // Current: ELLIPSE (7, 7)
          // INCREASE for rounder coins: (9, 9) or (11, 11)
          // DECREASE if coin edges are lost: (5, 5)
          const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(7, 7));
          cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, kernel);
          cv.morphologyEx(thresh, thresh, cv.MORPH_OPEN, kernel);
          kernel.delete();
          
          const contours = new cv.MatVector();
          const hierarchy = new cv.Mat();
          cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
          
          let coinDiameter = null;
          let bestCircularity = 0;
          const imageArea = canvas.width * canvas.height;
          
          // 🔧 COIN TUNING: Image boundary for coin detection
          // Current: 10 pixels
          // DECREASE if coin is near edges: 5
          // INCREASE for stricter center detection: 15, 20
          const imageBoundary = {
            left: 10,
            right: canvas.width - 10,
            top: 10,
            bottom: canvas.height - 10
          };
          
          console.log(`Coin detection: found ${contours.size()} contours`);
          
          for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const area = cv.contourArea(contour);
            
            // 🔧 COIN TUNING: Coin area filtering
            // Current: min=3000px², max=40% of image
            // DECREASE min for smaller coins in photo: 2000, 2500
            // INCREASE min for larger coins only: 4000, 5000
            // Adjust max % based on how much of frame coin occupies
            if (area < 3000 || area > imageArea * 0.4) { 
              contour.delete(); 
              continue; 
            }
            
            const rect = cv.boundingRect(contour);
            
            // 🔧 COIN TUNING: Minimum coin dimensions
            // Current: 40x40 pixels
            // DECREASE for smaller coins: 30, 35
            // INCREASE for larger coins: 50, 60
            if (rect.width < 40 || rect.height < 40) {
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
            
            console.log(`Coin candidate ${i}: area=${area.toFixed(0)}, circ=${circularity.toFixed(3)}, aspect=${aspectRatio.toFixed(3)}, width=${rect.width}, height=${rect.height}`);
            
            // 🔧 COIN TUNING: Circularity and aspect ratio thresholds
            // Current: circularity > 0.55, aspect 0.65-1.35
            // For PERFECT CIRCLES: increase circularity to 0.70, narrow aspect to 0.8-1.2
            // For IRREGULAR COINS: decrease circularity to 0.45-0.50, widen aspect to 0.6-1.4
            // For WORN COINS: decrease circularity to 0.50
            if (circularity > 0.55 && aspectRatio > 0.65 && aspectRatio < 1.35) {
              if (circularity > bestCircularity) {
                bestCircularity = circularity;
                coinDiameter = Math.max(rect.width, rect.height);
                console.log(`  ✓ New best coin candidate! diameter=${coinDiameter}px, circularity=${circularity.toFixed(3)}`);
              }
            }
            contour.delete();
          }
          
          src.delete(); gray.delete(); blurred.delete(); thresh.delete(); contours.delete(); hierarchy.delete();
          
          if (coinDiameter) {
            console.log(`✓ Final coin detected: ${coinDiameter}px`);
            resolve(coinDiameter);
          } else {
            console.log('✗ No coin detected');
            reject(new Error('No coin detected. Try: 1) Better lighting, 2) Plain background, 3) Manual calibration'));
          }
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
  
  // Convert all edge measurements to mm
  const updatedEdges = obj.edges.map(edge => ({
    ...edge,
    realLength: Math.round((edge.pixelLength / ppm) * 100) / 100
  }));
  
  // Convert perimeter to mm
  const realPerimeter = Math.round((obj.perimeter / ppm) * 100) / 100;
  
  return {
    ...obj,
    edges: updatedEdges,  // Update the edges array directly
    measurements: {
      edges: updatedEdges.map(e => ({
        pixelLength: e.pixelLength,
        realLength: e.realLength
      })),
      perimeter: realPerimeter
    }
  };
}