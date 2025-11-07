import cv from '@techstark/opencv-js';

// $1 coin diameter in millimeters
export const COIN_DIAMETER_MM = 26.5;

// Color palette for objects
const COLORS = [
  '#3B82F6', // Blue
  '#EF4444', // Red
  '#10B981', // Green
  '#F59E0B', // Amber
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
];

let cvReady = false;

// Initialize OpenCV
export async function initOpenCV() {
  if (cvReady) return true;
  
  return new Promise((resolve, reject) => {
    try {
      // Check if OpenCV is already loaded
      if (typeof cv !== 'undefined' && cv.Mat) {
        if (cv.getBuildInformation) {
          cvReady = true;
          resolve(true);
          return;
        }
      }
      
      // Wait for OpenCV to initialize
      if (typeof cv !== 'undefined') {
        if (cv.onRuntimeInitialized) {
          cv.onRuntimeInitialized = () => {
            cvReady = true;
            resolve(true);
          };
        } else {
          // Already initialized
          cvReady = true;
          resolve(true);
        }
      } else {
        reject(new Error('OpenCV is not loaded'));
      }
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Detect contours in an image using OpenCV
 * @param {string} imageDataUrl - Base64 image data URL
 * @returns {Promise<Array>} Array of detected objects with contours
 */
export async function detectContours(imageDataUrl) {
  await initOpenCV();
  
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();
      img.onload = () => {
        // Create canvas to get image data
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Convert to OpenCV Mat
        const src = cv.matFromImageData(imageData);
        const gray = new cv.Mat();
        const blurred = new cv.Mat();
        const thresh = new cv.Mat();
        
        // Convert to grayscale
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        
        // Apply Gaussian blur
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
        
        // Apply threshold
        cv.threshold(blurred, thresh, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
        
        // Find contours
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        
        const objects = [];
        let objectId = 1;
        
        // Process each contour
        for (let i = 0; i < contours.size(); i++) {
          const contour = contours.get(i);
          const area = cv.contourArea(contour);
          
          // Filter out very small contours (noise)
          if (area < 500) {
            contour.delete();
            continue;
          }
          
          // Get bounding rect
          const rect = cv.boundingRect(contour);
          
          // Approximate contour to polygon
          const epsilon = 0.02 * cv.arcLength(contour, true);
          const approx = new cv.Mat();
          cv.approxPolyDP(contour, approx, epsilon, true);
          
          // Extract points from contour
          const points = [];
          for (let j = 0; j < approx.rows; j++) {
            points.push({
              x: approx.data32S[j * 2],
              y: approx.data32S[j * 2 + 1]
            });
          }
          
          // Check if this might be a coin (circular shape)
          const perimeter = cv.arcLength(contour, true);
          const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
          const isCoin = circularity > 0.7 && area > 1000 && area < 50000;
          
          // Calculate edge lengths
          const edges = [];
          for (let j = 0; j < points.length; j++) {
            const p1 = points[j];
            const p2 = points[(j + 1) % points.length];
            const length = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
            edges.push({
              start: p1,
              end: p2,
              pixelLength: length,
              realLength: null // Will be calculated when PPM is available
            });
          }
          
          objects.push({
            id: objectId++,
            name: isCoin ? 'Coin' : `Object ${objectId - 1}`,
            color: COLORS[(objectId - 2) % COLORS.length],
            contour: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            },
            points: points, // Actual contour points
            edges: edges, // Edge segments with lengths
            area: area,
            perimeter: perimeter,
            isCoin: isCoin,
            pixelDistance: null,
            measurements: {
              edges: edges.map(e => ({ pixelLength: e.pixelLength, realLength: null })),
              perimeter: null
            }
          });
          
          approx.delete();
          contour.delete();
        }
        
        // Cleanup
        src.delete();
        gray.delete();
        blurred.delete();
        thresh.delete();
        contours.delete();
        hierarchy.delete();
        
        resolve(objects);
      };
      
      img.onerror = (error) => {
        reject(error);
      };
      
      img.src = imageDataUrl;
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Auto-detect coin and return its pixel diameter
 * @param {string} imageDataUrl - Base64 image data URL
 * @returns {Promise<number>} Pixel diameter of the coin
 */
export async function detectCoin(imageDataUrl) {
  await initOpenCV();
  
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();
      img.onload = () => {
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
        
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
        cv.threshold(blurred, thresh, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
        
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        
        let coinDiameter = null;
        
        // Find the most circular contour (coin)
        for (let i = 0; i < contours.size(); i++) {
          const contour = contours.get(i);
          const area = cv.contourArea(contour);
          
          if (area < 1000 || area > 50000) {
            contour.delete();
            continue;
          }
          
          const perimeter = cv.arcLength(contour, true);
          const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
          
          if (circularity > 0.7) {
            const rect = cv.boundingRect(contour);
            // Use the larger dimension as diameter
            coinDiameter = Math.max(rect.width, rect.height);
            contour.delete();
            break;
          }
          
          contour.delete();
        }
        
        // Cleanup
        src.delete();
        gray.delete();
        blurred.delete();
        thresh.delete();
        contours.delete();
        hierarchy.delete();
        
        if (coinDiameter) {
          resolve(coinDiameter);
        } else {
          reject(new Error('No coin detected'));
        }
      };
      
      img.onerror = reject;
      img.src = imageDataUrl;
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Calculate Pixels Per Millimeter (PPM)
 * @param {number} pixelDistance - Distance in pixels
 * @returns {number} PPM value
 */
export function calculatePPM(pixelDistance) {
  return pixelDistance / COIN_DIAMETER_MM;
}

/**
 * Calculate pixel distance between two points
 * @param {Object} point1 - { x, y }
 * @param {Object} point2 - { x, y }
 * @returns {number} Distance in pixels
 */
export function calculatePixelDistance(point1, point2) {
  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Apply PPM to an object and calculate real-world measurements
 * @param {Object} object - Object with edges and pixel measurements
 * @param {number} ppm - Pixels per millimeter
 * @returns {Object} Object with updated real-world measurements
 */
export function applyPPMToObject(object, ppm) {
  if (!ppm || ppm <= 0) return object;
  
  const updatedEdges = object.edges.map(edge => ({
    ...edge,
    realLength: Math.round((edge.pixelLength / ppm) * 100) / 100
  }));
  
  const realPerimeter = Math.round((object.perimeter / ppm) * 100) / 100;
  
  return {
    ...object,
    measurements: {
      edges: updatedEdges.map(e => ({ 
        pixelLength: e.pixelLength, 
        realLength: e.realLength 
      })),
      perimeter: realPerimeter
    }
  };
}

