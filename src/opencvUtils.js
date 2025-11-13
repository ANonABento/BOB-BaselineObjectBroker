/**
 * @fileoverview Utility functions for integrating with OpenCV.js to perform object detection, 
 * contour analysis, and real-world measurement calibration using a reference coin.
 * * OpenCV.js must be loaded globally via a <script> tag before these functions are called.
 */

// $1 coin diameter in millimeters (Canadian Loonie)
// Note: Toonie is 28mm, Loonie is 26.5mm - adjust if using a different coin
export const COIN_DIAMETER_MM = 26.5;

/**
 * Ensures the global OpenCV (window.cv) is fully loaded and initialized.
 * Handles cases where the global variable might be a Promise waiting to resolve.
 * @returns {Promise<any>} Resolves with the cv object when ready.
 */
export async function initOpenCV() {
  // If OpenCV is already patched and ready, return it
  if (window.cv && window.cv.Mat) return window.cv;

  // If window.cv is a Promise, await it, then patch it back
  if (window.cv && typeof window.cv.then === "function") {
    window.cv = await window.cv;
    if (window.cv.Mat) return window.cv;
  }

  // Wait for script to load and initialize (polling method)
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function tryReady() {
      if (window.cv && window.cv.Mat) return resolve(window.cv);
      // Timeout after 30 seconds
      if (Date.now() - start > 30000) return reject(new Error("OpenCV.js failed to load in 30s"));
      setTimeout(tryReady, 100);
    }
    tryReady();
  });
}

/**
 * Internal helper to load an image URL into an OpenCV Mat object.
 * @param {any} cv The OpenCV global object.
 * @param {string} imageDataUrl Base64 data URL of the image.
 * @returns {Promise<{mat: any, width: number, height: number}>} Mat object and dimensions.
 */
async function loadImageToMat(cv, imageDataUrl) {
  return new Promise((resolve, reject) => {
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
        resolve({ mat: src, width: img.width, height: img.height });
      } catch (e) {
        reject(new Error('Image processing failed: ' + e.message));
      }
    };
    img.onerror = () => reject(new Error('Failed to load image for OpenCV processing.'));
    img.src = imageDataUrl;
  });
}

/**
 * Detects and analyzes object contours in an image.
 * @param {string} imageDataUrl Base64 data URL of the image.
 * @returns {Promise<Array<object>>} Array of detected objects with contours and measurements.
 */
export async function detectContours(imageDataUrl) {
  const cv = await initOpenCV();
  // Removed old thresholding mats
  let src = null, bgr = null, hsv = null, channels = null, v_channel = null, canny = null, thresh = null;
  let kernel = null;
  let contours = null, hierarchy = null;

  try {
    const loaded = await loadImageToMat(cv, imageDataUrl);
    src = loaded.mat;
    const canvasWidth = loaded.width;
    const canvasHeight = loaded.height;

    // Initialize Mats
    bgr = new cv.Mat();
    hsv = new cv.Mat();
    channels = new cv.MatVector();
    v_channel = new cv.Mat();
    canny = new cv.Mat(); // New Canny Mat
    thresh = new cv.Mat();

    // 1. Preprocessing (V-channel for robust edge detection input)
    cv.cvtColor(src, bgr, cv.COLOR_RGBA2BGR);
    cv.cvtColor(bgr, hsv, cv.COLOR_BGR2HSV);
    cv.split(hsv, channels);
    v_channel = channels.get(2);
    
    // 2. Edge Detection (Robust against shadows and internal dirt)
    // Use Canny to find the boundaries of objects
    // Thresholds 100 and 200 are standard for general edge detection
    cv.Canny(v_channel, canny, 100, 200, 3, false); 
    
    // 3. Morphological Operations (Fill in the object shape)
    // Use DILATE and CLOSE to turn the thin edges into solid objects.
    // 🔧 TUNING PARAMETER: Kernel size increased slightly to better fill gaps
    kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(9, 9)); 
    cv.dilate(canny, thresh, kernel); // Thicken the edges
    cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, kernel); // Close any remaining holes
    
    // 4. Find Contours
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    
    const objects = [];
    const imageArea = canvasWidth * canvasHeight;
    const imageBoundary = {
      left: 10, right: canvasWidth - 10, top: 10, bottom: canvasHeight - 10
    };
    
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      
      // 🔧 FILTER 1: Area filtering (min=3000px², max=50% of image)
      if (area < 3000 || area > imageArea * 0.5) { 
        contour.delete(); 
        continue; 
      }
      
      const rect = cv.boundingRect(contour);
      
      // 🔧 FILTER 2: Boundary check (ignore objects touching a 10px border)
      if (rect.x <= imageBoundary.left || rect.y <= imageBoundary.top ||
          rect.x + rect.width >= imageBoundary.right ||
          rect.y + rect.height >= imageBoundary.bottom) {
        contour.delete();
        continue;
      }
      
      // 🔧 FILTER 3: Minimum object dimensions (30x30 pixels)
      if (rect.width < 30 || rect.height < 30) {
        contour.delete();
        continue;
      }
      
      // 5. Contour Approximation and Analysis
      const epsilon = 0.015 * cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, epsilon, true);
      
      const points = [];
      for (let j = 0; j < approx.rows; j++) {
        points.push({x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1]});
      }
      
      const perimeter = cv.arcLength(contour, true);
      const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
      const aspectRatio = rect.width / rect.height;

      // 🔧 COIN DETECTION CHECK
      // Circularity > 0.60, Aspect Ratio 0.65-1.35
      const isCoin = circularity > 0.60 && area > 2500 && area < imageArea * 0.4 &&
                     aspectRatio > 0.65 && aspectRatio < 1.35;
      
      // Build edges data structure
      const edgesList = [];
      for (let j = 0; j < points.length; j++) {
        const p1 = points[j], p2 = points[(j + 1) % points.length];
        const length = calculatePixelDistance(p1, p2);
        edgesList.push({start: p1, end: p2, pixelLength: length, realLength: null});
      }
      
      objects.push({
        id: `obj_${Date.now()}_${i}`,
        name: isCoin ? 'Coin' : `Object ${objects.filter(o => !o.isCoin).length + 1}`,
        color: ['#3B82F6','#EF4444','#10B981','#F59E0B','#8B5CF6','#EC4899','#06B6D4', '#F97316'][objects.length % 8],
        contour: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
        points,
        edges: edgesList,
        area,
        perimeter,
        isCoin,
        circularity,
        measurements: {
          edges: edgesList.map(e => ({pixelLength: e.pixelLength, realLength: null})),
          perimeter: null
        }
      });
      
      // Clean up contour-specific Mats
      approx.delete();
      contour.delete();
    }
    
    console.log(`OpenCV: Successfully detected ${objects.length} valid objects.`);
    return objects;

  } catch (e) {
    console.error('detectContours failed:', e);
    throw new Error('Contour detection failed during processing: ' + e.message);
  } finally {
    // Crucial: Delete all intermediate Mats to prevent memory leaks
    if (src) src.delete();
    if (bgr) bgr.delete();
    if (hsv) hsv.delete();
    if (v_channel) v_channel.delete();
    if (canny) canny.delete();
    if (thresh) thresh.delete();
    if (kernel) kernel.delete();
    if (contours) contours.delete();
    if (hierarchy) hierarchy.delete();
  }
}

/**
 * Specifically targets and measures the pixel diameter of the largest, most circular coin candidate.
 * @param {string} imageDataUrl Base64 data URL of the image.
 * @returns {Promise<{pixelDiameter: number, found: boolean, message: string}>} The detected pixel diameter of the coin.
 */
export async function detectCoin(imageDataUrl) {
  const cv = await initOpenCV();
  // Removed old thresholding mats
  let src = null, bgr = null, hsv = null, channels = null, v_channel = null, canny = null, thresh = null;
  let kernel = null;
  let contours = null, hierarchy = null;

  try {
    const loaded = await loadImageToMat(cv, imageDataUrl);
    src = loaded.mat;
    const canvasWidth = loaded.width;
    const canvasHeight = loaded.height;

    // Initialize Mats
    bgr = new cv.Mat();
    hsv = new cv.Mat();
    channels = new cv.MatVector();
    v_channel = new cv.Mat();
    canny = new cv.Mat(); // New Canny Mat
    thresh = new cv.Mat();

    // 1. Preprocessing (V-channel for robust edge detection input)
    cv.cvtColor(src, bgr, cv.COLOR_RGBA2BGR);
    cv.cvtColor(bgr, hsv, cv.COLOR_BGR2HSV);
    cv.split(hsv, channels);
    v_channel = channels.get(2);

    // 2. Edge Detection (Tuned for Coins)
    // Canny to find the circular edge of the coin
    cv.Canny(v_channel, canny, 100, 200, 3, false); 
    
    // 3. Morphological Operations (Fill in the coin shape)
    // 🔧 COIN TUNING: Larger kernel for more aggressive closing/filling, essential for dirty coins.
    kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(15, 15)); 
    cv.dilate(canny, thresh, kernel); 
    cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, kernel); 
    
    // 4. Find Contours
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    
    let coinDiameter = null;
    let bestCircularity = 0;
    const imageArea = canvasWidth * canvasHeight;
    const imageBoundary = {
      left: 10, right: canvasWidth - 10, top: 10, bottom: canvasHeight - 10
    };
    
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      
      // 🔧 COIN FILTER 1: Area filtering (min=3000px², max=40% of image)
      if (area < 3000 || area > imageArea * 0.4) { 
        contour.delete(); 
        continue; 
      }
      
      const rect = cv.boundingRect(contour);
      
      // 🔧 COIN FILTER 2: Minimum coin dimensions (40x40 pixels)
      if (rect.width < 40 || rect.height < 40) {
        contour.delete();
        continue;
      }
      
      // 🔧 COIN FILTER 3: Boundary check
      if (rect.x <= imageBoundary.left || rect.y <= imageBoundary.top ||
          rect.x + rect.width >= imageBoundary.right ||
          rect.y + rect.height >= imageBoundary.bottom) {
        contour.delete();
        continue;
      }
      
      // 5. Analysis
      const perimeter = cv.arcLength(contour, true);
      const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
      const aspectRatio = rect.width / rect.height;
      
      // 🔧 COIN FILTER 4: Circularity > 0.45 and Aspect Ratio 0.6-1.4
      if (circularity > 0.45 && aspectRatio > 0.6 && aspectRatio < 1.4) {
        if (circularity > bestCircularity) {
          bestCircularity = circularity;
          coinDiameter = Math.max(rect.width, rect.height);
        }
      }
      contour.delete();
    }
    
    if (coinDiameter) {
      console.log(`OpenCV: Coin detected with diameter: ${coinDiameter}px`);
      return { pixelDiameter: coinDiameter, found: true, message: 'Coin successfully detected for calibration.' };
    } else {
      return { pixelDiameter: null, found: false, message: 'No suitable coin found for calibration.' };
    }
  } catch (e) {
    console.error('detectCoin failed:', e);
    return { pixelDiameter: null, found: false, message: 'Coin detection failed during processing: ' + e.message };
  } finally {
    // Crucial: Delete all intermediate Mats to prevent memory leaks
    if (src) src.delete();
    if (bgr) bgr.delete();
    if (hsv) hsv.delete();
    if (v_channel) v_channel.delete();
    if (canny) canny.delete();
    if (thresh) thresh.delete();
    if (kernel) kernel.delete();
    if (contours) contours.delete();
    if (hierarchy) hierarchy.delete();
  }
}

/**
 * Calculates the real-world distance in pixels per millimeter (PPM).
 * @param {number} pixelDistance The diameter of the coin in pixels.
 * @returns {number} Pixels per Millimeter (PPM).
 */
export function calculatePPM(pixelDistance) { 
  return pixelDistance / COIN_DIAMETER_MM; 
}

/**
 * Calculates the Euclidean distance between two points.
 * @param {{x: number, y: number}} p1 Start point.
 * @param {{x: number, y: number}} p2 End point.
 * @returns {number} The pixel distance.
 */
export function calculatePixelDistance(p1, p2) { 
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy); 
}

/**
 * Applies the calculated Pixels-Per-Millimeter ratio to an object's pixel measurements
 * to determine real-world measurements in millimeters.
 * @param {object} obj The object output from detectContours.
 * @param {number} ppm The Pixels Per Millimeter ratio.
 * @returns {object} The updated object with realLength values in millimeters.
 */
export function applyPPMToObject(obj, ppm) {
  if (!ppm || ppm <= 0) return obj;
  
  // Convert all edge measurements to mm
  const updatedEdges = obj.edges.map(edge => ({
    ...edge,
    realLength: Math.round((edge.pixelLength / ppm) * 100) / 100 // Round to 2 decimal places
  }));
  
  // Convert perimeter to mm
  const realPerimeter = Math.round((obj.perimeter / ppm) * 100) / 100;
  
  return {
    ...obj,
    edges: updatedEdges, // Update the edges array directly
    measurements: {
      edges: updatedEdges.map(e => ({
        pixelLength: e.pixelLength,
        realLength: e.realLength
      })),
      perimeter: realPerimeter
    }
  };
}