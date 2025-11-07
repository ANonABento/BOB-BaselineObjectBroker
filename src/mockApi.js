// Mock API functions to simulate OpenCV backend operations

// $1 coin diameter in millimeters
const COIN_DIAMETER_MM = 26.5;

/**
 * Simulates image upload and contour detection
 * Returns mock objects with pixel coordinates
 */
export async function mockUploadAndDetect(imageData) {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Return mock detected objects (Lego blocks and coin)
  // These would normally come from OpenCV contour detection
  return {
    objects: [
      {
        id: 1,
        name: 'Lego Block 1',
        color: '#3B82F6', // Blue
        contour: { x: 100, y: 150, width: 80, height: 40 }, // Simulated bounding box
        pixelDistance: null, // Will be calculated when measurement is added
        measurements: { width: null, height: null }, // Real world measurements in mm
        isCoin: false,
      },
      {
        id: 2,
        name: 'Lego Block 2',
        color: '#EF4444', // Red
        contour: { x: 250, y: 200, width: 120, height: 40 },
        pixelDistance: null,
        measurements: { width: null, height: null },
        isCoin: false,
      },
      {
        id: 3,
        name: 'Lego Block 3',
        color: '#10B981', // Green
        contour: { x: 400, y: 180, width: 60, height: 60 },
        pixelDistance: null,
        measurements: { width: null, height: null },
        isCoin: false,
      },
      {
        id: 4,
        name: 'Coin',
        color: '#F59E0B', // Amber
        contour: { x: 500, y: 100, width: 100, height: 100 }, // Circular coin as square bounding box
        pixelDistance: 100, // Pixel diameter of coin
        measurements: { width: COIN_DIAMETER_MM, height: COIN_DIAMETER_MM },
        isCoin: true,
      },
    ],
    coinContour: { x: 500, y: 100, width: 100, height: 100 }, // Coin location for auto-detection
  };
}

/**
 * Simulates automatic coin detection
 * Returns the pixel diameter of the detected coin
 */
export async function mockCalibrateAuto() {
  await new Promise(resolve => setTimeout(resolve, 300));
  // Return the pixel diameter of the coin (100 pixels in this mock)
  return 100;
}

/**
 * Calculates Pixels Per Millimeter (PPM) based on pixel distance
 * @param {number} pixelDistance - Distance in pixels
 * @returns {number} PPM value
 */
export function mockCalculatePPM(pixelDistance) {
  return pixelDistance / COIN_DIAMETER_MM;
}

/**
 * Calculates real-world measurements from pixel measurements
 * @param {Object} object - Object with pixelDistance
 * @param {number} ppm - Pixels per millimeter
 * @returns {Object} Measurements in millimeters
 */
export function mockMeasure(object, ppm) {
  if (!object.pixelDistance || !ppm) {
    return { width: null, height: null };
  }
  
  // Calculate measurements based on the object's pixel distance
  // For simplicity, we'll use the contour dimensions
  const widthMM = (object.contour.width / ppm);
  const heightMM = (object.contour.height / ppm);
  
  return {
    width: Math.round(widthMM * 100) / 100, // Round to 2 decimal places
    height: Math.round(heightMM * 100) / 100,
  };
}

/**
 * Calculates pixel distance between two points
 * @param {Object} point1 - { x, y }
 * @param {Object} point2 - { x, y }
 * @returns {number} Distance in pixels
 */
export function calculatePixelDistance(point1, point2) {
  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

